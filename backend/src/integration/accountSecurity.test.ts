import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { app } from "../app";
dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.integration.local", quiet: true });
describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== "1")(
  "hosted account session controls",
  () => {
    let server: Server,
      base: string,
      account: string,
      transaction: string,
      receipt: string,
      objectPath: string,
      freshReceipt: string,
      freshPath: string;
    const clients: SupabaseClient[] = [],
      tokens: string[] = [],
      sids: string[] = [];
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
    beforeAll(async () => {
      for (const letter of ["a", "a", "a", "b"]) {
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
        sids.push(
          JSON.parse(
            Buffer.from(
              r.data.session!.access_token.split(".")[1],
              "base64url",
            ).toString(),
          ).session_id,
        );
      }
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      const a = await api("/accounts", "POST", {
        name: "Synthetic session receipt",
        type: "CASH",
        currency: "USD",
        balance: 0,
      });
      expect(a.status).toBe(201);
      account = a.data.id;
      const t = await api("/transactions", "POST", {
        accountId: account,
        type: "EXPENSE",
        amount: 1,
        dateTime: new Date().toISOString(),
      });
      expect(t.status).toBe(201);
      transaction = t.data.id;
      const file = Buffer.from("%PDF-1.4\nsynthetic session receipt\n%%EOF");
      const m = await api("/receipts", "POST", {
        transactionId: transaction,
        fileName: "session.pdf",
        mimeType: "application/pdf",
        byteSize: file.length,
      });
      expect(m.status).toBe(201);
      receipt = m.data.id;
      objectPath = m.data.objectPath;
      expect(
        (
          await clients[0].storage
            .from("receipts")
            .upload(objectPath, file, { contentType: "application/pdf" })
        ).error,
      ).toBeNull();
      expect((await api(`/receipts/${receipt}/complete`, "POST")).status).toBe(
        200,
      );
      const fresh = await api("/receipts", "POST", {
        transactionId: transaction,
        fileName: "uncached-session.pdf",
        mimeType: "application/pdf",
        byteSize: file.length,
      });
      expect(fresh.status).toBe(201);
      freshReceipt = fresh.data.id;
      freshPath = fresh.data.objectPath;
      expect(
        (
          await clients[0].storage
            .from("receipts")
            .upload(freshPath, file, { contentType: "application/pdf" })
        ).error,
      ).toBeNull();
      expect(
        (await api(`/receipts/${freshReceipt}/complete`, "POST")).status,
      ).toBe(200);
    });
    afterAll(async () => {
      // Client zero remains active until all fixture finances/files are reversed.
      if (receipt)
        expect((await api(`/receipts/${receipt}`, "DELETE")).status).toBe(204);
      if (freshReceipt)
        expect((await api(`/receipts/${freshReceipt}`, "DELETE")).status).toBe(
          204,
        );
      if (transaction)
        expect(
          (await api(`/transactions/${transaction}`, "DELETE")).status,
        ).toBe(204);
      if (account)
        expect((await api(`/accounts/${account}`, "DELETE")).status).toBe(204);
      await Promise.all(clients.map((c) => c.auth.signOut({ scope: "local" })));
      if (server)
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
    });
    it("lists and names only owned sessions without exposing tokens, IPs or signing material", async () => {
      const list = await api("/users/security/sessions");
      expect(list.status).toBe(200);
      const own = list.data.find((d: { id: string }) => d.id === sids[0]);
      expect(own.isCurrent).toBe(true);
      expect(list.data.some((d: { id: string }) => d.id === sids[3])).toBe(
        false,
      );
      expect(JSON.stringify(list.data)).not.toMatch(
        /refresh_token|access_token|hmac|ip_address/,
      );
      expect(
        (
          await api(`/users/security/sessions/${sids[1]}`, "PUT", {
            name: "Synthetic second device",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api(
            `/users/security/sessions/${sids[1]}`,
            "PUT",
            { name: "Forged" },
            3,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await api("/users/security/sessions/not-a-uuid", "PUT", {
            name: "Invalid",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await api(`/users/security/sessions/${sids[1]}`, "PUT", {
            name: "",
            userId: "forged",
          })
        ).status,
      ).toBe(400);
      const b = await api("/users/security/activity", "GET", undefined, 3);
      expect(b.status).toBe(200);
      expect(
        b.data.some((r: { sessionId: string }) =>
          sids.slice(0, 3).includes(r.sessionId),
        ),
      ).toBe(false);
      const anonymous = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      expect((await anonymous.rpc("list_account_sessions")).error).toBeTruthy();
    });
    it("revokes a selected device immediately across REST, privileged RPCs, storage and refresh", async () => {
      expect(
        (await clients[1].storage.from("receipts").download(objectPath)).error,
      ).toBeNull();
      expect(
        (
          await api(
            "/users/security/revoke",
            "POST",
            { scope: "ONE", id: sids[1] },
            3,
          )
        ).status,
      ).toBe(404);
      const removed = await api("/users/security/revoke", "POST", {
        scope: "ONE",
        id: sids[1],
      });
      expect(removed.status).toBe(200);
      expect(removed.data).toMatchObject({
        revokedCount: 1,
        currentRevoked: false,
      });
      expect((await api("/accounts", "GET", undefined, 1)).status).toBe(401);
      // Use the original JWT, rather than a client that may clear itself after a failed refresh.
      const stale = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${tokens[1]}` } },
        },
      );
      expect((await stale.from("accounts").select("id")).error?.code).toBe(
        "PT401",
      );
      expect(
        (
          await stale.rpc("manage_account", {
            p_input: {
              name: "Must never exist",
              type: "CASH",
              currency: "USD",
            },
          })
        ).error?.code,
      ).toBe("PT401");
      // Cached authorized downloads may outlive revocation at Supabase's CDN.
      // A new object and a new signed URL must still recheck the session at origin.
      expect(
        (await stale.storage.from("receipts").download(freshPath)).error,
      ).toBeTruthy();
      expect(
        (await stale.storage.from("receipts").createSignedUrl(objectPath, 60))
          .error,
      ).toBeTruthy();
      expect((await clients[1].auth.refreshSession()).error).toBeTruthy();
      const retry = await api("/users/security/revoke", "POST", {
        scope: "ONE",
        id: sids[1],
      });
      expect(retry.status).toBe(200);
      expect(retry.data.revokedCount).toBe(0);
      expect((await api("/accounts")).status).toBe(200);
      const history = await api("/users/security/activity");
      expect(history.status).toBe(200);
      expect(
        history.data.some(
          (r: { sessionId: string; action: string }) =>
            r.sessionId === sids[1] && r.action === "REVOKE",
        ),
      ).toBe(true);
    });
    it("signs out other devices while retaining the caller and isolating another user", async () => {
      const result = await api("/users/security/revoke", "POST", {
        scope: "OTHERS",
      });
      expect(result.status).toBe(200);
      expect(result.data.currentRevoked).toBe(false);
      expect((await api("/users/profile", "GET", undefined, 2)).status).toBe(
        401,
      );
      expect((await api("/users/profile")).status).toBe(200);
      expect((await api("/users/profile", "GET", undefined, 3)).status).toBe(
        200,
      );
    });
    it("can revoke every session including the calling device", async () => {
      // A separate synthetic Bob session exercises ALL without destroying Alice's cleanup session.
      const result = await api(
        "/users/security/revoke",
        "POST",
        { scope: "ALL" },
        3,
      );
      expect(result.status).toBe(200);
      expect(result.data.currentRevoked).toBe(true);
      expect(
        (await api("/users/security/sessions", "GET", undefined, 3)).status,
      ).toBe(401);
      expect((await clients[3].auth.refreshSession()).error).toBeTruthy();
      expect((await api("/users/security/sessions")).status).toBe(200);
    });
  },
);
