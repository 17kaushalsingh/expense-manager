import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { camelCase, dbResult, rpc } from "../db";
import { HttpError } from "../errors/httpError";
const router = Router();
router.use(authenticate);
const money = z
  .number()
  .finite()
  .nonnegative()
  .max(999999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimals",
  );
const date = z.iso
  .date()
  .refine(
    (d) => d >= "1900-01-01" && d <= "9998-12-31",
    "Choose a date between 1900 and 9998",
  );
const month = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/);
const plan = z
  .object({
    name: z.string().trim().min(1).max(120),
    categoryId: z.uuid().nullable().default(null),
    amount: money.refine((n) => n > 0),
    currency: z.string().regex(/^[A-Z]{3}$/),
    frequency: z.enum([
      "DAILY",
      "WEEKLY",
      "BIWEEKLY",
      "MONTHLY",
      "QUARTERLY",
      "YEARLY",
      "CUSTOM",
    ]),
    startDate: date,
    endDate: date.nullable().default(null),
    archived: z.boolean().default(false),
    alertsEnabled: z.boolean().default(true),
  })
  .strict()
  .refine(
    (p) => !p.endDate || p.endDate >= p.startDate,
    "End must follow start",
  )
  .refine(
    (p) => p.frequency !== "CUSTOM" || p.endDate,
    "Custom budgets need an end date",
  );
router.get("/preferences", async (req: AuthRequest, res) => {
  const row = dbResult(
    await req
      .db!.from("finance_preferences")
      .select("pay_day")
      .eq("user_id", req.userId!)
      .maybeSingle(),
  );
  res.json(camelCase(row ?? { pay_day: 1 }));
});
router.put(
  "/preferences",
  validateBody(z.object({ payDay: z.number().int().min(1).max(31) }).strict()),
  async (req: AuthRequest, res) =>
    res.json(
      camelCase(
        dbResult(
          await req
            .db!.from("finance_preferences")
            .upsert({ user_id: req.userId!, pay_day: req.body.payDay })
            .select("pay_day")
            .single(),
        ),
      ),
    ),
);
router.get("/budget-plans", async (req: AuthRequest, res) => {
  const parsed = date.safeParse(req.query.date);
  if (!parsed.success) throw new HttpError(400, "Choose a valid date");
  res.json(await rpc(req.db!, "budget_plan_summary", { p_date: parsed.data }));
});
for (const method of ["post", "put"] as const)
  router[method](
    method === "post" ? "/budget-plans" : "/budget-plans/:id",
    validateBody(plan),
    async (req: AuthRequest, res) => {
      const b = req.body;
      const row = {
        name: b.name,
        category_id: b.categoryId,
        amount: b.amount,
        currency: b.currency,
        frequency: b.frequency,
        start_date: b.startDate,
        end_date: b.endDate,
        archived: b.archived,
        alerts_enabled: b.alertsEnabled,
      };
      const query =
        method === "post"
          ? req
              .db!.from("budget_plans")
              .insert({ ...row, user_id: req.userId! })
          : req
              .db!.from("budget_plans")
              .update(row)
              .eq("id", req.params.id as string);
      res
        .status(method === "post" ? 201 : 200)
        .json(camelCase(dbResult(await query.select().single())));
    },
  );
router.delete("/budget-plans/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("budget_plans")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
router.put(
  "/budget-plans/:id/override",
  validateBody(
    z
      .object({ periodStart: date, amount: money.refine((n) => n > 0) })
      .strict(),
  ),
  async (req: AuthRequest, res) =>
    res.json(
      camelCase(
        dbResult(
          await req
            .db!.from("budget_overrides")
            .upsert(
              {
                user_id: req.userId!,
                plan_id: req.params.id as string,
                period_start: req.body.periodStart,
                amount: req.body.amount,
              },
              { onConflict: "plan_id,period_start" },
            )
            .select()
            .single(),
        ),
      ),
    ),
);
router.delete("/budget-overrides/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("budget_overrides")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
router.get("/monthly-plan", async (req: AuthRequest, res) => {
  const parsed = month.safeParse(req.query.month);
  if (!parsed.success)
    throw new HttpError(400, "Choose the first day of a month");
  res.json(
    await rpc(req.db!, "monthly_plan_summary", { p_month: parsed.data }),
  );
});
router.put(
  "/monthly-plan",
  validateBody(
    z
      .object({
        month,
        expectedIncome: money,
        expectedExpense: money,
        targetSavingRate: z.number().finite().min(0).max(100),
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .strict(),
  ),
  async (req: AuthRequest, res) =>
    res.json(
      camelCase(
        dbResult(
          await req
            .db!.from("monthly_plans")
            .upsert(
              {
                user_id: req.userId!,
                month: req.body.month,
                expected_income: req.body.expectedIncome,
                expected_expense: req.body.expectedExpense,
                target_saving_rate: req.body.targetSavingRate,
                currency: req.body.currency,
              },
              { onConflict: "user_id,month" },
            )
            .select()
            .single(),
        ),
      ),
    ),
);
router.delete("/monthly-plan/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("monthly_plans")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
export default router;
