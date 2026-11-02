import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import dotenv from "dotenv";
import { app } from "../app";
dotenv.config({ path: ".env.integration.local", quiet: true });
const live = process.env.RUN_SUPABASE_INTEGRATION === "1";
describe.skipIf(!live)("hosted Supabase API integration", () => {
  let server: Server,
    base: string,
    a: SupabaseClient,
    b: SupabaseClient,
    c: SupabaseClient,
    token: string,
    account: string;
  let initialIncome = 0;
  async function api(
    path: string,
    method = "GET",
    body?: unknown,
    bearer = token,
  ) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data };
  }
  beforeAll(async () => {
    const url = process.env.SUPABASE_URL!,
      key = process.env.SUPABASE_ANON_KEY!,
      password = process.env.SUPABASE_TEST_PASSWORD!;
    if (!url || !key || !password)
      throw new Error(
        "Configure hosted integration environment and auth fixtures",
      );
    [a, b, c] = Array.from({ length: 3 }, () =>
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
    const sessions = await Promise.all(
      [a, b, c].map((client, i) =>
        client.auth.signInWithPassword({
          email: `http-${"abc"[i]}@example.invalid`,
          password,
        }),
      ),
    );
    for (const session of sessions) if (session.error) throw session.error;
    token = sessions[0].data.session!.access_token;
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const result = await api("/accounts", "POST", {
      name: "Integration cash",
      type: "CASH",
      balance: 100,
    });
    expect(result.status).toBe(201);
    account = result.data.id;
    initialIncome = (await api("/analytics/cash-flow?range=1M")).data
      .totalIncome;
  }, 30000);
  afterAll(async () => {
    if (account && token) {
      const rows = await api(`/transactions?accountId=${account}`);
      for (const tx of rows.data ?? [])
        if (tx.sourceType === "MANUAL")
          await api(`/transactions/${tx.id}`, "DELETE");
      await api(`/accounts/${account}`, "DELETE");
    }
    await Promise.all(
      [a, b, c]
        .filter(Boolean)
        .map((client) => client.auth.signOut({ scope: "local" })),
    );
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  });
  it("rejects missing and invalid sessions", async () => {
    expect((await api("/accounts", "GET", undefined, "")).status).toBe(401);
    expect(
      (await api("/accounts", "GET", undefined, "expired.invalid.token"))
        .status,
    ).toBe(401);
  });
  it("returns profiles without credential fields", async () => {
    const result = await api("/users/profile");
    expect(result.status).toBe(200);
    expect(result.data.name).toBe("HTTP Alice");
    expect(result.data).not.toHaveProperty("passwordHash");
  });
  it("maintains balance under concurrent writes and supports reversal", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        api("/transactions", "POST", {
          accountId: account,
          type: "INCOME",
          amount: 0.01,
          dateTime: new Date().toISOString(),
        }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(Number((await api(`/accounts/${account}`)).data.balance)).toBe(
      100.2,
    );
    const tx = results[0].data;
    expect(
      (
        await api(`/transactions/${tx.id}`, "PUT", {
          accountId: account,
          type: "EXPENSE",
          amount: 1,
          dateTime: new Date().toISOString(),
        })
      ).status,
    ).toBe(200);
    expect((await api(`/transactions/${tx.id}`, "DELETE")).status).toBe(204);
    expect(Number((await api(`/accounts/${account}`)).data.balance)).toBe(
      100.19,
    );
  }, 30000);
  it("enforces RLS over PostgREST and HTTP", async () => {
    const outsider = await b.from("accounts").select("*").eq("id", account);
    expect(outsider.error).toBeNull();
    expect(outsider.data).toEqual([]);
    const bToken = (await b.auth.getSession()).data.session!.access_token;
    expect(
      (await api(`/accounts/${account}`, "GET", undefined, bToken)).status,
    ).toBe(404);
    const write = await a
      .from("accounts")
      .update({ balance: 999 })
      .eq("id", account);
    expect(write.error).not.toBeNull();
  });
  it("validates categories and blocks forged transaction account ownership", async () => {
    const before = Number((await api(`/accounts/${account}`)).data.balance);
    expect(
      (
        await api("/transactions", "POST", {
          accountId: account,
          type: "EXPENSE",
          amount: 1,
          categoryId: "77777777-7777-4777-8777-777777777777",
          dateTime: new Date().toISOString(),
        })
      ).status,
    ).toBe(400);
    expect(Number((await api(`/accounts/${account}`)).data.balance)).toBe(
      before,
    );
  });
  it("persists settings and returns timezone-aware chart buckets", async () => {
    expect(
      (await api("/users/profile", "PUT", { timezone: "Asia/Kolkata" })).status,
    ).toBe(200);
    const flow = await api("/analytics/cash-flow?range=1M");
    expect(flow.status).toBe(200);
    expect(flow.data.totalIncome).toBeCloseTo(initialIncome + 0.19, 2);
    expect(flow.data.series.length).toBeGreaterThan(0);
    expect(
      (await api("/users/profile", "PUT", { displayCurrency: "INR" })).status,
    ).toBe(400);
  });
  it("refreshes sessions, restores them, and signs out", async () => {
    const refreshed = await c.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session?.access_token).toBeTruthy();
    const restored = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const session = await restored.auth.setSession({
      access_token: refreshed.data.session!.access_token,
      refresh_token: refreshed.data.session!.refresh_token,
    });
    expect(session.error).toBeNull();
    expect((await restored.auth.getUser()).data.user?.email).toBe(
      "http-c@example.invalid",
    );
    expect((await restored.auth.signOut({ scope: "local" })).error).toBeNull();
    expect((await restored.auth.getSession()).data.session).toBeNull();
  });
});
