import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import dotenv from "dotenv";
import { app } from "../app";
dotenv.config({ path: ".env.integration.local", quiet: true });
const aid = "55555555-5555-4555-8555-555555555555",
  bid = "66666666-6666-4666-8666-666666666666";
describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== "1")(
  "hosted planning and collaboration",
  () => {
    let server: Server,
      base: string,
      clients: SupabaseClient[] = [],
      tokens: string[] = [],
      account: string,
      category: string,
      group: string,
      split: string,
      budget: string,
      goal: string,
      comment: string;
    const transactions: string[] = [];
    async function api(
      path: string,
      method = "GET",
      body?: unknown,
      actor = 0,
    ) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens[actor]}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      return {
        status: res.status,
        data: res.status === 204 ? null : await res.json(),
      };
    }
    beforeAll(async () => {
      for (let i = 0; i < 3; i++) {
        const c = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        clients.push(c);
        const r = await c.auth.signInWithPassword({
          email: `http-${"abc"[i]}@example.invalid`,
          password: process.env.SUPABASE_TEST_PASSWORD!,
        });
        if (r.error) throw r.error;
        tokens.push(r.data.session!.access_token);
      }
      await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", resolve);
      });
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      const a = await api("/accounts", "POST", {
        name: "Productivity fixture",
        type: "BANK_ACCOUNT",
        balance: 100,
      });
      expect(a.status).toBe(201);
      account = a.data.id;
      const c = await api("/categories", "POST", {
        name: "Productivity fixture",
        type: "EXPENSE",
      });
      expect(c.status).toBe(201);
      category = c.data.id;
      const g = await api("/groups", "POST", {
        name: "Productivity fixture",
        memberIds: [bid],
      });
      expect(g.status).toBe(201);
      group = g.data.id;
    }, 30000);
    afterAll(async () => {
      if (goal) await api(`/planning/goals/${goal}`, "DELETE");
      if (budget) await api(`/planning/budgets/${budget}`, "DELETE");
      if (split) await api(`/splits/${split}`, "DELETE");
      for (const id of transactions) await api(`/transactions/${id}`, "DELETE");
      if (group)
        expect((await api(`/groups/${group}`, "DELETE")).status).toBe(204);
      if (category)
        expect((await api(`/categories/${category}`, "DELETE")).status).toBe(
          204,
        );
      if (account)
        expect((await api(`/accounts/${account}`, "DELETE")).status).toBe(204);
      await Promise.all(clients.map((c) => c.auth.signOut({ scope: "local" })));
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }, 30000);
    it("counts only personal expenses within saved-timezone budget months", async () => {
      const b = await api("/planning/budgets", "POST", {
        month: "2026-02-01",
        categoryId: category,
        amount: 20,
        currency: "USD",
      });
      expect(b.status, b.data.error).toBe(201);
      budget = b.data.id;
      for (const [amount, dateTime, type, notes] of [
        [5.01, "2026-02-15T12:00:00Z", "EXPENSE", "Search 50%_ test"],
        [7, "2026-02-28T18:30:00Z", "EXPENSE", "March in Kolkata"],
        [3, "2026-02-15T12:00:00Z", "INCOME", "=SUM(A1)"],
      ] as const) {
        const t = await api("/transactions", "POST", {
          accountId: account,
          categoryId: type === "EXPENSE" ? category : null,
          type,
          amount,
          dateTime,
          notes,
        });
        expect(t.status).toBe(201);
        transactions.push(t.data.id);
      }
      const rows = await api("/planning/budgets?month=2026-02");
      expect(rows.status).toBe(200);
      expect(
        Number(rows.data.find((r: { id: string }) => r.id === budget).spent),
      ).toBe(5.01);
      expect(
        (
          await api(
            `/planning/budgets/${budget}`,
            "PUT",
            { month: "2026-02-01", amount: 900, currency: "USD" },
            1,
          )
        ).status,
      ).toBe(404);
      const hidden = await clients[1]
        .from("budgets")
        .select("*")
        .eq("id", budget);
      expect(hidden.data).toEqual([]);
      expect(
        (
          await api("/planning/budgets", "POST", {
            month: "2026-02-01",
            amount: 3,
            currency: "INR",
          })
        ).status,
      ).toBe(400);
    }, 30000);
    it("copies previous-month limits atomically and never overwrites existing budgets", async () => {
      const first = await api("/planning/budgets/copy", "POST", {
        month: "2026-03-01",
      });
      expect(first.status).toBe(200);
      expect(first.data.copied).toBeGreaterThanOrEqual(1);
      const second = await api("/planning/budgets/copy", "POST", {
        month: "2026-03-01",
      });
      expect(second.data.copied).toBe(0);
      const rows = await api("/planning/budgets?month=2026-03");
      expect(
        rows.data.find((b: { categoryId: string }) => b.categoryId === category)
          .spent,
      ).toBe(7);
    }, 30000);
    it("returns saved-timezone calendar days and matching date-filtered history", async () => {
      const result = await api("/analytics/calendar?month=2026-02");
      expect(result.status).toBe(200);
      expect(result.data.timezone).toBe("Asia/Kolkata");
      expect(result.data.days).toHaveLength(28);
      const feb = await api(
        `/transactions/page?accountId=${account}&month=2026-02`,
      );
      expect(feb.data.total).toBe(2);
      const march = await api(
        `/transactions/page?accountId=${account}&onDate=2026-03-01`,
      );
      expect(march.data.total).toBe(1);
      expect(Number(march.data.items[0].amount)).toBe(7);
      expect((await api("/analytics/calendar?month=2026-13")).status).toBe(400);
      const groupInfo = await api(`/groups/${group}`);
      expect(Number(groupInfo.data.myBalance)).toBe(0);
    }, 30000);
    it("links goals to owned assets and never modifies balances", async () => {
      const before = (await api(`/accounts/${account}`)).data.balance;
      const g = await api("/planning/goals", "POST", {
        name: "Emergency fund",
        accountId: account,
        targetAmount: 1000,
        currency: "USD",
      });
      expect(g.status, g.data.error).toBe(201);
      goal = g.data.id;
      expect((await api(`/accounts/${account}`)).data.balance).toBe(before);
      const goals = await api("/planning/goals");
      expect(
        goals.data.find((g: { id: string }) => g.id === goal).account.balance,
      ).toBe(before);
      expect(
        (
          await api(
            "/planning/goals",
            "POST",
            {
              name: "Forged",
              accountId: account,
              targetAmount: 100,
              currency: "USD",
            },
            1,
          )
        ).status,
      ).toBe(400);
      expect(
        (await clients[1].from("savings_goals").select("*").eq("id", goal))
          .data,
      ).toEqual([]);
      expect((await api(`/accounts/${account}`, "DELETE")).status).toBe(409);
    }, 30000);
    it("searches literal wildcard characters, validates filters, and paginates stably", async () => {
      const search = await api(
        `/transactions/page?q=50%25_&accountId=${account}`,
      );
      expect(search.status).toBe(200);
      expect(search.data.items).toHaveLength(1);
      const page = await api(
        `/transactions/page?accountId=${account}&limit=1&offset=1&sort=highest`,
      );
      expect(page.data.total).toBe(3);
      expect(page.data.items).toHaveLength(1);
      expect(Number(page.data.items[0].amount)).toBe(5.01);
      expect(
        (await api("/transactions/page?minAmount=10&maxAmount=1")).status,
      ).toBe(400);
      const response = await fetch(
        `${base}/transactions/export?accountId=${account}`,
        { headers: { Authorization: `Bearer ${tokens[0]}` } },
      );
      expect(response.headers.get("content-type")).toContain("text/csv");
      const csv = await response.text();
      expect(csv).toContain("'=SUM(A1)");
      expect(csv).toContain("Personal income/expense");
    }, 30000);
    it("keeps activity immutable and comments restricted to their group and authors", async () => {
      const s = await api("/splits", "POST", {
        groupId: group,
        description: "Commentable fixture",
        totalAmount: 10.01,
        splitType: "EQUAL",
        payers: [{ userId: aid, amountPaid: 10.01, accountId: account }],
        participants: [{ userId: aid }, { userId: bid }],
        date: "2026-02-20T12:00:00Z",
        categoryId: category,
      });
      expect(s.status).toBe(201);
      split = s.data.id;
      const c = await api(`/collaboration/splits/${split}/comments`, "POST", {
        body: "No external messages — disposable fixture",
      });
      expect(c.status, c.data.error).toBe(201);
      comment = c.data.id;
      expect(
        (
          await api(
            `/collaboration/comments/${comment}`,
            "PUT",
            { body: "forged" },
            1,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(
            `/collaboration/splits/${split}/comments`,
            "POST",
            { body: "outsider" },
            2,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api(
            `/collaboration/splits/${split}/comments`,
            "GET",
            undefined,
            2,
          )
        ).data,
      ).toEqual([]);
      expect(
        (
          await api(`/collaboration/comments/${comment}`, "PUT", {
            body: "Edited fixture",
          })
        ).status,
      ).toBe(200);
      const bob = await api(
        `/collaboration/splits/${split}/comments`,
        "POST",
        { body: "Bob fixture" },
        1,
      );
      expect(bob.status).toBe(201);
      expect(
        (await api(`/collaboration/comments/${bob.data.id}`, "DELETE")).status,
      ).toBe(204);
      const comments = await api(`/collaboration/splits/${split}/comments`);
      expect(
        comments.data.find((c: { id: string }) => c.id === bob.data.id).body,
      ).toBe("[Deleted]");
      const feed = await api(`/collaboration/groups/${group}/activity`);
      expect(
        feed.data.items.some(
          (r: { summary: string }) => r.summary === "Commentable fixture",
        ),
      ).toBe(true);
      expect(
        (
          await clients[1].from("group_activity").insert({
            group_id: group,
            actor_name: "Forged",
            action: "INSERT",
            entity_type: "fake",
            entity_id: group,
            summary: "fake",
          })
        ).error,
      ).not.toBeNull();
      const summary = await api("/planning/budgets?month=2026-02");
      expect(
        Number(summary.data.find((b: { id: string }) => b.id === budget).spent),
      ).toBe(10.02);
    }, 30000);
    it("reports category spending from personal shares without counting virtual adjustments", async () => {
      const result = await api("/analytics/category-spending?range=ALL");
      expect(result.status).toBe(200);
      expect(
        result.data.categories.find((c: { id: string }) => c.id === category)
          .amount,
      ).toBe(17.02);
      expect(
        result.data.categories.reduce(
          (n: number, c: { amount: number }) => n + c.amount,
          0,
        ),
      ).toBeCloseTo(result.data.totalExpense, 2);
    });
  },
);
