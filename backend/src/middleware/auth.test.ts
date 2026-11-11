import { beforeEach, it, expect, vi } from "vitest";
const getUser = vi.hoisted(() => vi.fn());
vi.mock("../db", async (original) => ({
  ...(await original<object>()),
  getSupabaseClient: () => ({ auth: { getUser } }),
}));
import { authenticate } from "./auth";
beforeEach(() => vi.resetAllMocks());
function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
}
it("keeps expired tokens unauthorized and never forwards an unverified identity", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
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
  getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
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
  getUser.mockResolvedValue({
    data: { user: { id: "verified-id" } },
    error: null,
  });
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
