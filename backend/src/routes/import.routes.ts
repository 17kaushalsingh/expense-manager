import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { dbResult, rpc } from "../db";
import { HttpError } from "../errors/httpError";
import { importFields, parseCsv, prepareImport, suggestMapping } from "../services/importCsv";
const router = Router(); router.use(authenticate);
const csv = z.string().min(1).max(200_000);
const delimiter = z.enum([",", ";", "\t"]).default(",");
router.post("/columns", validateBody(z.object({ csv, delimiter })), async (req: AuthRequest, res) => {
  try { const { headers } = parseCsv(req.body.csv, req.body.delimiter); res.json({ headers, mapping: suggestMapping(headers) }); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid CSV"); }
});
const mapping = z.partialRecord(z.enum(importFields), z.string().max(200));
router.post("/preview", validateBody(z.object({ csv, delimiter, mapping: mapping.optional(), accountId: z.uuid(),
  dateFormat: z.enum(["ISO", "DMY", "MDY"]).default("ISO"), decimalSeparator: z.enum([".", ","]).default("."), defaultType: z.enum(["SIGNED", "INCOME", "EXPENSE"]).default("SIGNED"),
})), async (req: AuthRequest, res) => {
  const account = dbResult(await req.db!.from("accounts").select("name,currency,type").eq("id", req.body.accountId).single());
  if (!account || ["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(account.type)) throw new HttpError(400, "Choose an ordinary owned account");
  const profile = dbResult(await req.db!.from("users").select("timezone").eq("id", req.userId!).single())!;
  const categories = dbResult(await req.db!.from("categories").select("id,name,type")) ?? [];
  let prepared: ReturnType<typeof prepareImport>;
  try { prepared = prepareImport(req.body.csv, { ...req.body, account, categories }); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid CSV"); }
  const batchId = randomUUID(), rows = prepared.rows.flatMap(row => row.data ? [row.data] : []);
  const checked = rows.length ? await rpc<{ rows: Record<string, unknown>[] }>(req.db!, "import_transactions_atomic", { p_preview: true, p_input: { batchId, accountId: req.body.accountId, timezone: profile.timezone, rows } }) : { rows: [] };
  res.json({ ...prepared, batchId, accountId: req.body.accountId, timezone: profile.timezone, currency: account.currency,
    rows: prepared.rows.map(row => ({ ...row, data: checked.rows.find(r => r.rowNumber === row.rowNumber) })) });
});
const row = z.object({ rowNumber: z.number().int().min(2).max(501), amount: z.number().finite().positive().max(999999999999.99),
  type: z.enum(["INCOME", "EXPENSE"]), localDate: z.iso.date().optional(), dateTime: z.iso.datetime({ offset: true }).optional(),
  notes: z.string().max(500).default(""), currency: z.string().regex(/^[A-Z]{3}$/).optional(), categoryId: z.uuid().nullable().optional(),
});
router.post("/", validateBody(z.object({ batchId: z.uuid(), accountId: z.uuid(), timezone: z.string().min(1).max(100), allowDuplicates: z.boolean().default(false), rows: z.array(row).min(1).max(500) })), async (req: AuthRequest, res) => {
  res.json(await rpc(req.db!, "import_transactions_atomic", { p_input: req.body }));
});
export default router;
