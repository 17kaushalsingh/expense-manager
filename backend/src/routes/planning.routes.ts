import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { camelCase, dbResult, rpc } from "../db";
import { HttpError } from "../errors/httpError";
const router = Router();
router.use(authenticate);
const amount = z
  .number()
  .finite()
  .positive()
  .max(999999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimals",
  );
const budget = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
    categoryId: z.uuid().nullable().optional(),
    amount,
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
const goal = z
  .object({
    name: z.string().trim().min(1).max(120),
    accountId: z.uuid(),
    targetAmount: amount,
    targetDate: z.iso.date().nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
router.get("/budgets", async (req: AuthRequest, res) => {
  const month = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .safeParse(req.query.month);
  if (!month.success)
    throw new HttpError(400, "Choose a valid budget month (YYYY-MM)");
  res.json(
    await rpc(req.db!, "budget_summary", { p_month: `${month.data}-01` }),
  );
});
router.post(
  "/budgets/copy",
  validateBody(
    z
      .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/) })
      .strict(),
  ),
  async (req: AuthRequest, res) =>
    res.json({
      copied: await rpc(req.db!, "copy_budgets", { p_month: req.body.month }),
    }),
);
router.post("/budgets", validateBody(budget), async (req: AuthRequest, res) =>
  res.status(201).json(
    camelCase(
      dbResult(
        await req
          .db!.from("budgets")
          .insert({
            user_id: req.userId!,
            category_id: req.body.categoryId ?? null,
            month: req.body.month,
            amount: req.body.amount,
            currency: req.body.currency,
          })
          .select()
          .single(),
      ),
    ),
  ),
);
router.put(
  "/budgets/:id",
  validateBody(budget),
  async (req: AuthRequest, res) =>
    res.json(
      camelCase(
        dbResult(
          await req
            .db!.from("budgets")
            .update({
              category_id: req.body.categoryId ?? null,
              month: req.body.month,
              amount: req.body.amount,
              currency: req.body.currency,
            })
            .eq("id", req.params.id as string)
            .select()
            .single(),
        ),
      ),
    ),
);
router.delete("/budgets/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("budgets")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
router.get("/goals", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("savings_goals")
          .select("*,account:accounts(id,name,balance,currency)")
          .order("created_at"),
      ),
    ),
  ),
);
router.post("/goals", validateBody(goal), async (req: AuthRequest, res) =>
  res.status(201).json(
    camelCase(
      dbResult(
        await req
          .db!.from("savings_goals")
          .insert({
            user_id: req.userId!,
            account_id: req.body.accountId,
            name: req.body.name,
            target_amount: req.body.targetAmount,
            target_date: req.body.targetDate ?? null,
            currency: req.body.currency,
          })
          .select()
          .single(),
      ),
    ),
  ),
);
router.put("/goals/:id", validateBody(goal), async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("savings_goals")
          .update({
            account_id: req.body.accountId,
            name: req.body.name,
            target_amount: req.body.targetAmount,
            target_date: req.body.targetDate ?? null,
            currency: req.body.currency,
          })
          .eq("id", req.params.id as string)
          .select()
          .single(),
      ),
    ),
  ),
);
router.delete("/goals/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("savings_goals")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
export default router;
