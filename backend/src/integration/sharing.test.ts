import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Server } from "node:http";
import { AddressInfo } from "node:net";
import dotenv from "dotenv";
import { app } from "../app";
dotenv.config({ path: ".env.integration.local", quiet: true });
const live = process.env.RUN_SUPABASE_INTEGRATION === "1";
const aid = "55555555-5555-4555-8555-555555555555",
  bid = "66666666-6666-4666-8666-666666666666";
describe.skipIf(!live)("hosted sharing release", () => {
  let server: Server,
    base: string,
    clients: SupabaseClient[] = [],
    tokens: string[] = [],
    group: string,
    template: string,
    schedule: string;
  const groups: string[] = [];
  async function api(path: string, method = "GET", body?: unknown, actor = 0) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens[actor]}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      data: res.status === 204 ? null : await res.json(),
    };
  }
  const payload = (mode = "EQUAL") => ({
    description: "Shared rent",
    totalAmount: 10.01,
    splitType: mode,
    payers: [{ userId: aid, amountPaid: 10.01 }],
    participants: [
      {
        userId: aid,
        ...(mode !== "EQUAL" ? { shareValue: mode === "EXACT" ? 5 : 50 } : {}),
      },
      {
        userId: bid,
        ...(mode !== "EQUAL"
          ? { shareValue: mode === "EXACT" ? 5.01 : 50 }
          : {}),
      },
    ],
  });
  beforeAll(async () => {
    clients = Array.from({ length: 3 }, () =>
      createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
    for (const [i, c] of clients.entries()) {
      const result = await c.auth.signInWithPassword({
        email: `http-${"abc"[i]}@example.invalid`,
        password: process.env.SUPABASE_TEST_PASSWORD!,
      });
      if (result.error) throw result.error;
      tokens.push(result.data.session!.access_token);
    }
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const result = await api("/groups", "POST", {
      name: "Sharing integration",
    });
    expect(result.status).toBe(201);
    group = result.data.id;
    groups.push(group);
  }, 30000);
  afterAll(async () => {
    if (schedule)
      await api(`/recurring/schedules/${schedule}`, "PUT", {
        status: "ARCHIVED",
      });
    for (const id of groups) {
      const response = await api(`/groups/${id}`, "DELETE");
      expect(response.status).toBe(204);
    }
    await Promise.all(clients.map((c) => c.auth.signOut({ scope: "local" })));
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 30000);
  it("keeps pending users private and approvals idempotent", async () => {
    const invite = await api(`/invitations/groups/${group}`, "POST", {});
    expect(invite.status).toBe(201);
    expect(invite.data.token).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await api(`/invitations/groups/${group}`, "POST", {}, 1)).status,
    ).toBe(403);
    const request = await api(
      "/invitations/request",
      "POST",
      { token: invite.data.token },
      1,
    );
    expect(request.data.status).toBe("PENDING");
    expect(request.data).not.toHaveProperty("members");
    await api("/invitations/request", "POST", { token: invite.data.token }, 1);
    expect((await api(`/groups/${group}`, "GET", undefined, 1)).status).toBe(
      404,
    );
    const list = await api(`/invitations/groups/${group}`);
    expect(list.data.requests).toHaveLength(1);
    const approvals = await Promise.all(
      Array.from({ length: 3 }, () =>
        api(
          `/invitations/groups/${group}/requests/${list.data.requests[0].id}`,
          "POST",
          { decision: "APPROVE" },
        ),
      ),
    );
    expect(approvals.every((r) => r.status === 200)).toBe(true);
    expect(
      (await api(`/groups/${group}`, "GET", undefined, 1)).data.members,
    ).toHaveLength(2);
    const direct = await clients[1]
      .from("group_invitations")
      .select("token_hash");
    expect(direct.error).not.toBeNull();
    const regenerated = await api(`/invitations/groups/${group}`, "POST", {});
    expect(
      (
        await api(
          "/invitations/lookup",
          "POST",
          { token: invite.data.token },
          2,
        )
      ).data.valid,
    ).toBe(false);
    expect((await api(`/invitations/groups/${group}`, "DELETE")).status).toBe(
      204,
    );
    expect(
      (
        await api(
          "/invitations/lookup",
          "POST",
          { token: regenerated.data.token },
          2,
        )
      ).data.valid,
    ).toBe(false);
  }, 30000);
  it("validates all split modes and prevents private fields and unauthorized edits", async () => {
    for (const mode of ["EQUAL", "EXACT", "PERCENTAGE", "SHARES"]) {
      const result = await api(`/templates/groups/${group}`, "POST", {
        name: mode,
        payload: payload(mode),
      });
      expect(result.status, result.data.error).toBe(201);
      if (mode === "EQUAL") template = result.data.id;
    }
    const bad = payload();
    bad.participants.push(bad.participants[0]);
    expect(
      (
        await api(`/templates/groups/${group}`, "POST", {
          name: "duplicate",
          payload: bad,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(`/templates/groups/${group}`, "POST", {
          name: "private",
          payload: { ...payload(), categoryId: group },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(
          `/templates/groups/${group}/${template}`,
          "DELETE",
          undefined,
          1,
        )
      ).status,
    ).toBe(403);
    expect(
      (await api(`/templates/groups/${group}`, "GET", undefined, 2)).status,
    ).toBe(403);
    const optional = await api(`/templates/groups/${group}`, "POST", {
      name: "Variable",
      payload: { ...payload(), totalAmount: null, payers: [{ userId: aid }] },
    });
    expect(optional.status).toBe(201);
    const direct = await clients[1]
      .from("split_templates")
      .update({ name: "forged" })
      .eq("id", template);
    expect(direct.error).not.toBeNull();
    expect((await api(`/splits/group/${group}`)).data).toHaveLength(0);
  }, 30000);
  it("creates schedules, enforces owners and protects removal", async () => {
    const result = await api("/recurring/schedules", "POST", {
      templateId: template,
      frequency: "MONTHLY",
      startDate: new Date().toISOString().slice(0, 10),
      timezone: "UTC",
    });
    expect(result.status, result.data.error).toBe(201);
    schedule = result.data.id;
    expect(
      (
        await api(
          `/recurring/schedules/${schedule}`,
          "PUT",
          { status: "PAUSED" },
          1,
        )
      ).status,
    ).toBe(403);
    const bobTemplate = await api(
      `/templates/groups/${group}`,
      "POST",
      { name: "Bob rent", payload: payload() },
      1,
    );
    expect(bobTemplate.status).toBe(201);
    const bobSchedule = await api(
      "/recurring/schedules",
      "POST",
      {
        templateId: bobTemplate.data.id,
        frequency: "WEEKLY",
        startDate: new Date().toISOString().slice(0, 10),
        timezone: "UTC",
      },
      1,
    );
    expect(bobSchedule.status).toBe(201);
    expect(
      (await api(`/groups/${group}/members/${bid}`, "DELETE")).status,
    ).toBe(400);
    expect(
      (
        await api(`/recurring/schedules/${bobSchedule.data.id}`, "PUT", {
          status: "ARCHIVED",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(`/recurring/schedules/${schedule}`, "PUT", {
          status: "PAUSED",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(`/recurring/schedules/${schedule}`, "PUT", {
          status: "ACTIVE",
        })
      ).status,
    ).toBe(200);
    expect((await api("/recurring/drafts")).status).toBe(200);
    expect(
      (await api(`/groups/${group}/members/${bid}`, "DELETE")).status,
    ).toBe(204);
    const rows = await api(`/templates/groups/${group}`);
    expect(
      rows.data.every((t: { needsCorrection: boolean }) => t.needsCorrection),
    ).toBe(true);
    expect(
      (
        await api(`/recurring/schedules/${schedule}`, "PUT", {
          status: "ACTIVE",
        })
      ).status,
    ).toBe(400);
  }, 30000);
  it.skipIf(process.env.RUN_CRON_INTEGRATION !== "1")(
    "posts generated drafts exactly once and rolls failures back",
    async () => {
      expect(
        (await api(`/groups/${group}/members`, "POST", { userId: bid })).status,
      ).toBe(201);
      process.stdout.write("CRON_FIXTURE_READY\n");
      let drafts = await api(`/recurring/drafts?groupId=${group}`);
      for (
        let attempt = 0;
        attempt < 90 && drafts.data.length === 0;
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        drafts = await api(`/recurring/drafts?groupId=${group}`);
      }
      expect(
        drafts.data.length,
        "Run private.generate_expense_drafts() after CRON_FIXTURE_READY",
      ).toBeGreaterThan(0);
      const draft = drafts.data[0];
      expect(draft.payload.description).toBe("Shared rent");
      expect(
        (
          await api(`/templates/groups/${group}/${template}`, "PUT", {
            name: "Updated",
            payload: { ...payload(), description: "Changed future rent" },
          })
        ).status,
      ).toBe(200);
      expect(
        (await api(`/recurring/drafts?groupId=${group}`)).data[0].payload
          .description,
      ).toBe("Shared rent");
      expect(
        (await api(`/recurring/drafts/${draft.id}/skip`, "POST", {}, 1)).status,
      ).toBe(403);
      const bad = await api(`/recurring/drafts/${draft.id}/post`, "POST", {
        ...draft.payload,
        categoryId: group,
      });
      expect(bad.status).toBe(400);
      expect((await api(`/splits/group/${group}`)).data).toHaveLength(0);
      expect(
        (await api(`/recurring/drafts?groupId=${group}`)).data,
      ).toHaveLength(1);
      const posts = await Promise.all(
        Array.from({ length: 5 }, () =>
          api(`/recurring/drafts/${draft.id}/post`, "POST", draft.payload),
        ),
      );
      expect(
        posts.every((p) => p.status === 200),
        JSON.stringify(posts),
      ).toBe(true);
      expect(new Set(posts.map((p) => p.data.id)).size).toBe(1);
      const expense = posts[0].data;
      const splits = await api(`/splits/group/${group}`);
      expect(splits.data).toHaveLength(1);
      expect(
        splits.data[0].participants.reduce(
          (n: number, p: { amountOwed: number }) => n + Number(p.amountOwed),
          0,
        ),
      ).toBeCloseTo(10.01, 2);
      expect(
        (await api(`/recurring/drafts?groupId=${group}`)).data,
      ).toHaveLength(0);
      expect((await api(`/splits/${expense.id}`, "DELETE")).status).toBe(204);
      expect(
        (await api(`/recurring/drafts/${draft.id}/post`, "POST", draft.payload))
          .status,
      ).toBe(400);
    },
    120000,
  );
});
