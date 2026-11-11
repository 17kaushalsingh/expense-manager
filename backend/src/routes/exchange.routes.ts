import { HttpError } from "../errors/httpError";
import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { camelCase, dbResult, rpc } from "../db";
import { currencies, exchangeQuote } from "../services/exchange";
const router = Router();
router.use(authenticate);
router.get("/currencies", (_req, res) => res.json(currencies));
router.get("/quote", async (req, res) => {
  const parsed = z
    .object({ from: z.string(), to: z.string(), date: z.iso.date().optional() })
    .safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid quote filters");
  const q = parsed.data;
  res.json(await exchangeQuote(q.from, q.to, q.date));
});
const input = z
  .object({
    accountId: z.uuid(),
    categoryId: z.uuid().nullable().default(null),
    type: z.enum(["INCOME", "EXPENSE"]),
    originalCurrency: z.string().regex(/^[A-Z]{3}$/),
    originalAmount: z.coerce.number().finite().positive().max(999999999999),
    exchangeRate: z.coerce.number().finite().positive().max(999999999999),
    rateDate: z.iso.date(),
    rateSource: z.enum(["MANUAL", "REFERENCE_SELECTED"]),
    dateTime: z.iso.datetime({ offset: true }),
    notes: z.string().max(2000).default(""),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    requestKey: z.uuid(),
  })
  .strict();
router.get("/entries/:id", async (req: AuthRequest, res) =>
  res.json(
    camelCase(
      dbResult(
        await req
          .db!.from("currency_conversions")
          .select("*,transaction:transactions(*)")
          .eq("id", req.params.id as string)
          .is("deleted_at", null)
          .single(),
      ),
    ),
  ),
);
router.post("/entries", validateBody(input), async (req: AuthRequest, res) =>
  res
    .status(201)
    .json(
      await rpc(req.db!, "mutate_currency_conversion", { p_input: req.body }),
    ),
);
router.put("/entries/:id", validateBody(input), async (req: AuthRequest, res) =>
  res.json(
    await rpc(req.db!, "mutate_currency_conversion", {
      p_input: req.body,
      p_id: req.params.id,
    }),
  ),
);
router.delete("/entries/:id", async (req: AuthRequest, res) => {
  await rpc(req.db!, "mutate_currency_conversion", {
    p_input: {},
    p_id: req.params.id,
    p_delete: true,
  });
  res.status(204).send();
});
export default router;
