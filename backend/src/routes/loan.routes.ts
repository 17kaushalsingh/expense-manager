import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { dbResult, camelCase, rpc } from "../db";
import { installments } from "../services/personalFinance";
import { decimal } from "../utils/money";
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
const edit = z
  .object({
    name: z.string().trim().min(1).max(120),
    counterparty: z.string().trim().min(1).max(120),
    firstDueDate: z.iso.date().nullable().default(null),
    frequency: z.enum(["WEEKLY", "MONTHLY"]).default("MONTHLY"),
    installmentCount: z.number().int().min(1).max(600).default(1),
    notes: z.string().max(2000).default(""),
    archived: z.boolean().default(false),
  })
  .strict();
router.get("/", async (req: AuthRequest, res) => {
  const rows = await rpc<
    {
      id: string;
      principal: number;
      repaid: number;
      installmentCount: number;
      firstDueDate: string | null;
      frequency: string;
    }[]
  >(req.db!, "personal_loan_summary");
  res.json(
    rows.map((l) => ({
      ...l,
      outstanding: decimal(l.principal).minus(l.repaid).toNumber(),
      installments: installments(
        l.principal,
        l.installmentCount,
        l.firstDueDate,
        l.frequency,
        l.repaid,
      ),
    })),
  );
});
router.post(
  "/",
  validateBody(
    edit.extend({
      direction: z.enum(["LENT", "BORROWED"]),
      principal: amount.refine((n) => n > 0),
      currency: z.string().regex(/^[A-Z]{3}$/),
      startDate: z.iso.date(),
      accountId: z.uuid().nullable().default(null),
      requestKey: z.uuid(),
    }),
  ),
  async (req: AuthRequest, res) =>
    res
      .status(201)
      .json(await rpc(req.db!, "manage_personal_loan", { p_input: req.body })),
);
router.put("/:id", validateBody(edit), async (req: AuthRequest, res) =>
  res.json(
    await rpc(req.db!, "manage_personal_loan", {
      p_input: req.body,
      p_id: req.params.id,
    }),
  ),
);
router.delete("/:id", async (req: AuthRequest, res) => {
  await rpc(req.db!, "manage_personal_loan", {
    p_input: {},
    p_id: req.params.id,
    p_delete: true,
  });
  res.status(204).send();
});
router.get("/:id/payments", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("loan_payments")
          .select("*")
          .eq("loan_id", req.params.id as string)
          .order("date_time", { ascending: false })
          .order("id"),
      ),
    ),
  ),
);
router.post(
  "/:id/payments",
  validateBody(
    z
      .object({
        principal: amount,
        interest: amount,
        accountId: z.uuid(),
        dateTime: z.iso.datetime({ offset: true }),
        notes: z.string().max(2000).default(""),
        requestKey: z.uuid(),
      })
      .strict()
      .refine(
        (p) => p.principal + p.interest > 0,
        "Enter principal or interest",
      ),
  ),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "record_loan_payment", {
        p_loan_id: req.params.id,
        p_input: req.body,
      }),
    ),
);
router.post(
  "/payments/:id/reverse",
  validateBody(z.object({}).strict()),
  async (req: AuthRequest, res) =>
    res.json(
      await rpc(req.db!, "reverse_loan_payment", { p_id: req.params.id }),
    ),
);
export default router;
