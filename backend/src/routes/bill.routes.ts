import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { camelCase, dbResult, rpc } from "../db";
import { HttpError } from "../errors/httpError";
import { recurrenceDate } from "../services/recurrence";
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
const bill = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(["INCOME", "EXPENSE"]),
    amount,
    currency: z.string().regex(/^[A-Z]{3}$/),
    categoryId: z.uuid().nullable().default(null),
    accountId: z.uuid().nullable().default(null),
    frequency: z.enum([
      "ONCE",
      "DAILY",
      "WEEKLY",
      "BIWEEKLY",
      "MONTHLY",
      "QUARTERLY",
      "YEARLY",
    ]),
    startDate: z.iso.date(),
    endDate: z.iso.date().nullable().default(null),
    timezone: z.string().min(1).max(100),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).default("ACTIVE"),
    notes: z.string().max(2000).default(""),
  })
  .strict()
  .refine(
    (b) => !b.endDate || b.endDate >= b.startDate,
    "End must follow start",
  );
router.get("/", async (req: AuthRequest, res) => {
  const rows =
    dbResult(
      await req
        .db!.from("personal_bills")
        .select("*")
        .order("created_at", { ascending: false }),
    ) ?? [];
  res.json(
    camelCase(
      rows.map((b) => {
        const due = recurrenceDate(b.start_date, b.frequency, b.next_index);
        return {
          ...b,
          next_due_date:
            b.status === "ACTIVE" && due && (!b.end_date || due <= b.end_date)
              ? due
              : null,
        };
      }),
    ),
  );
});
router.post("/", validateBody(bill), async (req: AuthRequest, res) =>
  res
    .status(201)
    .json(await rpc(req.db!, "manage_personal_bill", { p_input: req.body })),
);
router.put("/:id", validateBody(bill), async (req: AuthRequest, res) =>
  res.json(
    await rpc(req.db!, "manage_personal_bill", {
      p_input: req.body,
      p_id: req.params.id,
    }),
  ),
);
router.post(
  "/refresh",
  validateBody(z.object({}).strict()),
  async (req: AuthRequest, res) =>
    res.json({ generated: await rpc(req.db!, "refresh_personal_bills") }),
);
router.get("/occurrences", async (req: AuthRequest, res) => {
  const p = z
    .object({
      status: z.enum(["DUE", "RECORDED", "SKIPPED", "REVERSED"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
    })
    .safeParse(req.query);
  if (!p.success) throw new HttpError(400, "Invalid occurrence filters");
  let q = req.db!.from("bill_occurrences").select("*", { count: "exact" });
  if (p.data.status) q = q.eq("status", p.data.status);
  const result = await q
    .order("review_date")
    .order("id")
    .range(p.data.offset, p.data.offset + p.data.limit - 1);
  res.json({
    items: camelCase(dbResult(result)),
    total: result.count ?? 0,
    limit: p.data.limit,
    offset: p.data.offset,
  });
});
router.post(
  "/occurrences/:id/record",
  validateBody(
    z
      .object({
        accountId: z.uuid(),
        amount,
        categoryId: z.uuid().nullable().optional(),
        dateTime: z.iso.datetime({ offset: true }),
        notes: z.string().max(2000).optional(),
      })
      .strict(),
  ),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "review_bill_occurrence", {
        p_id: req.params.id,
        p_action: "RECORD",
        p_input: req.body,
      }),
    ),
);
for (const action of ["skip", "reverse"] as const)
  router.post(
    `/occurrences/:id/${action}`,
    validateBody(z.object({}).strict()),
    async (req: AuthRequest, res) =>
      res.json(
        await rpc(req.db!, "review_bill_occurrence", {
          p_id: req.params.id,
          p_action: action.toUpperCase(),
        }),
      ),
  );
router.post(
  "/occurrences/:id/postpone",
  validateBody(z.object({ reviewDate: z.iso.date() }).strict()),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "review_bill_occurrence", {
        p_id: req.params.id,
        p_action: "POSTPONE",
        p_input: req.body,
      }),
    ),
);
export default router;
