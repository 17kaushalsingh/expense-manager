import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { updateProfileSchema } from "../validation/schemas";
import { camelCase, dbResult, rpc } from "../db";
import { z } from "zod";
const router = Router();
router.use(authenticate);
router.get("/security/sessions", async (req: AuthRequest, res) =>
  res.json(await rpc(req.db!, "list_account_sessions", {})),
);
router.put(
  "/security/sessions/:id",
  validateBody(z.object({ name: z.string().trim().min(1).max(80) }).strict()),
  async (req: AuthRequest, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid device session" });
      return;
    }
    res.json(
      await rpc(req.db!, "manage_account_session", {
        p_action: "RENAME",
        p_id: id.data,
        p_name: req.body.name,
      }),
    );
  },
);
router.post(
  "/security/revoke",
  validateBody(
    z
      .object({
        scope: z.enum(["ONE", "OTHERS", "ALL"]),
        id: z.uuid().optional(),
      })
      .strict()
      .refine((p) => p.scope !== "ONE" || !!p.id, "Choose a device session"),
  ),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "manage_account_session", {
        p_action: (
          {
            ONE: "REVOKE",
            OTHERS: "REVOKE_OTHERS",
            ALL: "REVOKE_ALL",
          } as Record<string, string>
        )[req.body.scope],
        p_id: req.body.id ?? null,
      }),
    ),
);
router.get("/security/activity", async (req: AuthRequest, res) => {
  const page = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).max(10000).default(0),
    })
    .safeParse(req.query);
  if (!page.success) {
    res.status(400).json({ error: "Invalid activity page" });
    return;
  }
  res.json(
    await rpc(req.db!, "account_security_activity", {
      p_limit: page.data.limit,
      p_offset: page.data.offset,
    }),
  );
});
router.get("/profile", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req.db!.from("users").select("*").eq("id", req.userId!).single(),
      ),
    ),
  ),
);
router.put(
  "/profile",
  validateBody(updateProfileSchema),
  async (req: AuthRequest, res) =>
    res.json(await rpc(req.db!, "update_profile", { p_input: req.body })),
);
router.get("/lookup", async (req: AuthRequest, res) => {
  const email = req.query.email;
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ error: "A complete email address is required" });
    return;
  }
  res.json(await rpc(req.db!, "lookup_user", { p_email: email }));
});
router.get("/debt-people", async (req: AuthRequest, res) =>
  res.json(await rpc(req.db!, "debt_people")),
);
export default router;
