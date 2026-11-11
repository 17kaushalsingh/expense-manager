import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { csvDocument, escapeLike } from "../services/csv";
import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createTransactionSchema, transferSchema } from "../validation/schemas";
import { camelCase, dbResult, rpc } from "../db";
const router = Router();
router.use(authenticate);
const filtersSchema = z
  .object({
    month: z
      .string()
      .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
      .optional(),
    onDate: z.iso.date().optional(),
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional(),
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
    accountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    sourceType: z
      .enum(["MANUAL", "SPLIT", "TRANSFER", "SETTLEMENT", "PERSONAL_LOAN"])
      .optional(),
    q: z.string().trim().max(200).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    minAmount: z.coerce.number().finite().nonnegative().optional(),
    maxAmount: z.coerce.number().finite().nonnegative().optional(),
    sort: z.enum(["newest", "oldest", "highest", "lowest"]).default("newest"),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .refine(
    (x) => !x.from || !x.to || x.from <= x.to,
    "Start date must precede end date",
  )
  .refine(
    (x) =>
      x.minAmount === undefined ||
      x.maxAmount === undefined ||
      x.minAmount <= x.maxAmount,
    "Minimum must not exceed maximum",
  );
async function transactionQuery(req: AuthRequest) {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid transaction filters");
  const f = parsed.data;
  let q = req
    .db!.from("transactions")
    .select(
      "*,account:accounts(id,name,type,currency),category:categories(id,name)",
      { count: "exact" },
    );
  for (const [key, column] of Object.entries({
    type: "type",
    accountId: "account_id",
    categoryId: "category_id",
    sourceType: "source_type",
  }) as ["type" | "accountId" | "categoryId" | "sourceType", string][])
    if (f[key]) q = q.eq(column, f[key]!);
  if (f.month || f.onDate) {
    const start = f.onDate ?? `${f.month}-01`;
    const last = new Date(`${start}T12:00:00Z`);
    if (!f.onDate) {
      last.setUTCMonth(last.getUTCMonth() + 1);
      last.setUTCDate(0);
    }
    const end =
      f.onDate ?? `${f.month}-${String(last.getUTCDate()).padStart(2, "0")}`;
    const range = await rpc<{ from: string; to: string }>(
      req.db!,
      "local_date_bounds",
      { p_from: start, p_to: end },
    );
    q = q.gte("date_time", range.from).lt("date_time", range.to);
  }
  if (f.fromDate || f.toDate) {
    if (f.fromDate && f.toDate && f.fromDate > f.toDate)
      throw new HttpError(400, "Start must precede end");
    const range = await rpc<{ from: string; to: string }>(
      req.db!,
      "local_date_bounds",
      { p_from: f.fromDate ?? f.toDate, p_to: f.toDate ?? f.fromDate },
    );
    if (f.fromDate) q = q.gte("date_time", range.from);
    if (f.toDate) q = q.lt("date_time", range.to);
  }
  if (f.from) q = q.gte("date_time", f.from);
  if (f.to) q = q.lte("date_time", f.to);
  if (f.minAmount !== undefined) q = q.gte("amount", f.minAmount);
  if (f.maxAmount !== undefined) q = q.lte("amount", f.maxAmount);
  if (f.q) q = q.ilike("notes", `%${escapeLike(f.q)}%`);
  q = q
    .order(["highest", "lowest"].includes(f.sort) ? "amount" : "date_time", {
      ascending: ["oldest", "lowest"].includes(f.sort),
    })
    .order("id");
  return { q, f };
}
async function allTransactions(req: AuthRequest) {
  const { q } = await transactionQuery(req);
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = dbResult(await q.range(offset, offset + 999)) ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}
router.get("/", async (req: AuthRequest, res) =>
  res.json(camelCase(await allTransactions(req))),
);
router.get("/page", async (req: AuthRequest, res) => {
  const { q, f } = await transactionQuery(req);
  const result = await q.range(f.offset, f.offset + f.limit - 1);
  res.json({
    items: camelCase(dbResult(result)),
    total: result.count ?? 0,
    limit: f.limit,
    offset: f.offset,
  });
});
router.get("/export", async (req: AuthRequest, res) => {
  const rows = await allTransactions(req);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="transactions.csv"',
  );
  res.send(
    csvDocument(
      [
        "ID",
        "Date (UTC)",
        "Type",
        "Account",
        "Currency",
        "Category",
        "Amount",
        "Balance change",
        "Personal income/expense",
        "Source",
        "Notes",
      ],
      rows.map((t) => [
        t.id,
        t.date_time,
        t.type,
        t.account?.name,
        t.account?.currency,
        t.category?.name,
        Number(t.amount),
        Number(t.balance_delta),
        Number(t.analytics_amount),
        t.source_type,
        t.notes,
      ]),
    ),
  );
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
