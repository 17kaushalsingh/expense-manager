import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { rpc } from "../db";
const router = Router();
router.use(authenticate);
const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
router.post("/lookup", validateBody(tokenSchema), async (req: AuthRequest, res) => res.json(await rpc(req.db!, "use_group_invitation", {p_token: req.body.token})));
router.post("/request", validateBody(tokenSchema), async (req: AuthRequest, res) => res.json(await rpc(req.db!, "use_group_invitation", {p_token: req.body.token, p_request: true})));
router.get("/groups/:id", async (req: AuthRequest, res) => res.json(await rpc(req.db!, "manage_group_invitation", {p_group_id: req.params.id, p_action: "LIST"})));
router.post("/groups/:id", async (req: AuthRequest, res) => {
  const token = randomBytes(32).toString("hex");
  const result = await rpc<Record<string, unknown>>(req.db!, "manage_group_invitation", {p_group_id: req.params.id, p_action: "CREATE", p_token: token});
  res.status(201).json({...result, token});
});
router.delete("/groups/:id", async (req: AuthRequest, res) => {
 await rpc(req.db!, "manage_group_invitation", {p_group_id: req.params.id, p_action: "REVOKE"}); res.status(204).send();
});
router.post("/groups/:id/requests/:requestId", validateBody(z.object({decision:z.enum(["APPROVE","REJECT"])})), async (req: AuthRequest,res) => res.json(await rpc(req.db!, "decide_group_join_request", {p_group_id:req.params.id,p_request_id:req.params.requestId,p_decision:req.body.decision})));
export default router;
