import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import dotenv from "dotenv";
import { app } from "../app";
dotenv.config({ path: ".env.integration.local", quiet: true });
const live = process.env.RUN_SUPABASE_INTEGRATION === "1";
describe.skipIf(!live)(
  "hosted receipt access and accounting preservation",
  () => {
    let server: Server, base: string, account: string, transaction: string;
    const clients: SupabaseClient[] = [],
      tokens: string[] = [],
      receipts: string[] = [],
      splits: string[] = [],
      groups: string[] = [];
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
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
      };
    }
    beforeAll(async () => {
      for (const email of [
        "http-a@example.invalid",
        "http-b@example.invalid",
      ]) {
        const client = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await client.auth.signInWithPassword({
          email,
          password: process.env.SUPABASE_TEST_PASSWORD!,
        });
        if (error) throw error;
        clients.push(client);
        tokens.push(data.session!.access_token);
      }
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
      const created = await api("/accounts", "POST", {
        name: "Receipt integration",
        type: "CASH",
        currency: "USD",
      });
      expect(created.status).toBe(201);
      account = created.data.id;
      const result = await api("/transactions", "POST", {
        accountId: account,
        type: "EXPENSE",
        amount: 10,
        dateTime: new Date().toISOString(),
      });
      expect(result.status).toBe(201);
      transaction = result.data.id;
    });
    afterAll(async () => {
      for (const id of receipts) await api(`/receipts/${id}`, "DELETE");
      for (const id of splits) await api(`/splits/${id}`, "DELETE");
      if (account) {
        const rows = await api(`/transactions?accountId=${account}`);
        for (const row of rows.data ?? [])
          await api(`/transactions/${row.id}`, "DELETE");
      }
      if (account) await api(`/accounts/${account}`, "DELETE");
      for (const id of groups) await api(`/groups/${id}`, "DELETE");
      for (const c of clients) await c.auth.signOut({ scope: "local" });
      if (server)
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
    });
    it("enforces private storage, completion, owner access, and edit preservation", async () => {
      const file = Buffer.from("%PDF-1.4\nfixture receipt\n%%EOF");
      const metadata = {
        transactionId: transaction,
        fileName: "fixture.html",
        mimeType: "application/pdf",
        byteSize: file.length,
      };
      expect((await api("/receipts", "POST", metadata, 1)).status).toBe(403);
      expect(
        (await api("/receipts", "POST", { ...metadata, mimeType: "text/html" }))
          .status,
      ).toBe(400);
      expect(
        (await api("/receipts", "POST", { ...metadata, byteSize: 5242881 }))
          .status,
      ).toBe(400);
      const created = await api("/receipts", "POST", metadata);
      expect(created.status).toBe(201);
      const r = created.data;
      receipts.push(r.id);
      expect(r.fileName).toBe("fixture.pdf");
      expect((await api(`/receipts/${r.id}/complete`, "POST", {})).status).toBe(
        400,
      );
      expect(
        (
          await clients[1].storage
            .from("receipts")
            .upload(r.objectPath, file, { contentType: "application/pdf" })
        ).error,
      ).toBeTruthy();
      expect(
        (
          await clients[0].storage
            .from("receipts")
            .upload(r.objectPath, file, { contentType: "application/pdf" })
        ).error,
      ).toBeNull();
      expect((await api(`/receipts/${r.id}/complete`, "POST", {})).status).toBe(
        200,
      );
      expect(
        (
          await api(
            `/receipts?transactionId=${transaction}`,
            "GET",
            undefined,
            1,
          )
        ).data,
      ).toEqual([]);
      expect(
        (await clients[1].storage.from("receipts").download(r.objectPath))
          .error,
      ).toBeTruthy();
      expect(
        (
          await clients[1].storage
            .from("receipts")
            .createSignedUrl(r.objectPath, 60)
        ).error,
      ).toBeTruthy();
      const signed = await api(`/receipts/${r.id}/download`, "POST", {});
      expect(signed.status).toBe(200);
      const response = await fetch(signed.data.url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("fixture receipt");
      const changed = await api(`/transactions/${transaction}`, "PUT", {
        accountId: account,
        type: "EXPENSE",
        amount: 12.34,
        dateTime: new Date().toISOString(),
      });
      expect(changed.status).toBe(200);
      expect(
        (await api(`/receipts?transactionId=${transaction}`)).data[0].id,
      ).toBe(r.id);
      expect((await api(`/accounts/${account}`)).data.balance).toBe(-12.34);
      expect((await api(`/transactions/${transaction}`, "DELETE")).status).toBe(
        400,
      );
      expect((await api(`/accounts/${account}`)).data.balance).toBe(-12.34);
      const forged = await clients[1].from("receipt_attachments").insert({
        uploader_id: "66666666-6666-4666-8666-666666666666",
        transaction_id: transaction,
        file_name: "forged.pdf",
        mime_type: "application/pdf",
        byte_size: 1,
        object_path: "forged/receipt.pdf",
      });
      expect(forged.error).toBeTruthy();
      expect(
        (await api(`/receipts/${r.id}`, "DELETE", undefined, 1)).status,
      ).not.toBe(204);
      expect((await api(`/receipts/${r.id}`, "DELETE")).status).toBe(204);
      receipts.splice(receipts.indexOf(r.id), 1);
      expect(
        (await clients[0].storage.from("receipts").download(r.objectPath))
          .error,
      ).toBeTruthy();
    });
    it("posts item shares once, ignores forged exact allocations, and rolls back invalid replacement", async () => {
      const a = "55555555-5555-4555-8555-555555555555",
        b = "66666666-6666-4666-8666-666666666666";
      const body = {
        description: "Itemization integration",
        totalAmount: 12.02,
        splitType: "EXACT",
        payers: [{ userId: a, amountPaid: 12.02, accountId: account }],
        participants: [
          { userId: a, shareValue: 12.02 },
          { userId: b, shareValue: 0 },
        ],
        itemization: {
          items: [
            { label: "Shared", amount: 5.01, participantIds: [b, a] },
            { label: "Bob", amount: 5, participantIds: [b] },
          ],
          tax: 1,
          tip: 1.01,
        },
      };
      const created = await api("/splits", "POST", body);
      expect(created.status).toBe(201);
      const id = created.data.id;
      splits.push(id);
      expect(created.data.itemization.items).toHaveLength(2);
      expect(
        created.data.participants.find(
          (p: { userId: string }) => p.userId === a,
        ).amountOwed,
      ).toBe(3.02);
      expect(
        created.data.participants.find(
          (p: { userId: string }) => p.userId === b,
        ).amountOwed,
      ).toBe(9);
      for (const [index, amount] of [
        [0, 3.02],
        [1, 9],
      ]) {
        const entries = await clients[index]
          .from("transactions")
          .select("analytics_amount")
          .eq("source_id", id)
          .eq("type", "EXPENSE");
        expect(entries.error).toBeNull();
        expect(entries.data).toEqual([{ analytics_amount: amount }]);
      }
      const before = (await api(`/accounts/${account}`)).data.balance;
      expect(
        (await api(`/splits/${id}`, "PUT", { ...body, totalAmount: 12.03 }))
          .status,
      ).toBe(400);
      expect((await api(`/accounts/${account}`)).data.balance).toBe(before);
      expect((await api(`/splits/${id}`, "PUT", body, 1)).status).toBe(403);
      expect((await api(`/splits/${id}`, "DELETE")).status).toBe(204);
      splits.pop();
    });

    it("previews CSV without writes and posts concurrent retries exactly once", async () => {
      const csv =
        "Date,Amount,Type,Notes\n2026-11-05,10,INCOME,CSV wages\n2026-11-05,3,EXPENSE,CSV tea\n2026-11-05,10,INCOME,CSV wages\ninvalid,2,EXPENSE,Bad date";
      const before = (await api(`/accounts/${account}`)).data.balance;
      const preview = await api("/imports/preview", "POST", {
        csv,
        accountId: account,
      });
      expect(preview.status).toBe(200);
      expect(preview.data.rows[2].data.duplicate).toBe(true);
      expect(preview.data.rows[3].error).toBeTruthy();
      expect((await api(`/accounts/${account}`)).data.balance).toBe(before);
      const body = {
        batchId: preview.data.batchId,
        accountId: account,
        timezone: preview.data.timezone,
        rows: preview.data.rows
          .slice(0, 3)
          .map((r: { data: unknown }) => r.data),
      };
      const posted = await Promise.all(
        Array.from({ length: 5 }, () => api("/imports", "POST", body)),
      );
      expect(posted.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      for (const r of posted)
        expect(r.data).toMatchObject({ created: 2, skipped: 1 });
      expect((await api(`/accounts/${account}`)).data.balance).toBeCloseTo(
        before + 7,
        2,
      );
      const overflowingBatch = crypto.randomUUID();
      const overflow = await clients[0].rpc("import_transactions_atomic", {
        p_input: {
          ...body,
          batchId: overflowingBatch,
          rows: [
            {
              ...body.rows[0],
              amount: 999999999999.99,
              notes: "Overflow first",
            },
            { ...body.rows[0], amount: 100, notes: "Overflow second" },
          ],
        },
      });
      // Precision is wider for FX; the explicit account-range constraint still rolls back the entire import.
      expect(overflow.error?.code).toBe("23514");
      expect((await api(`/accounts/${account}`)).data.balance).toBeCloseTo(
        before + 7,
        2,
      );
      expect(
        (
          await clients[0]
            .from("transaction_imports")
            .select("id")
            .eq("id", overflowingBatch)
        ).data,
      ).toEqual([]);
      expect(
        (
          await api("/imports", "POST", {
            ...body,
            batchId: crypto.randomUUID(),
            timezone: "Invalid/Zone",
          })
        ).status,
      ).toBe(400);
      expect(
        (await api("/imports", "POST", { ...body, rows: [body.rows[0]] }))
          .status,
      ).toBe(400);
      const again = await api("/imports/preview", "POST", {
        csv,
        accountId: account,
      });
      expect(
        again.data.rows
          .slice(0, 3)
          .every((r: { data: { duplicate: boolean } }) => r.data.duplicate),
      ).toBe(true);
      const invalid = await clients[0].rpc("import_transactions_atomic", {
        p_input: {
          ...body,
          batchId: crypto.randomUUID(),
          rows: [
            body.rows[0],
            {
              ...body.rows[1],
              categoryId: "11111111-1111-4111-8111-111111111111",
            },
          ],
        },
      });
      expect(invalid.error).toBeTruthy();
      expect((await api(`/accounts/${account}`)).data.balance).toBeCloseTo(
        before + 7,
        2,
      );
      const isolated = await clients[1]
        .from("transaction_imports")
        .select("id")
        .eq("id", body.batchId);
      expect(isolated.error).toBeNull();
      expect(isolated.data).toEqual([]);
      const wages = await clients[0]
        .from("transactions")
        .select("*")
        .eq("account_id", account)
        .eq("notes", "CSV wages")
        .single();
      expect(wages.error).toBeNull();
      const wage = wages.data!;
      expect(
        (
          await api(`/transactions/${wage.id}`, "PUT", {
            accountId: account,
            type: "INCOME",
            amount: 11,
            notes: "CSV wages",
            dateTime: wage.date_time,
          })
        ).status,
      ).toBe(200);
      const provenance = await clients[0]
        .from("transaction_import_entries")
        .select("transaction_id")
        .eq("import_id", body.batchId)
        .eq("transaction_id", wage.id);
      expect(provenance.data).toHaveLength(1);
      expect((await api(`/transactions/${wage.id}`, "DELETE")).status).toBe(
        204,
      );
      expect((await api("/imports", "POST", body)).data).toMatchObject({
        created: 2,
        skipped: 1,
      });
      const deletedMatch = await api("/imports/preview", "POST", {
        csv,
        accountId: account,
      });
      expect(deletedMatch.data.rows[0].data.duplicate).toBe(true);
      expect((await api(`/accounts/${account}`)).data.balance).toBeCloseTo(
        before - 3,
        2,
      );
    });

    it("shares receipts with current group members and revokes a nonparticipant's access on removal", async () => {
      const a = "55555555-5555-4555-8555-555555555555",
        b = "66666666-6666-4666-8666-666666666666";
      const group = await api("/groups", "POST", {
        name: "Receipt permissions",
        currency: "USD",
        memberIds: [b],
      });
      expect(group.status).toBe(201);
      const gid = group.data.id;
      groups.push(gid);
      const split = await api("/splits", "POST", {
        groupId: gid,
        description: "Group receipt",
        totalAmount: 2,
        splitType: "EQUAL",
        participants: [{ userId: a }],
        payers: [{ userId: a, amountPaid: 2, accountId: account }],
      });
      expect(split.status).toBe(201);
      splits.push(split.data.id);
      const file = Buffer.from("%PDF-1.4\ngroup receipt\n%%EOF");
      const input = {
        splitId: split.data.id,
        fileName: "group.pdf",
        mimeType: "application/pdf",
        byteSize: file.length,
      };
      expect((await api("/receipts", "POST", input, 1)).status).toBe(403);
      const record = await api("/receipts", "POST", input);
      expect(record.status).toBe(201);
      receipts.push(record.data.id);
      expect(
        (await api(`/receipts?splitId=${split.data.id}`, "GET", undefined, 1))
          .data,
      ).toEqual([]);
      expect(
        (
          await clients[0].storage
            .from("receipts")
            .upload(record.data.objectPath, file, {
              contentType: "application/pdf",
            })
        ).error,
      ).toBeNull();
      expect(
        (await api(`/receipts/${record.data.id}/complete`, "POST", {})).status,
      ).toBe(200);
      expect(
        (await api(`/receipts?splitId=${split.data.id}`, "GET", undefined, 1))
          .data,
      ).toHaveLength(1);
      expect(
        (
          await clients[1].storage
            .from("receipts")
            .download(record.data.objectPath)
        ).error,
      ).toBeNull();
      expect((await api(`/groups/${gid}/members/${b}`, "DELETE")).status).toBe(
        204,
      );
      expect(
        (await api(`/receipts?splitId=${split.data.id}`, "GET", undefined, 1))
          .data,
      ).toEqual([]);
      expect(
        (
          await clients[1].storage
            .from("receipts")
            .createSignedUrl(record.data.objectPath, 60)
        ).error,
      ).toBeTruthy();
      expect((await api(`/receipts/${record.data.id}`, "DELETE")).status).toBe(
        204,
      );
      receipts.pop();
      expect((await api(`/splits/${split.data.id}`, "DELETE")).status).toBe(
        204,
      );
      splits.pop();
      expect((await api(`/groups/${gid}`, "DELETE")).status).toBe(204);
      groups.pop();
    });
    it("lets the current group owner remove another creator's unfinished upload", async () => {
      const b = "66666666-6666-4666-8666-666666666666";
      const group = await api("/groups", "POST", {
        name: "Pending receipt cleanup",
        currency: "USD",
        memberIds: [b],
      });
      expect(group.status).toBe(201);
      groups.push(group.data.id);
      const split = await api(
        "/splits",
        "POST",
        {
          groupId: group.data.id,
          description: "Creator upload",
          totalAmount: 1,
          splitType: "EQUAL",
          participants: [{ userId: b }],
          payers: [{ userId: b, amountPaid: 1 }],
        },
        1,
      );
      expect(split.status).toBe(201);
      splits.push(split.data.id);
      const file = Buffer.from("%PDF-1.4\nunfinished upload\n%%EOF");
      const record = await api(
        "/receipts",
        "POST",
        {
          splitId: split.data.id,
          fileName: "unfinished.pdf",
          mimeType: "application/pdf",
          byteSize: file.length,
        },
        1,
      );
      expect(record.status).toBe(201);
      receipts.push(record.data.id);
      expect(
        (
          await clients[1].storage
            .from("receipts")
            .upload(record.data.objectPath, file, {
              contentType: "application/pdf",
            })
        ).error,
      ).toBeNull();
      const ownerList = await api(`/receipts?splitId=${split.data.id}`);
      expect(ownerList.data).toHaveLength(1);
      expect(ownerList.data[0].status).toBe("PENDING");
      expect((await api(`/receipts/${record.data.id}`, "DELETE")).status).toBe(
        204,
      );
      receipts.pop();
      expect(
        (
          await clients[1].storage
            .from("receipts")
            .download(record.data.objectPath)
        ).error,
      ).toBeTruthy();
      expect((await api(`/splits/${split.data.id}`, "DELETE")).status).toBe(
        204,
      );
      splits.pop();
      expect((await api(`/groups/${group.data.id}`, "DELETE")).status).toBe(
        204,
      );
      groups.pop();
    });
  },
);
