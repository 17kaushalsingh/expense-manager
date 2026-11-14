import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { app } from "../app";
import { calculateAdjustments } from "../../../frontend/src/lib/adjustments";
import { allocation } from "../../../frontend/src/lib/device/splits";
dotenv.config({ path: ".env.integration.local", quiet: true });

describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== "1")(
  "hosted adjustment splits",
  () => {
    let server: Server, base: string, group: string;
    const clients: SupabaseClient[] = [],
      tokens: string[] = [],
      users: string[] = [],
      accounts: string[] = [],
      splits: string[] = [],
      settlements: string[] = [];
    async function api(
      path: string,
      method = "GET",
      body?: unknown,
      actor = 0,
    ) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${tokens[actor]}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      return {
        status: r.status,
        data: r.status === 204 ? null : await r.json(),
      };
    }
    function body(total = 30, extras = [3, 0, 0]) {
      return {
        groupId: group,
        description: "Synthetic adjusted meal",
        totalAmount: total,
        splitType: "ADJUSTMENT",
        date: new Date().toISOString(),
        participants: users.map((userId, i) => ({
          userId,
          shareValue: extras[i],
        })),
        payers: [
          { userId: users[0], amountPaid: total, accountId: accounts[0] },
        ],
      };
    }
    async function create(value = body()) {
      const r = await api("/splits", "POST", value);
      expect(r.status, JSON.stringify(r.data)).toBe(201);
      splits.push(r.data.id);
      return r.data;
    }
    beforeAll(async () => {
      for (const letter of ["a", "b", "c"]) {
        const c = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const r = await c.auth.signInWithPassword({
          email: `http-${letter}@example.invalid`,
          password: process.env.SUPABASE_TEST_PASSWORD!,
        });
        if (r.error) throw r.error;
        clients.push(c);
        tokens.push(r.data.session!.access_token);
        users.push(r.data.user!.id);
      }
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      for (let actor = 0; actor < 3; actor++) {
        const r = await api(
          "/accounts",
          "POST",
          {
            name: "Synthetic adjustment cash",
            type: "CASH",
            currency: "USD",
            balance: 100,
          },
          actor,
        );
        expect(r.status).toBe(201);
        accounts.push(r.data.id);
      }
      const g = await api("/groups", "POST", {
        name: "Synthetic adjustment group",
        memberIds: users.slice(1),
      });
      expect(g.status).toBe(201);
      group = g.data.id;
    });
    afterEach(async () => {
      for (const id of settlements.splice(0))
        expect(
          (await api(`/settlements/${id}/reverse`, "POST", {})).status,
        ).toBe(200);
      for (const id of splits.splice(0))
        expect((await api(`/splits/${id}`, "DELETE")).status).toBe(204);
    });
    afterAll(async () => {
      if (group)
        expect((await api(`/groups/${group}`, "DELETE")).status).toBe(204);
      for (let actor = 0; actor < accounts.length; actor++)
        expect(
          (
            await api(
              `/accounts/${accounts[actor]}`,
              "DELETE",
              undefined,
              actor,
            )
          ).status,
        ).toBe(204);
      await Promise.all(clients.map((c) => c.auth.signOut({ scope: "local" })));
      if (server)
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
    });

    it.each([
      [30, [3, 0, 0]],
      [30, [-5, 0, 0]],
      [0.02, [0, 0, 0]],
    ])(
      "independently normalizes signed extras for total %s",
      async (total, extras) => {
        const b = body(total as number, extras as number[]),
          s = await create(b),
          expected = calculateAdjustments(b.totalAmount, b.participants);
        expect(s.splitType).toBe("ADJUSTMENT");
        expect(s.adjustments).toEqual(b.participants);
        for (const p of expected)
          expect(
            Number(
              s.participants.find(
                (v: { userId: string }) => v.userId === p.userId,
              ).amountOwed,
            ),
          ).toBe(p.amountOwed);
        expect(
          allocation(b.totalAmount, b.splitType, b.participants, b.payers),
        ).toEqual(expected);
        const saved = await clients[0]
          .from("split_expenses")
          .select("split_type,adjustments")
          .eq("id", s.id)
          .single();
        expect(saved.error).toBeNull();
        expect(saved.data).toEqual({
          split_type: "ADJUSTMENT",
          adjustments: b.participants,
        });
        const search = await api(
          "/splits/search?splitType=ADJUSTMENT&groupId=" + group,
        );
        expect(search.status).toBe(200);
        expect(JSON.stringify(search.data)).toContain(s.id);
        for (let actor = 0; actor < 3; actor++) {
          const entries = await clients[actor]
            .from("transactions")
            .select("analytics_amount")
            .eq("source_id", s.id);
          expect(entries.error).toBeNull();
          expect(
            entries.data!.reduce((n, t) => n + Number(t.analytics_amount), 0),
          ).toBe(expected[actor].amountOwed);
        }
      },
    );

    it("rejects invalid extras and forged exact shares without changing balances", async () => {
      const before = (await api(`/accounts/${accounts[0]}`)).data.balance;
      const invalid = [
        body(1, [-2, 0, 0]),
        body(1, [0.001, 0, 0]),
        {
          ...body(),
          participants: [body().participants[0], body().participants[0]],
        },
        {
          ...body(),
          participants: [{ userId: crypto.randomUUID(), shareValue: 0 }],
        },
        {
          ...body(),
          itemization: {
            items: [
              { label: "Cannot combine", amount: 30, participantIds: users },
            ],
            tax: 0,
            tip: 0,
          },
        },
      ];
      for (const b of invalid) {
        const r = await api("/splits", "POST", b);
        expect(r.status, JSON.stringify(r.data)).toBe(400);
      }
      const direct = await clients[0].rpc("create_split_expense_atomic", {
        p_input: {
          ...body(),
          participants: body().participants.map((p) => ({
            ...p,
            amountOwed: 0,
          })),
        },
      });
      expect(direct.error).not.toBeNull();
      expect((await api(`/accounts/${accounts[0]}`)).data.balance).toBe(before);
    });

    it("supports multiple payers while keeping their private account choices isolated", async () => {
      const b = body(),
        value = {
          ...b,
          payers: [
            { userId: users[0], amountPaid: 15, accountId: accounts[0] },
            { userId: users[1], amountPaid: 15 },
          ],
        };
      const s = await create(value);
      expect(s.payers).toHaveLength(2);
      expect(
        s.payers.find((p: { userId: string }) => p.userId === users[1])
          .accountId,
      ).toBeUndefined();
      expect(
        s.participants
          .map((p: { amountOwed: number }) => Number(p.amountOwed))
          .sort((a: number, b: number) => a - b),
      ).toEqual([9, 9, 12]);
      const foreign = await api(`/splits/${s.id}`, "PUT", {
        ...value,
        payers: value.payers.map((p) => ({ ...p, accountId: accounts[0] })),
      });
      expect(foreign.status).toBe(400);
      const other = await api(`/splits/group/${group}`, "GET", undefined, 1);
      const visible = other.data.find((p: { id: string }) => p.id === s.id);
      expect(
        visible.payers.find((p: { userId: string }) => p.userId === users[0])
          .accountId,
      ).toBeUndefined();
    });

    it("edits between modes, preserves intent through recovery and respects settlement history", async () => {
      const s = await create(),
        b = body(30, [-5, 0, 0]);
      const edited = await api(`/splits/${s.id}`, "PUT", b);
      expect(edited.status, JSON.stringify(edited.data)).toBe(200);
      expect(edited.data.adjustments).toEqual(b.participants);
      expect((await api(`/splits/${s.id}`, "DELETE")).status).toBe(204);
      const restored = await api(`/splits/${s.id}/restore`, "POST", {});
      expect(restored.status, JSON.stringify(restored.data)).toBe(200);
      const saved = await clients[0]
        .from("split_expenses")
        .select("adjustments")
        .eq("id", s.id)
        .single();
      expect(saved.data!.adjustments).toEqual(b.participants);
      const exact = {
        ...body(),
        splitType: "EXACT",
        participants: users.map((userId) => ({ userId, shareValue: 10 })),
      };
      const standard = await api(`/splits/${s.id}`, "PUT", exact);
      expect(standard.status).toBe(200);
      expect(standard.data.adjustments).toBeNull();
      const payment = await api(
        "/settlements",
        "POST",
        {
          groupId: group,
          payeeId: users[0],
          accountId: accounts[1],
          amount: 1,
          method: "CASH",
        },
        1,
      );
      settlements.push(payment.data.id);
      expect(payment.status, JSON.stringify(payment.data)).toBe(200);
      expect((await api(`/splits/${s.id}`, "PUT", b)).status).toBe(400);
      expect((await api(`/splits/${s.id}`, "DELETE")).status).toBe(400);
    });

    it("retains signed template defaults and rejects incomplete activation and private fields", async () => {
      const b = body(30, [-5, 0, 0]);
      const { groupId, date, ...payload } = b;
      payload.payers = payload.payers.map(({ userId, amountPaid }) => ({
        userId,
        amountPaid,
      })) as typeof payload.payers;
      const t = await api(`/templates/groups/${group}`, "POST", {
        name: "Synthetic adjusted rent",
        payload,
      });
      expect(t.status, JSON.stringify(t.data)).toBe(201);
      expect(t.data.payload.participants).toEqual(payload.participants);
      const invalid = await api(`/templates/groups/${group}`, "POST", {
        name: "Bad adjustment",
        payload: {
          ...payload,
          participants: users.map((userId, i) => ({
            userId,
            shareValue: i === 0 ? -100 : 0,
          })),
        },
      });
      expect(invalid.status).toBe(400);
      const privateInput = await clients[0].rpc("manage_split_template", {
        p_group_id: group,
        p_input: {
          name: "Private field",
          payload: { ...payload, payers: b.payers },
        },
      });
      expect(privateInput.error).not.toBeNull();
      const optional = await api(`/templates/groups/${group}`, "POST", {
        name: "Synthetic variable adjustment",
        payload: {
          ...payload,
          totalAmount: null,
          payers: [{ userId: users[0] }],
        },
      });
      expect(optional.status).toBe(201);
      const activate = await api("/recurring/schedules", "POST", {
        templateId: optional.data.id,
        frequency: "MONTHLY",
        startDate: "2026-11-14",
        timezone: "Asia/Kolkata",
      });
      expect(activate.status).toBe(400);
      for (const id of [t.data.id, optional.data.id])
        expect(
          (await api(`/templates/groups/${group}/${id}`, "DELETE")).status,
        ).toBe(204);
      void groupId;
      void date;
    });
  },
);
