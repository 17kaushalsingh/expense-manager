import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createSplitExpenseSchema } from "../validation/schemas";
import { createSplitExpense } from "../services/splitExpenseService";
import { camelCase, dbResult, rpc } from "../db";
import {
  sharedFilters,
  visibleSplit,
  visibleSplitResponse,
} from "../services/sharedExpenses";
import { escapeLike } from "../services/csv";
import { HttpError } from "../errors/httpError";
const router = Router();
router.use(authenticate);
router.get("/search", async (req: AuthRequest, res) => {
  const parsed = sharedFilters.safeParse(req.query);
  if (!parsed.success)
    throw new HttpError(400, "Invalid shared expense filters");
  const f = parsed.data;
  let query = req
    .db!.from("split_expenses")
    .select("*,payers:split_payers(*),participants:split_participants(*)", {
      count: "exact",
    });
  if (f.groupId) query = query.eq("group_id", f.groupId);
  if (f.context === "individual") query = query.is("group_id", null);
  if (f.context === "group") query = query.not("group_id", "is", null);
  if (f.q) query = query.ilike("description", `%${escapeLike(f.q)}%`);
  if (f.splitType) query = query.eq("split_type", f.splitType);
  if (f.currency) query = query.eq("currency", f.currency);
  if (f.minAmount !== undefined) query = query.gte("total_amount", f.minAmount);
  if (f.maxAmount !== undefined) query = query.lte("total_amount", f.maxAmount);
  if (f.fromDate || f.toDate) {
    const bounds = await rpc<{ from: string; to: string }>(
      req.db!,
      "local_date_bounds",
      { p_from: f.fromDate ?? f.toDate, p_to: f.toDate ?? f.fromDate },
    );
    if (f.fromDate) query = query.gte("date", bounds.from);
    if (f.toDate) query = query.lt("date", bounds.to);
  }
  const result = await query
    .order(["highest", "lowest"].includes(f.sort) ? "total_amount" : "date", {
      ascending: ["oldest", "lowest"].includes(f.sort),
    })
    .order("id")
    .range(f.offset, f.offset + f.limit - 1);
  res.json({
    items: camelCase(
      (dbResult(result) ?? []).map((row) => visibleSplit(row, req.userId!)),
    ),
    total: result.count ?? 0,
    limit: f.limit,
    offset: f.offset,
  });
});
router.post(
  "/",
  validateBody(createSplitExpenseSchema),
  async (req: AuthRequest, res) =>
    res
      .status(201)
      .json(
        visibleSplitResponse(
          await createSplitExpense(req.db!, req.body),
          req.userId!,
        ),
      ),
);
router.get("/group/:groupId", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("split_expenses")
          .select("*,payers:split_payers(*),participants:split_participants(*)")
          .eq("group_id", req.params.groupId as string)
          .order("date", { ascending: false }),
      )?.map((row) => visibleSplit(row, req.userId!)),
    ),
  ),
);
router.put(
  "/:id",
  validateBody(createSplitExpenseSchema),
  async (req: AuthRequest, res) =>
    res.json(
      visibleSplitResponse(
        await rpc(req.db!, "create_split_expense_atomic", {
          p_input: req.body,
          p_id: req.params.id,
        }),
        req.userId!,
      ),
    ),
);
router.delete("/:id", async (req: AuthRequest, res) => {
  await rpc(req.db!, "create_split_expense_atomic", {
    p_input: {},
    p_id: req.params.id,
    p_delete: true,
  });
  res.status(204).send();
});
router.get("/", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("split_expenses")
          .select("*,payers:split_payers(*),participants:split_participants(*)")
          .is("group_id", null)
          .order("date", { ascending: false }),
      )?.map((row) => visibleSplit(row, req.userId!)),
    ),
  ),
);
export default router;
