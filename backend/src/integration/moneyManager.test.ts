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
    let assetId: string | undefined,
      eventId: string | undefined,
      costId: string | undefined;
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
      if (eventId)
        expect((await api(`/wealth/events/${eventId}`, "DELETE")).status).toBe(
          204,
        );
      if (assetId)
        expect((await api(`/wealth/assets/${assetId}`, "DELETE")).status).toBe(
          204,
        );
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
    it("keeps valuation histories private and changes net worth without changing cash flow", async () => {
      const beforeWorth = Number(
        (await api("/analytics/net-worth")).data.netWorth,
      );
      const beforeBalance = (await api(`/accounts/${account}`)).data.balance;
      const a = await api("/wealth/assets", "POST", {
        name: "Test vehicle",
        kind: "VEHICLE",
        currency: "USD",
        value: 200,
        valueDate: "2026-01-01",
      });
      expect(a.status, JSON.stringify(a.data)).toBe(201);
      assetId = a.data.id;
      expect(
        Number((await api("/analytics/net-worth")).data.netWorth),
      ).toBeCloseTo(beforeWorth + 200, 2);
      expect(
        (
          await api(`/wealth/assets/${assetId}/valuations`, "PUT", {
            value: 250,
            valueDate: "2026-02-01",
          })
        ).status,
      ).toBe(200);
      expect(
        Number((await api("/analytics/net-worth")).data.netWorth),
      ).toBeCloseTo(beforeWorth + 250, 2);
      expect((await api(`/accounts/${account}`)).data.balance).toBe(
        beforeBalance,
      );
      expect(
        (await clients[1].from("personal_assets").select("*").eq("id", assetId))
          .data,
      ).toEqual([]);
      expect(
        (
          await api(
            `/wealth/assets/${assetId}/valuations`,
            "PUT",
            { value: 10, valueDate: "2026-02-01" },
            1,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await api("/wealth/assets", "POST", {
            name: "Must roll back",
            kind: "OTHER",
            currency: "USD",
            value: 10,
            valueDate: "2099-01-01",
          })
        ).status,
      ).toBe(400);
      expect(
        (await api("/wealth/assets")).data.some(
          (r: { name: string }) => r.name === "Must roll back",
        ),
      ).toBe(false);
      const history = await api("/wealth/history?range=1W");
      expect(history.status, JSON.stringify(history.data)).toBe(200);
      expect(history.data.series).toHaveLength(7);
      expect(Number(history.data.series.at(-1).assets)).toBeGreaterThanOrEqual(
        250,
      );
    }, 30000);
    it("posts planned event costs once under concurrent retries and rolls back failures", async () => {
      const e = await api("/wealth/events", "POST", {
        name: "Test trip",
        kind: "TRIP",
        startDate: "2026-11-10",
        endDate: "2026-11-15",
        amount: 100,
        currency: "USD",
      });
      expect(e.status).toBe(201);
      eventId = e.data.id;
      const c = await api(`/wealth/events/${eventId}/costs`, "POST", {
        name: "Test hotel",
        amount: 20,
        categoryId: category,
      });
      expect(c.status, JSON.stringify(c.data)).toBe(201);
      costId = c.data.id;
      const before = Number((await api(`/accounts/${account}`)).data.balance);
      const input = {
        accountId: account,
        amount: 15,
        dateTime: "2026-11-10T12:00:00Z",
      };
      const denied = await api(
        `/wealth/costs/${costId}/record`,
        "POST",
        input,
        1,
      );
      expect(denied.status).toBe(404);
      expect(
        (
          await api(`/wealth/costs/${costId}/record`, "POST", {
            ...input,
            accountId: "66666666-6666-4666-8666-666666666666",
          })
        ).status,
      ).toBe(400);
      const [a, b] = await Promise.all([
        api(`/wealth/costs/${costId}/record`, "POST", input),
        api(`/wealth/costs/${costId}/record`, "POST", input),
      ]);
      expect(a.status, JSON.stringify(a.data)).toBe(200);
      expect(b.status).toBe(200);
      expect(a.data.id).toBe(b.data.id);
      transactions.push(a.data.id);
      expect(
        Number((await api(`/accounts/${account}`)).data.balance),
      ).toBeCloseTo(before - 15, 2);
      const summary = (await api("/wealth/events")).data.find(
        (r: { id: string }) => r.id === eventId,
      );
      expect(Number(summary.spent)).toBe(15);
      expect(Number(summary.planned)).toBe(20);
      expect(
        (
          await clients[1]
            .from("event_planned_costs")
            .select("*")
            .eq("id", costId)
        ).data,
      ).toEqual([]);
      expect(
        (
          await clients[0]
            .from("event_planned_costs")
            .update({ recorded_transaction_id: null })
            .eq("id", costId)
        ).error,
      ).not.toBeNull();
      expect(
        (
          await api(`/wealth/events/${eventId}/transactions`, "POST", {
            transactionId: a.data.id,
          })
        ).status,
      ).toBe(409);
    }, 30000);
    it("separates principal and interest, prevents overpayment and reverses retried payments once", async () => {
      const cash = (await api("/accounts")).data.find(
        (a: { isDefault: boolean; type: string }) =>
          a.isDefault && a.type === "CASH",
      ).id;
      const before = Number((await api(`/accounts/${cash}`)).data.balance);
      const input = {
        name: "Loan integration history",
        counterparty: "Synthetic fixture",
        direction: "LENT",
        principal: 10.01,
        currency: "USD",
        startDate: "2026-11-10",
        firstDueDate: "2026-11-30",
        frequency: "MONTHLY",
        installmentCount: 3,
        accountId: cash,
        requestKey: crypto.randomUUID(),
      };
      const [a, b] = await Promise.all([
        api("/loans", "POST", input),
        api("/loans", "POST", input),
      ]);
      expect(a.status, JSON.stringify(a.data)).toBe(201);
      expect(b.data.id).toBe(a.data.id);
      const loan = a.data.id;
      expect(Number((await api(`/accounts/${cash}`)).data.balance)).toBeCloseTo(
        before - 10.01,
        2,
      );
      const payment = {
        principal: 3.34,
        interest: 1,
        accountId: cash,
        dateTime: "2026-11-10T12:00:00Z",
        requestKey: crypto.randomUUID(),
      };
      expect(
        (await api(`/loans/${loan}/payments`, "POST", payment, 1)).status,
      ).toBe(404);
      expect(
        (
          await api(`/loans/${loan}/payments`, "POST", {
            ...payment,
            principal: 11,
          })
        ).status,
      ).toBe(400);
      const [p, q] = await Promise.all([
        api(`/loans/${loan}/payments`, "POST", payment),
        api(`/loans/${loan}/payments`, "POST", payment),
      ]);
      expect(p.status, JSON.stringify(p.data)).toBe(200);
      expect(q.data.id).toBe(p.data.id);
      expect(Number((await api(`/accounts/${cash}`)).data.balance)).toBeCloseTo(
        before - 5.67,
        2,
      );
      const summary = (await api("/loans")).data.find(
        (l: { id: string }) => l.id === loan,
      );
      expect(summary.outstanding).toBe(6.67);
      expect(
        summary.installments.map((i: { amount: number }) => i.amount),
      ).toEqual([3.34, 3.34, 3.33]);
      const tx = (
        await api(
          `/transactions/page?accountId=${cash}&sourceType=PERSONAL_LOAN&limit=200`,
        )
      ).data.items.filter(
        (t: { sourceId: string }) => t.sourceId === p.data.id,
      );
      expect(tx).toHaveLength(2);
      expect(
        tx.reduce(
          (n: number, t: { analyticsAmount: number }) =>
            n + Number(t.analyticsAmount),
          0,
        ),
      ).toBe(1);
      expect((await api(`/transactions/${tx[0].id}`, "DELETE")).status).toBe(
        400,
      );
      expect(
        (await clients[1].from("personal_loans").select("*").eq("id", loan))
          .data,
      ).toEqual([]);
      const reversals = await Promise.all([
        api(`/loans/payments/${p.data.id}/reverse`, "POST", {}),
        api(`/loans/payments/${p.data.id}/reverse`, "POST", {}),
      ]);
      expect(reversals.every((r) => r.status === 200)).toBe(true);
      expect(Number((await api(`/accounts/${cash}`)).data.balance)).toBeCloseTo(
        before - 10.01,
        2,
      );
      expect(
        (
          await api(`/loans/${loan}/payments`, "POST", {
            ...payment,
            principal: 10.01,
            interest: 0,
            requestKey: crypto.randomUUID(),
          })
        ).status,
      ).toBe(200);
      expect(Number((await api(`/accounts/${cash}`)).data.balance)).toBeCloseTo(
        before,
        2,
      );
      expect(
        (
          await api(`/loans/${loan}`, "PUT", {
            name: input.name,
            counterparty: input.counterparty,
            firstDueDate: input.firstDueDate,
            frequency: input.frequency,
            installmentCount: 3,
            archived: true,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await clients[0]
            .from("loan_payments")
            .insert({
              user_id: "55555555-5555-4555-8555-555555555555",
              loan_id: loan,
              principal: 1,
              interest: 0,
              account_id: cash,
              date_time: payment.dateTime,
              request_key: crypto.randomUUID(),
            })
        ).error,
      ).not.toBeNull();
      // Immutable cash history remains on a reserved test identity, fully repaid and archived.
    }, 30000);
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
