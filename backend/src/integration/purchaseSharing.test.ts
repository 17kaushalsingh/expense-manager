import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { app } from "../app";
import { groupBalances } from "../../../frontend/src/lib/device/splits";
import type { Workspace } from "../../../frontend/src/lib/device/vault";
dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.integration.local", quiet: true });
describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== "1")(
  "hosted recorded-purchase sharing",
  () => {
    let server: Server,
      base: string,
      account: string,
      group: string,
      category: string;
    const clients: SupabaseClient[] = [],
      tokens: string[] = [],
      users: string[] = [],
      transactions: string[] = [],
      splits: string[] = [],
      receipts: string[] = [],
      extras: string[] = [];
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
      });
      return {
        status: r.status,
        data: r.status === 204 ? null : await r.json(),
      };
    }
    async function purchase(amount = 12.01, accountId = account) {
      const r = await api("/transactions", "POST", {
        accountId,
        categoryId: category,
        type: "EXPENSE",
        amount,
        dateTime: "2026-11-10T12:00:00Z",
        notes: "Synthetic purchase notes",
        tags: ["shared"],
      });
      expect(r.status, JSON.stringify(r.data)).toBe(201);
      transactions.push(r.data.id);
      return r.data;
    }
    function input(row: { updatedAt: string }, mode = "EQUAL") {
      return {
        requestKey: crypto.randomUUID(),
        expectedUpdatedAt: row.updatedAt,
        groupId: group,
        categoryId: null,
        description: "Synthetic converted purchase",
        splitType: mode,
        participants: [
          {
            userId: users[0],
            ...(mode === "EXACT"
              ? { shareValue: 6.01 }
              : mode === "PERCENTAGE"
                ? { shareValue: 50 }
                : mode === "SHARES"
                  ? { shareValue: 1 }
                  : {}),
          },
          {
            userId: users[1],
            ...(mode === "EXACT"
              ? { shareValue: 6 }
              : mode === "PERCENTAGE"
                ? { shareValue: 50 }
                : mode === "SHARES"
                  ? { shareValue: 1 }
                  : {}),
          },
        ],
        shareReceipts: false,
      };
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
      const a = await api("/accounts", "POST", {
        name: "Synthetic purchase-sharing cash",
        type: "CASH",
        currency: "USD",
        balance: 1000,
      });
      expect(a.status).toBe(201);
      account = a.data.id;
      const cat = await api("/categories", "POST", {
        name: "Synthetic purchase-sharing category",
        type: "EXPENSE",
      });
      expect(cat.status).toBe(201);
      category = cat.data.id;
      const g = await api("/groups", "POST", {
        name: "Synthetic purchase sharing",
        currency: "USD",
        memberIds: [users[1]],
      });
      expect(g.status, JSON.stringify(g.data)).toBe(201);
      group = g.data.id;
    });
    afterEach(async () => {
      for (const id of receipts.splice(0))
        expect((await api(`/receipts/${id}`, "DELETE")).status).toBe(204);
      for (const id of splits.splice(0))
        expect((await api(`/splits/${id}`, "DELETE")).status).toBe(204);
      for (const id of transactions.splice(0)) {
        const r = await api(`/transactions/${id}`, "DELETE");
        expect([204, 404]).toContain(r.status);
      }
      for (const id of extras.splice(0))
        expect((await api(`/accounts/${id}`, "DELETE")).status).toBe(204);
    });
    afterAll(async () => {
      if (account)
        expect((await api(`/accounts/${account}`, "DELETE")).status).toBe(204);
      if (category)
        expect((await api(`/categories/${category}`, "DELETE")).status).toBe(
          204,
        );
      if (group)
        expect((await api(`/groups/${group}`, "DELETE")).status).toBe(204);
      await Promise.all(clients.map((c) => c.auth.signOut({ scope: "local" })));
      if (server)
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
    });
    it.each(["EQUAL", "EXACT", "PERCENTAGE", "SHARES", "ADJUSTMENT"])(
      "converts %s once, preserving cash and counting only each personal share",
      async (mode) => {
        const row = await purchase(),
          before = (await api(`/accounts/${account}`)).data.balance,
          body = input(row, mode);
        const results = await Promise.all([
          api(`/transactions/${row.id}/share`, "POST", body),
          api(`/transactions/${row.id}/share`, "POST", body),
        ]);
        for (const r of results)
          expect(r.status, JSON.stringify(r.data)).toBe(201);
        const id = results[0].data.id;
        splits.push(id);
        expect(results[1].data.id).toBe(id);
        expect((await api(`/accounts/${account}`)).data.balance).toBe(before);
        expect(
          (await clients[0].from("transactions").select("id").eq("id", row.id))
            .data,
        ).toEqual([]);
        const own = await clients[0]
          .from("transactions")
          .select("*")
          .eq("source_type", "SPLIT")
          .eq("source_id", id);
        expect(own.error).toBeNull();
        expect(
          own.data!.reduce((n, t) => n + Number(t.analytics_amount), 0),
        ).toBe(6.01);
        const other = await clients[1]
          .from("transactions")
          .select("analytics_amount")
          .eq("source_id", id);
        expect(other.error).toBeNull();
        expect(
          other.data!.reduce((n, t) => n + Number(t.analytics_amount), 0),
        ).toBe(6);
        expect(
          own.data!.find((t) => t.type === "EXPENSE")!.category_id,
        ).toBeNull();
        expect(
          own.data!.every(
            (t) =>
              t.tags?.includes("shared") &&
              t.notes === "Synthetic purchase notes",
          ),
        ).toBe(true);
        const changed = await api(`/transactions/${row.id}/share`, "POST", {
          ...body,
          description: "Different retry",
        });
        expect(changed.status).toBe(409);
        const snap = await clients[0].rpc("export_device_snapshot"),
          graph = await clients[0].rpc("simplify_debts", { p_group_id: group });
        expect(snap.error).toBeNull();
        expect(graph.error).toBeNull();
        const balances = groupBalances(
          snap.data as unknown as Pick<Workspace, "tables">,
          group,
        );
        const expected = (
          graph.data as { groupBalances: Record<string, number> }
        ).groupBalances;
        for (const [person, balance] of Object.entries(balances))
          expect(balance.toNumber()).toBe(Number(expected[person] ?? 0));
      },
    );
    it("rolls back invalid allocations, rejects stale/foreign input and prevents forged funding", async () => {
      const row = await purchase(),
        before = (await api(`/accounts/${account}`)).data.balance,
        body = input(row, "EXACT");
      expect(
        (
          await api(`/transactions/${row.id}/share`, "POST", {
            ...body,
            participants: [
              { userId: users[0], shareValue: 1 },
              { userId: users[1], shareValue: 1 },
            ],
          })
        ).status,
      ).toBe(400);
      expect((await api(`/accounts/${account}`)).data.balance).toBe(before);
      expect(
        (await clients[0].from("transactions").select("id").eq("id", row.id))
          .data,
      ).toHaveLength(1);
      expect(
        (await api(`/transactions/${row.id}/share`, "POST", body, 1)).status,
      ).toBe(404);
      expect(
        (
          await api(`/transactions/${row.id}/share`, "POST", {
            ...body,
            expectedUpdatedAt: "2000-01-01T00:00:00Z",
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await api(`/transactions/${row.id}/share`, "POST", {
            ...body,
            totalAmount: 1,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await api(`/transactions/${row.id}/share`, "POST", {
            ...body,
            participants: [{ userId: users[0], shareValue: 12.01 }],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await api(`/transactions/${row.id}/share`, "POST", {
            ...body,
            participants: [
              { userId: users[0], shareValue: 6.01 },
              { userId: users[2], shareValue: 6 },
            ],
          })
        ).status,
      ).toBe(400);
      const ok = await api(`/transactions/${row.id}/share`, "POST", body);
      expect(ok.status, JSON.stringify(ok.data)).toBe(201);
      splits.push(ok.data.id);
    });
    it("requires explicit receipt-sharing approval and then moves the original file access", async () => {
      const row = await purchase(),
        body = input(row),
        file = Buffer.from("%PDF-1.4\nsynthetic conversion receipt\n%%EOF");
      const r = await api("/receipts", "POST", {
        transactionId: row.id,
        fileName: "purchase.pdf",
        mimeType: "application/pdf",
        byteSize: file.length,
      });
      expect(r.status).toBe(201);
      receipts.push(r.data.id);
      expect(
        (
          await clients[0].storage
            .from("receipts")
            .upload(r.data.objectPath, file, { contentType: "application/pdf" })
        ).error,
      ).toBeNull();
      expect(
        (await api(`/receipts/${r.data.id}/complete`, "POST")).status,
      ).toBe(200);
      expect(
        (
          await clients[1]
            .from("receipt_attachments")
            .select("id")
            .eq("id", r.data.id)
        ).data,
      ).toEqual([]);
      expect(
        (await api(`/transactions/${row.id}/share`, "POST", body)).status,
      ).toBe(400);
      const converted = await api(`/transactions/${row.id}/share`, "POST", {
        ...body,
        shareReceipts: true,
      });
      expect(converted.status, JSON.stringify(converted.data)).toBe(201);
      splits.push(converted.data.id);
      const moved = await clients[1]
        .from("receipt_attachments")
        .select("transaction_id,split_id")
        .eq("id", r.data.id)
        .single();
      expect(moved.error).toBeNull();
      expect(moved.data).toEqual({
        transaction_id: null,
        split_id: converted.data.id,
      });
      expect(
        (await clients[1].storage.from("receipts").download(r.data.objectPath))
          .error,
      ).toBeNull();
      expect(
        (
          await clients[2]
            .from("receipt_attachments")
            .select("id")
            .eq("id", r.data.id)
        ).data,
      ).toEqual([]);
    });
    it("retains CSV duplicate detection after replacing the imported manual entry", async () => {
      const csv = `Date,Amount,Type,Notes\n2026-11-10,12.01,EXPENSE,Purchase ${crypto.randomUUID()}`;
      const preview = await api("/imports/preview", "POST", {
        csv,
        accountId: account,
      });
      expect(preview.status).toBe(200);
      const posted = await api("/imports", "POST", {
        batchId: preview.data.batchId,
        accountId: account,
        timezone: preview.data.timezone,
        rows: preview.data.rows.map((r: { data: unknown }) => r.data),
      });
      expect(posted.status).toBe(200);
      expect(posted.data.created).toBe(1);
      const entry = await clients[0]
        .from("transaction_import_entries")
        .select("id,transaction_id")
        .eq("import_id", preview.data.batchId)
        .single();
      expect(entry.error).toBeNull();
      const id = entry.data!.transaction_id!;
      transactions.push(id);
      const original = await clients[0]
        .from("transactions")
        .select("updated_at")
        .eq("id", id)
        .single();
      expect(original.error).toBeNull();
      const r = await api(
        `/transactions/${id}/share`,
        "POST",
        input({ updatedAt: original.data!.updated_at }),
      );
      expect(r.status, JSON.stringify(r.data)).toBe(201);
      splits.push(r.data.id);
      const moved = await clients[0]
        .from("transaction_import_entries")
        .select("transaction_id")
        .eq("id", entry.data!.id)
        .single();
      expect(moved.error).toBeNull();
      expect(moved.data!.transaction_id).not.toBe(id);
      const funding = await clients[0]
        .from("transactions")
        .select("source_id,type")
        .eq("id", moved.data!.transaction_id!)
        .single();
      expect(funding.data).toEqual({ source_id: r.data.id, type: "TRANSFER" });
      const retry = await api("/imports/preview", "POST", {
        csv,
        accountId: account,
      });
      expect(retry.status).toBe(200);
      expect(retry.data.rows[0].data.duplicate).toBe(true);
    });

    it("keeps conversion identity through expense deletion and authorized recovery", async () => {
      const original = await purchase(),
        body = input(original);
      const r = await api(`/transactions/${original.id}/share`, "POST", body);
      expect(r.status).toBe(201);
      const id = r.data.id;
      expect((await api(`/splits/${id}`, "DELETE")).status).toBe(204);
      expect(
        (await api(`/transactions/${original.id}/share`, "POST", body)).status,
      ).toBe(409);
      const restored = await api(`/splits/${id}/restore`, "POST", {});
      expect(restored.status, JSON.stringify(restored.data)).toBe(200);
      splits.push(id);
      const retry = await api(
        `/transactions/${original.id}/share`,
        "POST",
        body,
      );
      expect(retry.status).toBe(201);
      expect(retry.data.id).toBe(id);
    });

    it("preserves the liability balance of a purchase paid by credit card", async () => {
      const a = await api("/accounts", "POST", {
        name: "Synthetic purchase-sharing card",
        type: "CREDIT_CARD",
        currency: "USD",
        balance: 20,
      });
      expect(a.status).toBe(201);
      extras.push(a.data.id);
      const original = await purchase(12.01, a.data.id);
      const before = (await api(`/accounts/${a.data.id}`)).data.balance;
      const r = await api(
        `/transactions/${original.id}/share`,
        "POST",
        input(original),
      );
      expect(r.status, JSON.stringify(r.data)).toBe(201);
      splits.push(r.data.id);
      expect((await api(`/accounts/${a.data.id}`)).data.balance).toBe(before);
      const funding = await clients[0]
        .from("transactions")
        .select("balance_delta")
        .eq("source_id", r.data.id)
        .eq("account_id", a.data.id)
        .single();
      expect(funding.error).toBeNull();
      expect(Number(funding.data!.balance_delta)).toBe(12.01);
    });

    it("avoids a temporary overflow when cash already sits near its maximum", async () => {
      const a = await api("/accounts", "POST", {
        name: "Synthetic boundary purchase",
        type: "CASH",
        currency: "USD",
        balance: 999999999999,
      });
      expect(a.status).toBe(201);
      extras.push(a.data.id);
      const row = await purchase(0.02, a.data.id),
        income = await api("/transactions", "POST", {
          accountId: a.data.id,
          type: "INCOME",
          amount: 1.01,
          dateTime: new Date().toISOString(),
        });
      expect(income.status).toBe(201);
      transactions.push(income.data.id);
      const before = (await api(`/accounts/${a.data.id}`)).data.balance;
      const body = {
        ...input(row, "EXACT"),
        participants: [
          { userId: users[0], shareValue: 0.01 },
          { userId: users[1], shareValue: 0.01 },
        ],
      };
      const r = await api(`/transactions/${row.id}/share`, "POST", body);
      expect(r.status, JSON.stringify(r.data)).toBe(201);
      splits.push(r.data.id);
      expect((await api(`/accounts/${a.data.id}`)).data.balance).toBe(before);
      // Remove the later income before deleting the purchase to keep every intermediate balance valid.
      expect(
        (await api(`/transactions/${income.data.id}`, "DELETE")).status,
      ).toBe(204);
      transactions.splice(transactions.indexOf(income.data.id), 1);
    });
  },
);
