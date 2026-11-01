import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  createAccountSchema,
  updateAccountSchema,
} from "../validation/schemas";
import { rpc, camelCase, dbResult } from "../db";
const router = Router();
router.use(authenticate);
router.get("/", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(await req.db!.from("accounts").select("*").order("created_at")),
    ),
  ),
);
router.get("/:id", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("accounts")
          .select("*")
          .eq("id", req.params.id as string)
          .single(),
      ),
    ),
  ),
);
router.post(
  "/",
  validateBody(createAccountSchema),
  async (req: AuthRequest, res) =>
    res
      .status(201)
      .json(await rpc(req.db!, "manage_account", { p_input: req.body })),
);
router.put(
  "/:id",
  validateBody(updateAccountSchema),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "manage_account", {
        p_input: req.body,
        p_id: req.params.id,
      }),
    ),
);
router.delete("/:id", async (req: AuthRequest, res) => {
  await rpc(req.db!, "manage_account", {
    p_input: {},
    p_id: req.params.id,
    p_delete: true,
  });
  res.status(204).send();
});
export default router;
