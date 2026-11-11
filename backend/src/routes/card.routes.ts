import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { camelCase, dbResult, rpc } from "../db";
import { HttpError } from "../errors/httpError";
import { cardCycle } from "../services/cardCycle";
import { decimal } from "../utils/money";
import { installments } from "../services/personalFinance";
const router = Router();
router.use(authenticate);
const amount = z
  .number()
  .finite()
  .nonnegative()
  .max(999999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimals",
  );
router.get("/", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("card_settings")
          .select("*,account:accounts(id,name,balance,currency)"),
      ),
    ),
  ),
);
router.put(
  "/:id/settings",
  validateBody(
    z
      .object({
        creditLimit: amount,
        statementDay: z.number().int().min(1).max(31),
        dueDay: z.number().int().min(1).max(31),
      })
      .strict(),
  ),
  async (req: AuthRequest, res) =>
    res.json(
      camelCase(
        dbResult(
          await req
            .db!.from("card_settings")
            .upsert({
              account_id: req.params.id as string,
              user_id: req.userId!,
              credit_limit: req.body.creditLimit,
              statement_day: req.body.statementDay,
              due_day: req.body.dueDay,
            })
            .select()
            .single(),
        ),
      ),
    ),
);
router.get("/:id/statement", async (req: AuthRequest, res) => {
  const month = z
    .string()
    .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
    .safeParse(req.query.month);
  if (!month.success) throw new HttpError(400, "Choose a statement month");
  const settings = dbResult(
    await req
      .db!.from("card_settings")
      .select("*,account:accounts(balance,currency,name)")
      .eq("account_id", req.params.id as string)
      .single(),
  );
  const cycle = cardCycle(
      month.data,
      settings!.statement_day,
      settings!.due_day,
    ),
    bounds = await rpc<{ from: string; to: string; timezone: string }>(
      req.db!,
      "local_date_bounds",
      { p_from: cycle.start, p_to: cycle.end },
    );
  let future = decimal(0),
    charges = decimal(0),
    credits = decimal(0);
  const entries = [];
  for (let offset = 0; ; offset += 1000) {
    const page =
      dbResult(
        await req
          .db!.from("transactions")
          .select("id,date_time,notes,balance_delta,amount,type,source_type")
          .eq("account_id", req.params.id as string)
          .gte("date_time", bounds.from)
          .order("id")
          .range(offset, offset + 999),
      ) ?? [];
    for (const t of page) {
      future = future.plus(t.balance_delta);
      if (Date.parse(t.date_time) < Date.parse(bounds.to)) {
        entries.push(t);
        if (Number(t.balance_delta) > 0)
          charges = charges.plus(t.balance_delta);
        else credits = credits.minus(t.balance_delta);
      }
    }
    if (page.length < 1000) break;
  }
  const opening = decimal(settings!.account.balance).minus(future);
  res.json({
    ...cycle,
    timezone: bounds.timezone,
    currency: settings!.account.currency,
    openingBalance: opening.toNumber(),
    charges: charges.toNumber(),
    credits: credits.toNumber(),
    closingBalance: opening.plus(charges).minus(credits).toNumber(),
    entries: camelCase(
      entries.sort((a, b) => a.date_time.localeCompare(b.date_time)),
    ),
  });
});
router.get("/:id/installments", async (req: AuthRequest, res) => {
  const rows =
    dbResult(
      await req
        .db!.from("card_installments")
        .select("*,transaction:transactions(amount,notes)")
        .eq("account_id", req.params.id as string)
        .order("first_due_date"),
    ) ?? [];
  res.json(
    camelCase(
      rows.map((r) => ({
        ...r,
        schedule: installments(
          r.transaction.amount,
          r.installment_count,
          r.first_due_date,
          "MONTHLY",
          r.paid_principal,
        ),
      })),
    ),
  );
});
const plan = z
  .object({
    transactionId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    firstDueDate: z.iso.date(),
    installmentCount: z.number().int().min(1).max(600),
    paidPrincipal: amount.default(0),
  })
  .strict();
router.post(
  "/:id/installments",
  validateBody(plan),
  async (req: AuthRequest, res) =>
    res.status(201).json(
      camelCase(
        dbResult(
          await req
            .db!.from("card_installments")
            .insert({
              account_id: req.params.id as string,
              user_id: req.userId!,
              transaction_id: req.body.transactionId,
              name: req.body.name,
              first_due_date: req.body.firstDueDate,
              installment_count: req.body.installmentCount,
              paid_principal: req.body.paidPrincipal,
            })
            .select()
            .single(),
        ),
      ),
    ),
);
router.put(
  "/installments/:id",
  validateBody(plan),
  async (req: AuthRequest, res) =>
    res.json(
      camelCase(
        dbResult(
          await req
            .db!.from("card_installments")
            .update({
              name: req.body.name,
              first_due_date: req.body.firstDueDate,
              installment_count: req.body.installmentCount,
              paid_principal: req.body.paidPrincipal,
            })
            .eq("id", req.params.id as string)
            .select()
            .single(),
        ),
      ),
    ),
);
router.delete("/installments/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("card_installments")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
export default router;
