import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import dotenv from "dotenv";
import { app } from "../app";
dotenv.config({ path: ".env.integration.local", quiet: true });
describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== "1")(
  "hosted Money Manager personal finance",
  () => {
    let server: Server, base: string, account: string, category: string;
    const clients: SupabaseClient[] = [],
      tokens: string[] = [],
      plans: string[] = [],
      transactions: string[] = [];
    let priorPayday = 1,
      monthlyPlan: string | undefined;
    async function api(
      path: string,
      method = "GET",
      body?: unknown,
      actor = 0,
    ) {
      const r = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens[actor]}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      return {
        status: r.status,
        data: r.status === 204 ? null : await r.json(),
      };
    }
    beforeAll(async () => {
      for (const email of [
        "http-a@example.invalid",
        "http-b@example.invalid",
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
      const a = await api("/accounts", "POST", {
        name: "Money Manager test",
        type: "BANK_ACCOUNT",
        balance: 100,
      });
      expect(a.status).toBe(201);
      account = a.data.id;
      const c = await api("/categories", "POST", {
        name: "Money Manager test",
        type: "EXPENSE",
      });
      expect(c.status).toBe(201);
      category = c.data.id;
      priorPayday = (await api("/personal-planning/preferences")).data.payDay;
    }, 30000);
    afterAll(async () => {
      for (const id of plans)
        expect(
          (await api(`/personal-planning/budget-plans/${id}`, "DELETE")).status,
        ).toBe(204);
      if (monthlyPlan)
        await api(`/personal-planning/monthly-plan/${monthlyPlan}`, "DELETE");
      await api("/personal-planning/preferences", "PUT", {
        payDay: priorPayday,
      });
      for (const id of transactions)
        expect((await api(`/transactions/${id}`, "DELETE")).status).toBe(204);
      if (category)
        expect((await api(`/categories/${category}`, "DELETE")).status).toBe(
          204,
        );
      if (account)
        expect((await api(`/accounts/${account}`, "DELETE")).status).toBe(204);
      await Promise.all(clients.map((c) => c.auth.signOut({ scope: "local" })));
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }, 60000);
    const body = (frequency = "MONTHLY") => ({
      name: `Plan ${frequency}`,
      categoryId: category,
      amount: 20,
      currency: "USD",
      frequency,
      startDate: "2028-01-31",
      endDate: frequency === "CUSTOM" ? "2028-03-03" : null,
      alertsEnabled: true,
    });
    it("retains month-end and leap-year anchors for every budget period", async () => {
      for (const f of [
        "DAILY",
        "WEEKLY",
        "BIWEEKLY",
        "MONTHLY",
        "QUARTERLY",
        "YEARLY",
        "CUSTOM",
      ]) {
        const r = await api("/personal-planning/budget-plans", "POST", body(f));
        expect(r.status, JSON.stringify(r.data)).toBe(201);
        plans.push(r.data.id);
      }
      const feb = await api("/personal-planning/budget-plans?date=2028-02-29");
      expect(feb.status, JSON.stringify(feb.data)).toBe(200);
      const get = (f: string) =>
        feb.data.find(
          (r: { name: string }) =>
            r.name === `Plan ${f}` && plans.includes(r.id),
        );
      expect(get("MONTHLY").periodStart).toBe("2028-02-29");
      expect(get("MONTHLY").periodEnd).toBe("2028-03-30");
      expect(get("WEEKLY").periodStart).toBe("2028-02-28");
      expect(get("BIWEEKLY").periodStart).toBe("2028-02-28");
      expect(get("QUARTERLY").periodEnd).toBe("2028-04-29");
      expect(get("YEARLY").periodEnd).toBe("2029-01-30");
      expect(get("CUSTOM").periodEnd).toBe("2028-03-03");
      const mar = await api("/personal-planning/budget-plans?date=2028-03-31");
      expect(
        mar.data.find((r: { id: string }) => r.id === plans[3]).periodStart,
      ).toBe("2028-03-31");
    }, 30000);
    it("uses personal analytics, local dates and isolated overrides without writing balances", async () => {
      for (const [amount, dateTime] of [
        [5, "2028-02-28T18:30:00Z"],
        [7, "2028-03-30T18:30:00Z"],
      ] as const) {
        const r = await api("/transactions", "POST", {
          accountId: account,
          categoryId: category,
          type: "EXPENSE",
          amount,
          dateTime,
        });
        expect(r.status).toBe(201);
        transactions.push(r.data.id);
      }
      const before = (await api(`/accounts/${account}`)).data.balance;
      const changed = await api(
        `/personal-planning/budget-plans/${plans[3]}/override`,
        "PUT",
        { periodStart: "2028-02-29", amount: 40 },
      );
      expect(changed.status, JSON.stringify(changed.data)).toBe(200);
      const feb = (
        await api("/personal-planning/budget-plans?date=2028-02-29")
      ).data.find((r: { id: string }) => r.id === plans[3]);
      expect(Number(feb.spent)).toBe(5);
      expect(Number(feb.effectiveAmount)).toBe(40);
      const mar = (
        await api("/personal-planning/budget-plans?date=2028-03-31")
      ).data.find((r: { id: string }) => r.id === plans[3]);
      expect(Number(mar.effectiveAmount)).toBe(20);
      expect(Number(mar.spent)).toBe(7);
      expect(
        (
          await api(
            `/personal-planning/budget-plans/${plans[3]}/override`,
            "PUT",
            { periodStart: "2028-03-01", amount: 30 },
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await api(
            `/personal-planning/budget-plans/${plans[3]}/override`,
            "PUT",
            { periodStart: "2028-02-29", amount: 2 },
            1,
          )
        ).status,
      ).toBe(400);
      expect(
        (await clients[1].from("budget_plans").select("*").eq("id", plans[3]))
          .data,
      ).toEqual([]);
      expect(
        (
          await api(`/personal-planning/budget-plans/${plans[3]}`, "PUT", {
            ...body(),
            startDate: "2028-01-01",
          })
        ).status,
      ).toBe(400);
      expect((await api(`/accounts/${account}`)).data.balance).toBe(before);
    }, 30000);
    it("compares payday plans to actuals and rejects currency/owner forgeries", async () => {
      expect(
        (await api("/personal-planning/preferences", "PUT", { payDay: 31 }))
          .status,
      ).toBe(200);
      const saved = await api("/personal-planning/monthly-plan", "PUT", {
        month: "2028-02-01",
        expectedIncome: 100,
        expectedExpense: 20,
        targetSavingRate: 80,
        currency: "USD",
      });
      expect(saved.status).toBe(200);
      monthlyPlan = saved.data.id;
      const result = await api(
        "/personal-planning/monthly-plan?month=2028-02-01",
      );
      expect(result.data.periodStart).toBe("2028-02-29");
      expect(result.data.periodEnd).toBe("2028-03-30");
      expect(Number(result.data.expense)).toBeGreaterThanOrEqual(5);
      expect(
        (
          await clients[1]
            .from("monthly_plans")
            .select("*")
            .eq("id", monthlyPlan)
        ).data,
      ).toEqual([]);
      expect(
        (
          await api("/personal-planning/budget-plans", "POST", {
            ...body(),
            currency: "INR",
          })
        ).status,
      ).toBe(400);
      expect(
        (await api("/personal-planning/preferences", "PUT", { payDay: 32 }))
          .status,
      ).toBe(400);
      expect(
        (
          await api("/personal-planning/budget-plans", "POST", {
            ...body(),
            userId: "66666666-6666-4666-8666-666666666666",
          })
        ).status,
      ).toBe(400);
    }, 30000);
  },
);
