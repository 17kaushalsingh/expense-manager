import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Server } from "node:http";
import { app } from "./app";

describe("HTTP response privacy and parser errors", () => {
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });

  it("prevents caching on successful and unauthorized responses", async () => {
    for (const path of ["/api/health", "/api/accounts"]) {
      const response = await fetch(origin + path);
      expect(response.status).toBe(path.endsWith("health") ? 200 : 401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.has("x-powered-by")).toBe(false);
    }
  });

  it("rejects oversized bodies without logging submitted credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await fetch(origin + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "sensitive".repeat(20_000) }),
      });
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "Request body is too large" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
