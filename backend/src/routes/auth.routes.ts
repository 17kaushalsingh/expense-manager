import { Router } from "express";
import { getSupabaseClient, camelCase, dbResult } from "../db";
import { validateBody } from "../middleware/validate";
import { authenticate, AuthRequest } from "../middleware/auth";
import { loginSchema, registerSchema } from "../validation/schemas";
import { z } from "zod";
const router = Router();
function sessionResponse(data: {
  session: { access_token: string; refresh_token: string } | null;
  user: {
    id: string;
    email?: string;
    user_metadata: Record<string, unknown>;
  } | null;
}) {
  return {
    token: data.session?.access_token ?? null,
    session: data.session,
    confirmationRequired: !data.session,
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email,
          name:
            data.user.user_metadata.name ||
            data.user.user_metadata.full_name ||
            "User",
        }
      : null,
  };
}
router.post("/register", validateBody(registerSchema), async (req, res) => {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: req.body.email,
    password: req.body.password,
    options: { data: { name: req.body.name } },
  });
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(201).json(sessionResponse(data));
});
router.post("/login", validateBody(loginSchema), async (req, res) => {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword(
    req.body,
  );
  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }
  res.json(sessionResponse(data));
});
router.post(
  "/google",
  validateBody(
    z.object({ credential: z.string().min(1), nonce: z.string().optional() }),
  ),
  async (req, res) => {
    const { data, error } = await getSupabaseClient().auth.signInWithIdToken({
      provider: "google",
      token: req.body.credential,
      nonce: req.body.nonce,
    });
    if (error) {
      res.status(401).json({ error: error.message });
      return;
    }
    res.json(sessionResponse(data));
  },
);
router.post(
  "/refresh",
  validateBody(z.object({ refreshToken: z.string().min(1) })),
  async (req, res) => {
    const { data, error } = await getSupabaseClient().auth.refreshSession({
      refresh_token: req.body.refreshToken,
    });
    if (error) {
      res.status(401).json({ error: "Session expired" });
      return;
    }
    res.json(sessionResponse(data));
  },
);
router.get("/session", authenticate, async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req.db!.from("users").select("*").eq("id", req.userId!).single(),
      ),
    ),
  ),
);
router.post(
  "/logout",
  authenticate,
  validateBody(z.object({ refreshToken: z.string().min(1) })),
  async (req: AuthRequest, res) => {
    const { error } = await req.db!.auth.setSession({
      access_token: req.headers.authorization!.slice(7),
      refresh_token: req.body.refreshToken,
    });
    if (error) {
      res.status(401).json({ error: "Invalid session" });
      return;
    }
    const result = await req.db!.auth.signOut({ scope: "local" });
    if (result.error) {
      res.status(400).json({ error: result.error.message });
      return;
    }
    res.status(204).send();
  },
);
export default router;
