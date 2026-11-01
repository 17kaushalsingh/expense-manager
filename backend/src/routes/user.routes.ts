import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { updateProfileSchema } from "../validation/schemas";
import { camelCase, dbResult, rpc } from "../db";
const router = Router();
router.use(authenticate);
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
