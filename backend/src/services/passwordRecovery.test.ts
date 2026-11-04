import { describe, expect, it, vi } from "vitest";
import { completePasswordRecovery } from "../../../frontend/src/lib/passwordRecovery";
function client() {
  return {
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
}
describe("password recovery completion", () => {
  it.each([
    ["short", "short"],
    ["longpassword", "different"],
    ["x".repeat(129), "x".repeat(129)],
  ])(
    "rejects invalid input before changing credentials",
    async (password, confirmation) => {
      const auth = client();
      await expect(
        completePasswordRecovery(auth, password, confirmation),
      ).rejects.toThrow();
      expect(auth.updateUser).not.toHaveBeenCalled();
      expect(auth.signOut).not.toHaveBeenCalled();
    },
  );
  it("does not sign out or claim success after provider rejection", async () => {
    const auth = client();
    auth.updateUser.mockResolvedValue({
      error: { message: "Recovery token expired" },
    });
    await expect(
      completePasswordRecovery(auth, "newpassword", "newpassword"),
    ).rejects.toThrow("Recovery token expired");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("updates the credential before revoking refresh sessions globally", async () => {
    const auth = client();
    expect(
      await completePasswordRecovery(auth, "newpassword", "newpassword"),
    ).toEqual({ revoked: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "newpassword" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      auth.signOut.mock.invocationCallOrder[0],
    );
  });
  it("accurately reports an already changed password if revocation is unavailable", async () => {
    const auth = client();
    auth.signOut.mockRejectedValue(new Error("Network unavailable"));
    expect(
      await completePasswordRecovery(auth, "newpassword", "newpassword"),
    ).toEqual({ revoked: false });
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });
});
