import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
const fixture = vi.hoisted(() => ({ snapshot: {} as Record<string, unknown> }));
vi.mock("../db", async (original) => ({
  ...(await original<typeof import("../db")>()),
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "synthetic-owner" } }, error: null }) },
    rpc: async () => ({ data: fixture.snapshot, error: null }),
  }),
}));
import portability from "../routes/portability.routes";
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => { server!.close(() => resolve()); server!.closeAllConnections(); });
});
describe("streamed device archive encoding", () => {
  it("preserves multilingual data when an emoji straddles the HTTP chunk boundary", async () => {
    const record = { id: "synthetic-record", notes: "§" };
    fixture.snapshot = { ownerId: "synthetic-owner", tables: { reminders: [record] } };
    const start = JSON.stringify(fixture.snapshot).indexOf("§");
    record.notes = "a".repeat(32767 - start) + "💶" + " हिन्दी العربية español ".repeat(2000);
    const app = express().use("/portability", portability);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/portability/export`, { headers: { Authorization: "Bearer synthetic-token" } });
    expect(response.status).toBe(200);
    const data = await response.json();
    const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
    expect(data.tables.reminders[0].notes.includes("💶")).toBe(true);
    expect(digest(data.tables.reminders[0].notes)).toBe(digest(record.notes));
  });
});
