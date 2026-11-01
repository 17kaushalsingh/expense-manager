import { describe, it, expect, vi, beforeEach } from "vitest";
const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithIdToken: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock("../db", async (original) => ({
  ...(await original<object>()),
  getSupabaseClient: () => ({ auth }),
}));
import router from "./auth.routes";
async function call(path: string, body: unknown) {
  const layer = router.stack.find((layer) => layer.route?.path === path)!;
  const handler = layer.route!.stack[layer.route!.stack.length - 1].handle;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ body } as never, res as never, vi.fn());
  return res;
}
describe("Supabase auth REST responses", () => {
  beforeEach(() => vi.resetAllMocks());
  it("does not create a login session before email confirmation", async () => {
    auth.signUp.mockResolvedValue({
      data: {
        session: null,
        user: {
          id: "id",
          email: "test@example.invalid",
          user_metadata: { name: "Test" },
        },
      },
      error: null,
    });
    const response = await call("/register", {
      email: "test@example.invalid",
      password: "testpassword",
      name: "Test",
    });
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: null,
        session: null,
        confirmationRequired: true,
      }),
    );
  });
  it("returns invalid login as unauthorized", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" },
    });
    const response = await call("/login", {});
    expect(response.status).toHaveBeenCalledWith(401);
  });
  it("exchanges Google credentials with Supabase", async () => {
    auth.signInWithIdToken.mockResolvedValue({
      data: {
        session: { access_token: "access", refresh_token: "refresh" },
        user: { id: "id", user_metadata: { full_name: "Google user" } },
      },
      error: null,
    });
    const response = await call("/google", {
      credential: "google-id-token",
      nonce: "nonce",
    });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "google-id-token",
      nonce: "nonce",
    });
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "access",
        confirmationRequired: false,
        user: expect.objectContaining({ name: "Google user" }),
      }),
    );
  });
  it("rejects an expired refresh token", async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Expired" },
    });
    expect(
      (await call("/refresh", { refreshToken: "expired" })).status,
    ).toHaveBeenCalledWith(401);
  });
});
