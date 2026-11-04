import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import dotenv from "dotenv";
import { app } from "../app";
dotenv.config({ path: ".env.integration.local", quiet: true });
const live = process.env.RUN_SUPABASE_INTEGRATION === "1";
describe.skipIf(!live)("hosted receipt access and accounting preservation", () => {
  let server: Server, base: string, account: string, transaction: string;
  const clients: SupabaseClient[] = [], tokens: string[] = [], receipts: string[] = [];
  async function api(path: string, method = "GET", body?: unknown, actor = 0) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[actor]}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }
  beforeAll(async () => {
    for (const email of ["http-a@example.invalid", "http-b@example.invalid"]) {
      const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.signInWithPassword({ email, password: process.env.SUPABASE_TEST_PASSWORD! });
      if (error) throw error;
      clients.push(client); tokens.push(data.session!.access_token);
    }
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const created = await api("/accounts", "POST", { name: "Receipt integration", type: "CASH", currency: "USD" });
    expect(created.status).toBe(201); account = created.data.id;
    const result = await api("/transactions", "POST", { accountId: account, type: "EXPENSE", amount: 10, dateTime: new Date().toISOString() });
    expect(result.status).toBe(201); transaction = result.data.id;
  });
  afterAll(async () => {
    for (const id of receipts) await api(`/receipts/${id}`, "DELETE");
    if (transaction) await api(`/transactions/${transaction}`, "DELETE");
    if (account) await api(`/accounts/${account}`, "DELETE");
    for (const c of clients) await c.auth.signOut({ scope: "local" });
    if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  });
  it("enforces private storage, completion, owner access, and edit preservation", async () => {
    const file = Buffer.from("%PDF-1.4\nfixture receipt\n%%EOF");
    const metadata = { transactionId: transaction, fileName: "fixture.pdf", mimeType: "application/pdf", byteSize: file.length };
    expect((await api("/receipts", "POST", metadata, 1)).status).toBe(403);
    expect((await api("/receipts", "POST", { ...metadata, mimeType: "text/html" })).status).toBe(400);
    expect((await api("/receipts", "POST", { ...metadata, byteSize: 5242881 })).status).toBe(400);
    const created = await api("/receipts", "POST", metadata);
    expect(created.status).toBe(201); const r = created.data; receipts.push(r.id);
    expect((await api(`/receipts/${r.id}/complete`, "POST", {})).status).toBe(400);
    expect((await clients[1].storage.from("receipts").upload(r.objectPath, file, { contentType: "application/pdf" })).error).toBeTruthy();
    expect((await clients[0].storage.from("receipts").upload(r.objectPath, file, { contentType: "application/pdf" })).error).toBeNull();
    expect((await api(`/receipts/${r.id}/complete`, "POST", {})).status).toBe(200);
    expect((await api(`/receipts?transactionId=${transaction}`, "GET", undefined, 1)).data).toEqual([]);
    expect((await clients[1].storage.from("receipts").download(r.objectPath)).error).toBeTruthy();
    expect((await clients[1].storage.from("receipts").createSignedUrl(r.objectPath, 60)).error).toBeTruthy();
    const signed = await api(`/receipts/${r.id}/download`, "POST", {});
    expect(signed.status).toBe(200); const response = await fetch(signed.data.url);
    expect(response.status).toBe(200); expect(await response.text()).toContain("fixture receipt");
    const changed = await api(`/transactions/${transaction}`, "PUT", { accountId: account, type: "EXPENSE", amount: 12.34, dateTime: new Date().toISOString() });
    expect(changed.status).toBe(200);
    expect((await api(`/receipts?transactionId=${transaction}`)).data[0].id).toBe(r.id);
    expect((await api(`/accounts/${account}`)).data.balance).toBe(-12.34);
    expect((await api(`/transactions/${transaction}`, "DELETE")).status).toBe(400);
    expect((await api(`/accounts/${account}`)).data.balance).toBe(-12.34);
    const forged = await clients[1].from("receipt_attachments").insert({ uploader_id: "66666666-6666-4666-8666-666666666666", transaction_id: transaction, file_name: "forged.pdf", mime_type: "application/pdf", byte_size: 1, object_path: "forged/receipt.pdf" });
    expect(forged.error).toBeTruthy();
    expect((await api(`/receipts/${r.id}`, "DELETE", undefined, 1)).status).not.toBe(204);
    expect((await api(`/receipts/${r.id}`, "DELETE")).status).toBe(204);
    receipts.splice(receipts.indexOf(r.id), 1);
    expect((await clients[0].storage.from("receipts").download(r.objectPath)).error).toBeTruthy();
  });
});
