import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { rpc } from "../db";
import { cashFlowSeries } from "../services/cashFlow";
import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { dbResult } from "../db";
import { decimal } from "../utils/money";
const router = Router();
router.use(authenticate);
router.get("/net-worth", async (req: AuthRequest, res) => {
  const accounts =
    dbResult(await req.db!.from("accounts").select("type,balance")) ?? [];
  const breakdown = { assets: 0, liabilities: 0, receivables: 0, payables: 0 };
  for (const a of accounts) {
    const key =
      a.type === "ACCOUNTS_RECEIVABLE"
        ? "receivables"
        : a.type === "ACCOUNTS_PAYABLE"
          ? "payables"
          : ["CREDIT_CARD", "LOAN"].includes(a.type)
            ? "liabilities"
            : "assets";
    breakdown[key] = decimal(breakdown[key]).plus(a.balance).toNumber();
  }
  res.json({
    netWorth: decimal(breakdown.assets)
      .plus(breakdown.receivables)
      .minus(breakdown.liabilities)
      .minus(breakdown.payables)
      .toNumber(),
    breakdown,
  });
});
router.get("/debt-summary", async (req: AuthRequest, res) => {
  const accounts =
    dbResult(
      await req
        .db!.from("accounts")
        .select("type,balance")
        .in("type", ["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"]),
    ) ?? [];
  const sum = (type: string) =>
    accounts
      .filter((a) => a.type === type)
      .reduce((n, a) => n.plus(a.balance), decimal(0))
      .toNumber();
  res.json({
    totalOwedToYou: sum("ACCOUNTS_RECEIVABLE"),
    totalYouOwe: sum("ACCOUNTS_PAYABLE"),
  });
});
router.get("/debts", async (req: AuthRequest, res) =>
  res.json(await rpc(req.db!, "simplify_debts", { p_group_id: null })),
);
router.get("/category-spending", async (req: AuthRequest, res) => {
  const parsed = z
    .enum(["1W", "1M", "3M", "1Y", "ALL"])
    .safeParse(req.query.range ?? "1M");
  if (!parsed.success) throw new HttpError(400, "Invalid analytics range");
  const end = new Date(),
    start = new Date(
      end.getTime() -
        { "1W": 7, "1M": 30, "3M": 90, "1Y": 365, ALL: 36500 }[parsed.data] *
          86400000,
    );
  const totals = new Map<
    string,
    { id: string | null; name: string; amount: ReturnType<typeof decimal> }
  >();
  for (let offset = 0; ; offset += 1000) {
    const page =
      dbResult(
        await req
          .db!.from("transactions")
          .select("id,analytics_amount,category:categories(id,name)")
          .eq("type", "EXPENSE")
          .gt("analytics_amount", 0)
          .gte("date_time", start.toISOString())
          .lte("date_time", end.toISOString())
          .order("id")
          .range(offset, offset + 999),
      ) ?? [];
    for (const t of page) {
      const id = t.category?.id ?? null,
        key = id ?? "uncategorized",
        entry = totals.get(key) ?? {
          id,
          name: t.category?.name ?? "Uncategorized",
          amount: decimal(0),
        };
      entry.amount = entry.amount.plus(t.analytics_amount);
      totals.set(key, entry);
    }
    if (page.length < 1000) break;
  }
  const total = [...totals.values()].reduce(
    (n, c) => n.plus(c.amount),
    decimal(0),
  );
  res.json({
    totalExpense: total.toNumber(),
    categories: [...totals.values()]
      .map((c) => ({
        id: c.id,
        name: c.name,
        amount: c.amount.toNumber(),
        percentage: total.isZero()
          ? 0
          : c.amount.div(total).mul(100).toNumber(),
      }))
      .sort((a, b) => b.amount - a.amount),
  });
});
router.get("/cash-flow", async (req: AuthRequest, res) => {
  const parsed = z
    .object({
      range: z.enum(["1W", "1M", "3M", "1Y", "ALL"]).default("1M"),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
      groupBy: z.enum(["day", "month"]).optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid analytics range");
  const { range, groupBy } = parsed.data;
  const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
  let from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(
        to.getTime() -
          { "1W": 7, "1M": 30, "3M": 90, "1Y": 365, ALL: 36500 }[range] *
            86400000,
      );
  if (from > to) throw new HttpError(400, "Start must precede end");
  const profile = dbResult(
    await req
      .db!.from("users")
      .select("timezone")
      .eq("id", req.userId!)
      .single(),
  );
  const rows = [];
  // PostgREST caps responses; paginate rather than silently truncating analytics.
  for (let offset = 0; ; offset += 1000) {
    const page =
      dbResult(
        await req
          .db!.from("transactions")
          .select("id,type,analytics_amount,date_time")
          .gt("analytics_amount", 0)
          .gte("date_time", from.toISOString())
          .lte("date_time", to.toISOString())
          .order("date_time")
          .order("id")
          .range(offset, offset + 999),
      ) ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  if (range === "ALL" && !parsed.data.from)
    from = rows.length ? new Date(rows[0].date_time) : to;
  res.json(
    cashFlowSeries(
      rows,
      profile!.timezone,
      groupBy ? groupBy === "month" : ["1Y", "ALL"].includes(range),
      from,
      to,
    ),
  );
});
export default router;
