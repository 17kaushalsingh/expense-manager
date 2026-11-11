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
  .nonnegative()
  .max(999999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimals",
  );
const name = z.string().trim().min(1).max(120),
  date = z.iso.date(),
  currency = z.string().regex(/^[A-Z]{3}$/);
const asset = z
  .object({
    name,
    kind: z.enum(["PROPERTY", "VEHICLE", "INVESTMENT", "VALUABLE", "OTHER"]),
    currency,
    notes: z.string().max(2000).default(""),
    archived: z.boolean().default(false),
  })
  .strict();
router.get("/assets", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("personal_assets")
          .select("*,valuations:asset_valuations(*)")
          .order("created_at"),
      ),
    ),
  ),
);
router.post(
  "/assets",
  validateBody(asset.extend({ value: amount, valueDate: date })),
  async (req: AuthRequest, res) =>
    res
      .status(201)
      .json(await rpc(req.db!, "create_personal_asset", { p_input: req.body })),
);
router.put("/assets/:id", validateBody(asset), async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("personal_assets")
          .update({
            name: req.body.name,
            kind: req.body.kind,
            currency: req.body.currency,
            notes: req.body.notes,
            archived: req.body.archived,
          })
          .eq("id", req.params.id as string)
          .select()
          .single(),
      ),
    ),
  ),
);
router.delete("/assets/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("personal_assets")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
router.put(
  "/assets/:id/valuations",
  validateBody(
    z
      .object({
        valueDate: date,
        value: amount,
        notes: z.string().max(1000).default(""),
      })
      .strict(),
  ),
  async (req: AuthRequest, res) =>
    res.json(
      camelCase(
        dbResult(
          await req
            .db!.from("asset_valuations")
            .upsert(
              {
                user_id: req.userId!,
                asset_id: req.params.id as string,
                value_date: req.body.valueDate,
                value: req.body.value,
                notes: req.body.notes,
              },
              { onConflict: "asset_id,value_date" },
            )
            .select()
            .single(),
        ),
      ),
    ),
);
router.delete("/valuations/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("asset_valuations")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
router.get("/history", async (req: AuthRequest, res) => {
  const r = z
    .enum(["1W", "1M", "3M", "1Y", "ALL"])
    .safeParse(req.query.range ?? "1M");
  if (!r.success) throw new HttpError(400, "Invalid range");
  res.json(await rpc(req.db!, "net_worth_history", { p_range: r.data }));
});
const event = z
  .object({
    name,
    kind: z.enum(["TRIP", "WEDDING", "PROJECT", "OTHER"]),
    startDate: date,
    endDate: date,
    amount: amount.refine((n) => n > 0),
    currency,
    notes: z.string().max(2000).default(""),
    archived: z.boolean().default(false),
  })
  .strict()
  .refine((e) => e.endDate >= e.startDate, "End must follow start");
router.get("/events", async (req: AuthRequest, res) =>
  res.json(await rpc(req.db!, "event_finance_summary")),
);
for (const method of ["post", "put"] as const)
  router[method](
    method === "post" ? "/events" : "/events/:id",
    validateBody(event),
    async (req: AuthRequest, res) => {
      const b = req.body,
        row = {
          name: b.name,
          kind: b.kind,
          start_date: b.startDate,
          end_date: b.endDate,
          amount: b.amount,
          currency: b.currency,
          notes: b.notes,
          archived: b.archived,
        };
      const query =
        method === "post"
          ? req
              .db!.from("finance_events")
              .insert({ ...row, user_id: req.userId! })
          : req
              .db!.from("finance_events")
              .update(row)
              .eq("id", req.params.id as string);
      res
        .status(method === "post" ? 201 : 200)
        .json(camelCase(dbResult(await query.select().single())));
    },
  );
router.delete("/events/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("finance_events")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
router.get("/events/:id/costs", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("event_planned_costs")
          .select("*")
          .eq("event_id", req.params.id as string)
          .order("id"),
      ),
    ),
  ),
);
const cost = z
  .object({
    name,
    amount: amount.refine((n) => n > 0),
    categoryId: z.uuid().nullable().default(null),
    isCompleted: z.boolean().default(false),
  })
  .strict();
router.post(
  "/events/:id/costs",
  validateBody(cost),
  async (req: AuthRequest, res) =>
    res.status(201).json(
      camelCase(
        dbResult(
          await req
            .db!.from("event_planned_costs")
            .insert({
              user_id: req.userId!,
              event_id: req.params.id as string,
              name: req.body.name,
              amount: req.body.amount,
              category_id: req.body.categoryId,
              is_completed: req.body.isCompleted,
            })
            .select()
            .single(),
        ),
      ),
    ),
);
router.put("/costs/:id", validateBody(cost), async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("event_planned_costs")
          .update({
            name: req.body.name,
            amount: req.body.amount,
            category_id: req.body.categoryId,
            is_completed: req.body.isCompleted,
          })
          .eq("id", req.params.id as string)
          .select()
          .single(),
      ),
    ),
  ),
);
router.delete("/costs/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("event_planned_costs")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
router.post(
  "/costs/:id/record",
  validateBody(
    z
      .object({
        accountId: z.uuid(),
        amount: amount.refine((n) => n > 0),
        dateTime: z.iso.datetime({ offset: true }),
      })
      .strict(),
  ),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "record_event_cost", {
        p_id: req.params.id,
        p_input: req.body,
      }),
    ),
);
router.get("/events/:id/transactions", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("event_transactions")
          .select(
            "id,transaction:transactions(id,notes,date_time,analytics_amount,category:categories(name))",
          )
          .eq("event_id", req.params.id as string)
          .order("id"),
      ),
    ),
  ),
);
router.post(
  "/events/:id/transactions",
  validateBody(z.object({ transactionId: z.uuid() }).strict()),
  async (req: AuthRequest, res) =>
    res.status(201).json(
      camelCase(
        dbResult(
          await req
            .db!.from("event_transactions")
            .insert({
              user_id: req.userId!,
              event_id: req.params.id as string,
              transaction_id: req.body.transactionId,
            })
            .select()
            .single(),
        ),
      ),
    ),
);
router.delete("/event-transactions/:id", async (req: AuthRequest, res) => {
  dbResult(
    await req
      .db!.from("event_transactions")
      .delete()
      .eq("id", req.params.id as string)
      .select()
      .single(),
  );
  res.status(204).send();
});
export default router;
