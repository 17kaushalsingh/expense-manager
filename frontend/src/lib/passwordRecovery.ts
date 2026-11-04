interface RecoveryAuth {
  updateUser(input: {
    password: string;
  }): Promise<{ error: { message: string } | null }>;
  signOut(input: {
    scope: "global";
  }): Promise<{ error: { message: string } | null }>;
}
export async function completePasswordRecovery(
  auth: RecoveryAuth,
  password: string,
  confirmation: string,
) {
  if (password.length < 8 || password.length > 128 || password !== confirmation)
    throw new Error("Use 8–128 characters and make both passwords match.");
  const { error } = await auth.updateUser({ password });
  if (error) throw new Error(error.message);
  // A logout outage must not tell the user their password update failed: the
  // credential change has already succeeded and cannot be rolled back here.
  try {
    const result = await auth.signOut({ scope: "global" });
    return { revoked: !result.error };
  } catch {
    return { revoked: false };
  }
}
