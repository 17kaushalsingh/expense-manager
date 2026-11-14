import { beforeEach, it, expect, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../db", async (original) => ({
  ...(await original<object>()),
  getSupabaseClient: () => ({ rpc }),
}));
import { authenticate } from "./auth";
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({
    data: { session_id: "session-id", user_id: "verified-id" },
    error: null,
  });
});
function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
}
it("keeps expired tokens unauthorized and never forwards an unverified identity", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "PGRST301" } });
  const res = response(),
    next = vi.fn();
  await authenticate(
    { headers: { authorization: "Bearer invalid" } } as never,
    res as never,
    next,
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
it("reports a provider outage without treating the user's session as invalid", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: "", message: "Network unavailable" },
  });
  const res = response(),
    next = vi.fn();
  await authenticate(
    { headers: { authorization: "Bearer fixture" } } as never,
    res as never,
    next,
  );
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "30");
  expect(next).not.toHaveBeenCalled();
});
it("forwards only a validated identity and request-scoped client", async () => {
  const req = {
      headers: { authorization: "Bearer fixture" },
      userId: undefined,
    },
    res = response(),
    next = vi.fn();
  await authenticate(req as never, res as never, next);
  expect(req.userId).toBe("verified-id");
  expect(next).toHaveBeenCalledOnce();
});
it("rejects a revoked session even while its access token is otherwise valid", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "PT401" } });
  const res = response(),
    next = vi.fn();
  await authenticate(
    { headers: { authorization: "Bearer revoked" } } as never,
    res as never,
    next,
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
it("fails closed if session verification is unavailable", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
  const res = response(),
    next = vi.fn();
  await authenticate(
    { headers: { authorization: "Bearer valid" } } as never,
    res as never,
    next,
  );
  expect(res.status).toHaveBeenCalledWith(503);
  expect(next).not.toHaveBeenCalled();
});
