import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.integration.local", quiet: true });
describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== "1")(
  "hosted device currency accounting",
  () => {
    let a: SupabaseClient, b: SupabaseClient, account: string, entry: string;
    beforeAll(async () => {
      const clients = [];
      for (const email of [
        "http-a@example.invalid",
        "http-b@example.invalid",
      ]) {
        const c = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const r = await c.auth.signInWithPassword({
          email,
          password: process.env.SUPABASE_TEST_PASSWORD!,
        });
        if (r.error) throw r.error;
        clients.push(c);
      }
      [a, b] = clients;
      const r = await a.rpc("manage_account", {
        p_input: {
          name: "FX synthetic test",
          type: "CASH",
          currency: "USD",
          balance: 100,
        },
      });
      if (r.error) throw r.error;
      account = r.data.id;
    });
    afterAll(async () => {
      if (entry)
        await a.rpc("mutate_currency_conversion", {
          p_input: {},
          p_id: entry,
          p_delete: true,
        });
      if (account)
        await a.rpc("manage_account", {
          p_id: account,
          p_delete: true,
          p_input: {},
        });
      await Promise.all([a, b].map((c) => c?.auth.signOut({ scope: "local" })));
    });
    it("atomically posts once under concurrent retry and keeps the rate snapshot private", async () => {
      const input = {
        accountId: account,
        type: "EXPENSE",
        originalCurrency: "EUR",
        originalAmount: 10,
        exchangeRate: 1.2345,
        rateDate: "2026-11-10",
        rateSource: "MANUAL",
        dateTime: "2026-11-11T01:00:00Z",
        requestKey: crypto.randomUUID(),
      };
      const results = await Promise.all([
        a.rpc("mutate_currency_conversion", { p_input: input }),
        a.rpc("mutate_currency_conversion", { p_input: input }),
      ]);
      for (const r of results) expect(r.error).toBeNull();
      entry = results[0].data.id;
      expect(results[1].data.id).toBe(entry);
      expect(results[0].data.base_amount).toBe(12.35);
      expect(
        (await a.from("accounts").select("balance").eq("id", account).single())
          .data!.balance,
      ).toBe(87.65);
      expect(
        (await b.from("currency_conversions").select("*").eq("id", entry)).data,
      ).toEqual([]);
      expect(
        (
          await b.rpc("mutate_currency_conversion", {
            p_input: input,
            p_id: entry,
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await a
            .from("currency_conversions")
            .update({ exchange_rate: 99 })
            .eq("id", entry)
        ).error,
      ).toBeTruthy();
    });
    it("rejects invalid original precision and inaccessible accounts without balance changes", async () => {
      const before = (
        await a.from("accounts").select("balance").eq("id", account).single()
      ).data!.balance;
      for (const amount of [1.001, -1, 0]) {
        const r = await a.rpc("mutate_currency_conversion", {
          p_input: {
            accountId: account,
            type: "EXPENSE",
            originalCurrency: "JPY",
            originalAmount: amount,
            exchangeRate: 1,
            rateDate: "2026-11-10",
            rateSource: "MANUAL",
            dateTime: "2026-11-11T01:00:00Z",
            requestKey: crypto.randomUUID(),
          },
        });
        expect(r.error).toBeTruthy();
      }
      expect(
        (await a.from("accounts").select("balance").eq("id", account).single())
          .data!.balance,
      ).toBe(before);
    });
    it("edits in place, prevents manual bypass and reverses once", async () => {
      const record = (
        await a
          .from("currency_conversions")
          .select("*")
          .eq("id", entry)
          .single()
      ).data!;
      const r = await a.rpc("mutate_currency_conversion", {
        p_id: entry,
        p_input: {
          accountId: account,
          type: "INCOME",
          originalCurrency: "EUR",
          originalAmount: 20,
          exchangeRate: 1.5,
          rateDate: "2026-11-10",
          rateSource: "MANUAL",
          dateTime: "2026-11-11T01:00:00Z",
          requestKey: crypto.randomUUID(),
        },
      });
      expect(r.error).toBeNull();
      expect(r.data.transaction_id).toBe(record.transaction_id);
      expect(
        (await a.from("accounts").select("balance").eq("id", account).single())
          .data!.balance,
      ).toBe(130);
      expect(
        (
          await a.rpc("mutate_transaction_atomic", {
            p_id: record.transaction_id,
            p_delete: true,
            p_input: {},
          })
        ).error,
      ).toBeTruthy();
      for (let i = 0; i < 2; i++)
        expect(
          (
            await a.rpc("mutate_currency_conversion", {
              p_id: entry,
              p_delete: true,
              p_input: {},
            })
          ).error,
        ).toBeNull();
      expect(
        (await a.from("accounts").select("balance").eq("id", account).single())
          .data!.balance,
      ).toBe(100);
    });
  },
);
