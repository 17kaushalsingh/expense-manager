import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createSettlementSchema } from "../validation/schemas";
import { createSettlement } from "../services/settlementService";
import { camelCase, dbResult } from "../db";
const router = Router();
router.use(authenticate);
router.post(
  "/",
  validateBody(createSettlementSchema),
  async (req: AuthRequest, res) =>
    res.json(await createSettlement(req.db!, req.body)),
);
router.get("/", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("settlements")
          .select("*")
          .order("date", { ascending: false }),
      ),
    ),
  ),
);
export default router;
