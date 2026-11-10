import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createSettlementSchema } from "../validation/schemas";
import { createSettlement } from "../services/settlementService";
import { camelCase, dbResult, rpc } from "../db";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
const router = Router();
router.use(authenticate);
router.post(
  "/",
  validateBody(createSettlementSchema),
  async (req: AuthRequest, res) =>
    res.json(await createSettlement(req.db!, req.body)),
);
router.post("/:id/reverse", async (req: AuthRequest, res) =>
  res.json(
    await rpc(req.db!, "reverse_settlement_atomic", { p_id: req.params.id }),
  ),
);
router.get("/page", async (req: AuthRequest, res) => {
  const parsed = z
    .object({
      groupId: z.uuid().optional(),
      context: z.enum(["all", "individual"]).default("all"),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
    })
    .safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid payment filters");
  const f = parsed.data;
  if (f.groupId && f.context === "individual")
    throw new HttpError(400, "Conflicting payment context");
  let query = req
    .db!.from("settlements")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .order("id");
  if (f.groupId) query = query.eq("group_id", f.groupId);
  if (f.context === "individual") query = query.is("group_id", null);
  const result = await query.range(f.offset, f.offset + f.limit - 1);
  res.json({
    items: camelCase(
      (dbResult(result) ?? []).map((s) => {
        const { account_id, ...shared } = s;
        return s.payer_id === req.userId ? s : shared;
      }),
    ),
    total: result.count ?? 0,
  });
});
router.get("/", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("settlements")
          .select("*")
          .order("date", { ascending: false }),
      )?.map((s) => {
        const { account_id, ...shared } = s;
        return s.payer_id === req.userId ? s : shared;
      }),
    ),
  ),
);
export default router;
