import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createTransactionSchema, transferSchema } from "../validation/schemas";
import { camelCase, dbResult, rpc } from "../db";
const router = Router();
router.use(authenticate);
router.get("/", async (req: AuthRequest, res) => {
  let q = req
    .db!.from("transactions")
    .select(
      "*,account:accounts(id,name,type,currency),category:categories(id,name)",
    )
    .order("date_time", { ascending: false })
    .order("id");
  for (const [key, column] of Object.entries({
    type: "type",
    accountId: "account_id",
    categoryId: "category_id",
  }))
    if (typeof req.query[key] === "string") q = q.eq(column, req.query[key]);
  if (typeof req.query.from === "string")
    q = q.gte("date_time", req.query.from);
  if (typeof req.query.to === "string") q = q.lte("date_time", req.query.to);
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = dbResult(await q.range(offset, offset + 999)) ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  res.json(camelCase(rows));
});
router.post(
  "/",
  validateBody(createTransactionSchema),
  async (req: AuthRequest, res) =>
    res
      .status(201)
      .json(
        await rpc(req.db!, "mutate_transaction_atomic", { p_input: req.body }),
      ),
);
router.post(
  "/transfer",
  validateBody(transferSchema),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "transfer_accounts_atomic", { p_input: req.body }),
    ),
);
router.get("/:id", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("transactions")
          .select(
            "*,account:accounts(id,name,type,currency),category:categories(id,name)",
          )
          .eq("id", req.params.id as string)
          .single(),
      ),
    ),
  ),
);
router.put(
  "/:id",
  validateBody(createTransactionSchema),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "mutate_transaction_atomic", {
        p_input: req.body,
        p_id: req.params.id,
      }),
    ),
);
router.delete("/:id", async (req: AuthRequest, res) => {
  await rpc(req.db!, "mutate_transaction_atomic", {
    p_input: {},
    p_id: req.params.id,
    p_delete: true,
  });
  res.status(204).send();
});
export default router;
