import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import dotenv from "dotenv";
import { app } from "../app";
dotenv.config({ path: ".env.integration.local", quiet: true });
const A = "55555555-5555-4555-8555-555555555555",
  B = "66666666-6666-4666-8666-666666666666";
describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== "1")(
  "hosted Splitwise parity: search, reports, defaults and reversals",
  () => {
    let server: Server,
      base: string,
      group: string,
      account: string,
      split: string,
      template: string;
    const clients: SupabaseClient[] = [],
      tokens: string[] = [];
    async function api(
      path: string,
      method = "GET",
      body?: unknown,
      actor = 0,
    ) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens[actor]}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        data: response.headers.get("content-type")?.includes("application/json")
          ? JSON.parse(text)
          : text,
      };
    }
    beforeAll(async () => {
      for (const email of [
        "http-a@example.invalid",
        "http-b@example.invalid",
        "http-c@example.invalid",
      ]) {
        const c = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await c.auth.signInWithPassword({
          email,
          password: process.env.SUPABASE_TEST_PASSWORD!,
        });
        if (error) throw error;
        clients.push(c);
        tokens.push(data.session!.access_token);
      }
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      const g = await api("/groups", "POST", {
        name: "Parity integration",
        currency: "USD",
        memberIds: [B],
      });
      expect(g.status).toBe(201);
      group = g.data.id;
      // Existing group creation API accepts members separately.
      const added = await api(`/groups/${group}/members`, "POST", {
        userId: B,
      });
      expect([201, 409]).toContain(added.status);
      const a = await api("/accounts", "POST", {
        name: "Parity payer",
        currency: "USD",
        type: "CASH",
      });
      expect(a.status).toBe(201);
      account = a.data.id;
    });
    afterAll(async () => {
      if (group) {
        const payments = await api("/settlements");
        for (const p of payments.data ?? [])
          if (p.groupId === group)
            await api(`/settlements/${p.id}/reverse`, "POST", {});
      }
      if (split)
        expect((await api(`/splits/${split}`, "DELETE")).status).toBe(204);
      if (template)
        expect(
          (await api(`/templates/groups/${group}/${template}`, "DELETE"))
            .status,
        ).toBe(204);
      if (group)
        expect((await api(`/groups/${group}`, "DELETE")).status).toBe(204);
      if (account)
        expect((await api(`/accounts/${account}`, "DELETE")).status).toBe(204);
      for (const c of clients) await c.auth.signOut({ scope: "local" });
      if (server)
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
    });
    it("searches literal text, paginates, filters local dates and isolates outsiders", async () => {
      const created = await api("/splits", "POST", {
        groupId: group,
        description: "Parity 100%_ dinner",
        totalAmount: 30,
        splitType: "EQUAL",
        date: "2026-11-09T20:00:00Z",
        payers: [{ userId: B, amountPaid: 30 }],
        participants: [{ userId: A }, { userId: B }],
      });
      expect(created.status).toBe(201);
      split = created.data.id;
      const result = await api(
        `/splits/search?groupId=${group}&q=100%25_&fromDate=2026-11-10&toDate=2026-11-10&limit=1`,
      );
      expect(result.status).toBe(200);
      expect(result.data.total).toBe(1);
      expect(result.data.items[0].id).toBe(split);
      expect(result.data.items[0].payers[0]).not.toHaveProperty("accountId");
      expect(
        (await api(`/splits/search?groupId=${group}&offset=1`)).data.items,
      ).toEqual([]);
      expect(
        (await api(`/splits/search?groupId=${group}`, "GET", undefined, 2)).data
          .total,
      ).toBe(0);
      expect(
        (await api("/splits/search?minAmount=20&maxAmount=10")).status,
      ).toBe(400);
      const other = await api(
        `/splits/search?groupId=${group}`,
        "GET",
        undefined,
        1,
      );
      expect(other.data.items[0].payers[0].accountId).toBeTruthy();
    });
    it("reports personal paid/share/payment totals and emits a private-field-free CSV", async () => {
      const summary = await api(`/groups/${group}/summary?month=2026-11`);
      expect(summary.status).toBe(200);
      expect(summary.data).toMatchObject({
        totalSpending: 30,
        youPaid: 0,
        yourShare: 15,
        paymentsSent: 0,
        paymentsReceived: 0,
        netChange: -15,
        expenseCount: 1,
      });
      expect(
        (await api(`/groups/${group}/summary?month=2026-10`)).data.expenseCount,
      ).toBe(0);
      expect(
        (await api(`/groups/${group}/summary`, "GET", undefined, 2)).status,
      ).toBe(403);
      const csv = await api(`/groups/${group}/export?month=2026-11`);
      expect(csv.status).toBe(200);
      expect(csv.data).toContain("Parity 100%_ dinner");
      expect(csv.data).not.toContain("account_id");
      expect(csv.data).not.toContain(account);
    });
    it("normalizes discounted receipt shares in SQL and rolls back invalid discounts", async () => {
      const body = {
        description: "Discount parity integration",
        totalAmount: 10.02,
        splitType: "EXACT",
        payers: [{ userId: B, amountPaid: 10.02 }],
        participants: [
          { userId: A, shareValue: 999 },
          { userId: B, shareValue: 999 },
        ],
        itemization: {
          items: [
            { label: "Shared", amount: 5.01, participantIds: [A, B] },
            { label: "Bob", amount: 5, participantIds: [B] },
          ],
          tax: 1,
          tip: 1.01,
          discount: 2,
        },
      };
      const posted = await api("/splits", "POST", body);
      expect(posted.status).toBe(201);
      try {
        const allocations = Object.fromEntries(
          posted.data.participants.map(
            (p: { userId: string; amountOwed: number }) => [
              p.userId,
              p.amountOwed,
            ],
          ),
        );
        expect(allocations).toEqual({ [A]: 2.52, [B]: 7.5 });
        expect(posted.data.itemization.discount).toBe(2);
        const failed = await api("/splits", "POST", {
          ...body,
          itemization: { ...body.itemization, discount: 20 },
        });
        expect(failed.status).toBe(400);
        const search = await api(
          "/splits/search?q=Discount%20parity%20integration&context=individual",
        );
        expect(search.data.total).toBe(1);
      } finally {
        expect((await api(`/splits/${posted.data.id}`, "DELETE")).status).toBe(
          204,
        );
      }
    }, 30000);
    it("sets valid defaults only for owners and rejects direct writes", async () => {
      const result = await api(`/templates/groups/${group}`, "POST", {
        name: "Couple shares",
        payload: {
          description: "Household",
          totalAmount: null,
          splitType: "SHARES",
          participants: [
            { userId: A, shareValue: 2 },
            { userId: B, shareValue: 1 },
          ],
          payers: [{ userId: A }],
        },
      });
      expect(result.status).toBe(201);
      template = result.data.id;
      expect(
        (
          await api(
            `/groups/${group}/default-split`,
            "PUT",
            { templateId: template },
            1,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(`/groups/${group}/default-split`, "PUT", {
            templateId: template,
          })
        ).status,
      ).toBe(200);
      const read = await api(
        `/groups/${group}/default-split`,
        "GET",
        undefined,
        1,
      );
      expect(read.data).toMatchObject({ id: template, needsCorrection: false });
      expect(
        (await api(`/groups/${group}/default-split`, "GET", undefined, 2))
          .status,
      ).toBe(403);
      const direct = await clients[1]
        .from("group_split_defaults")
        .delete()
        .eq("group_id", group);
      expect(direct.error).toBeTruthy();
      expect(
        (
          await api(`/groups/${group}/default-split`, "PUT", {
            templateId: null,
          })
        ).data,
      ).toBeNull();
    });
    it("reverses partial payments once, restores cash and debt, and retains analytics", async () => {
      const before = await api(`/accounts/${account}`);
      const payment = await api("/settlements", "POST", {
        groupId: group,
        payeeId: B,
        accountId: account,
        amount: 5,
        method: "CASH",
        date: "2026-11-10T12:00:00Z",
      });
      expect(payment.status).toBe(200);
      const history = await api(
        `/settlements/page?groupId=${group}`,
        "GET",
        undefined,
        1,
      );
      expect(history.data.total).toBe(1);
      expect(history.data.items[0]).not.toHaveProperty("accountId");
      expect(
        (await api(`/settlements/page?groupId=${group}`, "GET", undefined, 2))
          .data.total,
      ).toBe(0);
      expect((await api("/settlements/page?limit=101")).status).toBe(400);
      expect(
        (await api(`/groups/${group}/summary?month=2026-11`)).data,
      ).toMatchObject({ yourShare: 15, paymentsSent: 5, netChange: -10 });
      expect((await api(`/accounts/${account}`)).data.balance).toBe(
        Number(before.data.balance) - 5,
      );
      expect(
        (await api(`/settlements/${payment.data.id}/reverse`, "POST", {}, 2))
          .status,
      ).toBe(403);
      const results = await Promise.all([
        api(`/settlements/${payment.data.id}/reverse`, "POST", {}),
        api(`/settlements/${payment.data.id}/reverse`, "POST", {}, 1),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results[0].data.settlementId).toBe(payment.data.id);
      expect((await api(`/accounts/${account}`)).data.balance).toBe(
        before.data.balance,
      );
      const summary = await api(`/groups/${group}/summary?month=2026-11`);
      expect(summary.data).toMatchObject({
        totalSpending: 30,
        yourShare: 15,
        paymentsSent: 0,
        netChange: -15,
      });
      const graph = await api(`/groups/${group}/simplify-debts`);
      expect(graph.data.simplifiedTransactions).toEqual([
        { fromUserId: A, toUserId: B, amount: 15 },
      ]);
      const rows = await clients[0]
        .from("transactions")
        .select("analytics_amount")
        .eq("source_type", "SETTLEMENT")
        .eq("source_id", payment.data.id);
      expect(rows.error).toBeNull();
      expect(rows.data?.every((r) => Number(r.analytics_amount) === 0)).toBe(
        true,
      );
      const forbidden = await clients[0]
        .from("settlement_reversals")
        .delete()
        .eq("settlement_id", payment.data.id);
      expect(forbidden.error).toBeTruthy();
    }, 30000);
  },
);
