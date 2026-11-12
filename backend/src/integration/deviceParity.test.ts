import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import { app } from "../app";
import {
  blankWorkspace,
  Workspace,
} from "../../../frontend/src/lib/device/vault";
import {
  createLocalLoan,
  payLocalLoan,
  saveLocalBill,
  generateLocalBills,
  reviewLocalBill,
  setLocalBillStatus,
} from "../../../frontend/src/lib/device/personal";
import {
  resolveReferences,
  acknowledge,
} from "../../../frontend/src/lib/device/syncState";
import { camelCase } from "../db";
dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.integration.local", quiet: true });
describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== "1")(
  "hosted device currency accounting",
  () => {
    let a: SupabaseClient, b: SupabaseClient, account: string, entry: string;
    let server: Server, base: string;
    const tokens: string[] = [];
    const resourceCleanup: { table: string; id: string }[] = [];
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
        tokens.push(r.data.session!.access_token);
      }
      [a, b] = clients;
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
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
      for (const row of resourceCleanup)
        await a.from(row.table).delete().eq("id", row.id);
      if (account)
        await a.rpc("manage_account", {
          p_id: account,
          p_delete: true,
          p_input: {},
        });
      await Promise.all([a, b].map((c) => c?.auth.signOut({ scope: "local" })));
      if (server) await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
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
    it("preserves decimal strings at the REST boundary and rejects another workspace owner", async () => {
      const response = await fetch(`${base}/exchange/entries/${entry}`, { headers: { Authorization: `Bearer ${tokens[0]}` } });
      expect(response.status).toBe(200);
      const snapshot = await response.json();
      expect(snapshot.originalAmount).toBe("10.0000");
      expect(snapshot.exchangeRate).toBe("1.2345000000000000");
      const denied = await fetch(`${base}/portability/commands`, {
        method: "POST", headers: { Authorization: `Bearer ${tokens[0]}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), ownerId: (await b.auth.getUser()).data.user!.id, kind: "TX_CREATE", payload: { input: { accountId: account, amount: 1 } } }),
      });
      expect(denied.status).toBe(403);
      expect((await denied.json()).error).toContain("differ");
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
    it("exports an RLS snapshot and executes device commands exactly once with conflict protection", async () => {
      const snap = await a.rpc("export_device_snapshot");
      expect(snap.error).toBeNull();
      expect(snap.data.ownerId).toBe((await a.auth.getUser()).data.user!.id);
      expect(snap.data.tables.users).toHaveLength(1);
      expect(JSON.stringify(snap.data.tables.group_invitations)).not.toContain(
        "token_hash",
      );
      const id = crypto.randomUUID(),
        payload = {
          input: {
            accountId: account,
            type: "EXPENSE",
            amount: 1.11,
            dateTime: "2026-11-11T01:00:00Z",
            notes: "Synthetic offline retry",
          },
        };
      const before = (
        await a.from("accounts").select("balance").eq("id", account).single()
      ).data!.balance;
      const rs = await Promise.all([
        a.rpc("execute_device_command", {
          p_id: id,
          p_kind: "TX_CREATE",
          p_payload: payload,
        }),
        a.rpc("execute_device_command", {
          p_id: id,
          p_kind: "TX_CREATE",
          p_payload: payload,
        }),
      ]);
      for (const r of rs) expect(r.error).toBeNull();
      expect(rs[0].data.id).toBe(rs[1].data.id);
      expect(
        (await a.from("accounts").select("balance").eq("id", account).single())
          .data!.balance,
      ).toBeCloseTo(Number(before) - 1.11, 4);
      expect(
        (
          await a.rpc("execute_device_command", {
            p_id: id,
            p_kind: "TX_CREATE",
            p_payload: { input: { ...payload.input, amount: 100 } },
          })
        ).error,
      ).toBeTruthy();
      const tx = rs[0].data;
      expect(
        (
          await a.rpc("execute_device_command", {
            p_id: crypto.randomUUID(),
            p_kind: "TX_UPDATE",
            p_payload: { id: tx.id, input: payload.input },
            p_expected_updated_at: "2000-01-01T00:00:00Z",
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await b.rpc("execute_device_command", {
            p_id: crypto.randomUUID(),
            p_kind: "TX_DELETE",
            p_payload: { id: tx.id },
            p_expected_updated_at: tx.updated_at,
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await a.rpc("execute_device_command", {
            p_id: crypto.randomUUID(),
            p_kind: "TX_DELETE",
            p_payload: { id: tx.id },
            p_expected_updated_at: tx.updated_at,
          })
        ).error,
      ).toBeNull();
      expect(
        (await a.from("accounts").select("balance").eq("id", account).single())
          .data!.balance,
      ).toBe(before);
      expect(
        (await b.from("device_commands").select("*").eq("id", id)).data,
      ).toEqual([]);
    });
    it("retries receipt creation with one owner-bound key and preserves exact FX strings in exports", async () => {
      const c = (
        await a
          .from("currency_conversions")
          .select("transaction_id")
          .eq("id", entry)
          .single()
      ).data!;
      const request = crypto.randomUUID(),
        input = {
          transactionId: c.transaction_id,
          fileName: "device-retry.pdf",
          mimeType: "application/pdf",
          byteSize: 19,
          requestKey: request,
        };
      const rs = await Promise.all([
        a.rpc("manage_receipt", { p_action: "CREATE", p_input: input }),
        a.rpc("manage_receipt", { p_action: "CREATE", p_input: input }),
      ]);
      for (const r of rs) expect(r.error).toBeNull();
      expect(rs[0].data.id).toBe(rs[1].data.id);
      expect(
        (
          await a.rpc("manage_receipt", {
            p_action: "CREATE",
            p_input: { ...input, fileName: "different.pdf" },
          })
        ).error,
      ).toBeTruthy();
      expect(
        (await b.rpc("manage_receipt", { p_action: "CREATE", p_input: input }))
          .error,
      ).toBeTruthy();
      expect(
        (
          await a.rpc("manage_receipt", {
            p_action: "DELETE",
            p_id: rs[0].data.id,
          })
        ).error,
      ).toBeNull();
      const snap = await a.rpc("export_device_snapshot");
      expect(snap.error).toBeNull();
      expect(
        typeof snap.data.tables.currency_conversions.find(
          (x: any) => x.id === entry,
        ).exchange_rate,
      ).toBe("string");
    });
    it("syncs only whitelisted owned resources and rejects stale concurrent replacements", async () => {
      const id = crypto.randomUUID(),
        payload = {
          table: "budget_plans",
          input: {
            name: "Offline CAS test",
            amount: 20,
            currency: "USD",
            frequency: "MONTHLY",
            start_date: "2026-11-01",
          },
        };
      const made = await a.rpc("execute_device_command", {
        p_id: id,
        p_kind: "RESOURCE_SAVE",
        p_payload: payload,
      });
      expect(made.error).toBeNull();
      const plan = made.data;
      resourceCleanup.push({ table: "budget_plans", id: plan.id });
      expect(typeof plan.row_version).toBe("string");
      const changes = await Promise.all(
        [30, 40].map((amount) =>
          a.rpc("execute_device_command", {
            p_id: crypto.randomUUID(),
            p_kind: "RESOURCE_SAVE",
            p_payload: {
              id: plan.id,
              table: "budget_plans",
              expectedVersion: plan.row_version,
              input: { amount },
            },
          }),
        ),
      );
      expect(changes.filter((r) => !r.error)).toHaveLength(1);
      expect(changes.filter((r) => r.error?.code === "23505")).toHaveLength(1);
      expect(
        (
          await b.rpc("execute_device_command", {
            p_id: crypto.randomUUID(),
            p_kind: "RESOURCE_DELETE",
            p_payload: {
              id: plan.id,
              table: "budget_plans",
              expectedVersion: changes.find((r) => !r.error)!.data.row_version,
              input: {},
            },
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await a.rpc("execute_device_command", {
            p_id: crypto.randomUUID(),
            p_kind: "RESOURCE_SAVE",
            p_payload: {
              table: "accounts",
              input: { name: "Bypass", balance: 999 },
            },
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await a.rpc("execute_device_command", {
            p_id: crypto.randomUUID(),
            p_kind: "RESOURCE_SAVE",
            p_payload: {
              table: "budget_plans",
              input: {
                ...payload.input,
                user_id: (await b.auth.getUser()).data.user!.id,
              },
            },
          })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await a.rpc("execute_device_command", {
            p_id: crypto.randomUUID(),
            p_kind: "RESOURCE_DELETE",
            p_payload: {
              id: plan.id,
              table: "budget_plans",
              expectedVersion: changes.find((r) => !r.error)!.data.row_version,
              input: {},
            },
          })
        ).error,
      ).toBeNull();
      resourceCleanup.pop();
    });
    it("reconciles a real offline loan and bill queue with hosted ledger operations", async () => {
      const snapshot = await a.rpc("export_device_snapshot");
      expect(snapshot.error).toBeNull();
      const actor = (await a.auth.getUser()).data.user!.id;
      const w = blankWorkspace("Synthetic offline", "USD", "UTC");
      w.mode = "CLOUD";
      w.ownerId = actor;
      w.profile.id = actor;
      w.tables = snapshot.data.tables;
      const before = Number(
        w.tables.accounts.find((x) => x.id === account)!.balance,
      );
      const loan = createLocalLoan(w, {
        name: "Offline queue fixture",
        counterparty: "Synthetic",
        principal: 10,
        direction: "LENT",
        startDate: "2026-11-01",
        accountId: account,
      });
      payLocalLoan(w, loan, {
        principal: 10,
        interest: 1,
        accountId: account,
        date: "2026-11-11",
      });
      const bill = saveLocalBill(w, {
        name: "Offline bill fixture",
        type: "EXPENSE",
        amount: 2,
        frequency: "ONCE",
        startDate: "2026-11-01",
        endDate: "2026-11-01",
        timezone: "UTC",
        accountId: account,
      });
      generateLocalBills(w, new Date("2026-11-11T12:00:00Z"));
      const draft = w.tables.bill_occurrences.find((d) => d.bill_id === bill)!;
      reviewLocalBill(w, String(draft.id), "RECORD", {
        accountId: account,
        amount: 2,
      });
      for (let index = 0; w.commands.length && index < 20; index++) {
        const c = w.commands[0],
          map =
            (w as Workspace & { resolvedIds?: Record<string, string> })
              .resolvedIds ?? {};
        const r = await a.rpc("execute_device_command", {
          p_id: c.id,
          p_kind: c.kind,
          p_payload: resolveReferences(c.payload, map),
          p_expected_updated_at: c.expectedUpdatedAt ?? null,
        });
        expect(
          r.error,
          JSON.stringify({ kind: c.kind, error: r.error }),
        ).toBeNull();
        acknowledge(w, c, camelCase(r.data));
      }
      expect(w.commands).toHaveLength(0);
      expect(
        (await a.from("accounts").select("balance").eq("id", account).single())
          .data!.balance,
      ).toBeCloseTo(before - 1, 4);
      const ids = (w as Workspace & { resolvedIds: Record<string, string> })
        .resolvedIds;
      const loanRow = (
        await a.from("personal_loans").select("*").eq("id", ids[loan]).single()
      ).data!;
      expect(
        (
          await a.rpc("manage_personal_loan", {
            p_id: loanRow.id,
            p_input: {
              name: loanRow.name,
              counterparty: loanRow.counterparty,
              firstDueDate: null,
              frequency: "MONTHLY",
              installmentCount: 1,
              notes: "",
              archived: true,
            },
          })
        ).error,
      ).toBeNull();
      const realDraft = (
        await a
          .from("bill_occurrences")
          .select("*")
          .eq("bill_id", ids[bill])
          .single()
      ).data!;
      expect(
        (
          await a.rpc("review_bill_occurrence", {
            p_id: realDraft.id,
            p_action: "REVERSE",
          })
        ).error,
      ).toBeNull();
      const payment = (
        await a
          .from("loan_payments")
          .select("*")
          .eq("loan_id", ids[loan])
          .single()
      ).data!;
      expect(
        (await a.rpc("reverse_loan_payment", { p_id: payment.id })).error,
      ).toBeNull();
      expect(
        (
          await a.rpc("record_loan_payment", {
            p_loan_id: loanRow.id,
            p_input: {
              principal: 10,
              interest: 0,
              accountId: account,
              dateTime: "2026-11-11T12:00:00Z",
              requestKey: crypto.randomUUID(),
            },
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await a.rpc("manage_personal_loan", {
            p_id: loanRow.id,
            p_input: {
              name: loanRow.name,
              counterparty: loanRow.counterparty,
              firstDueDate: null,
              frequency: "MONTHLY",
              installmentCount: 1,
              notes: "",
              archived: true,
            },
          })
        ).error,
      ).toBeNull();
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
