import { DatabaseClient, dbResult, rpc } from "../db";
import { decimal } from "../utils/money";
import { localDay } from "./personalFinance";
import { HttpError } from "../errors/httpError";
export interface FinanceReport {
  fromDate: string;
  toDate: string;
  timezone: string;
  currency: string;
  income: number;
  expense: number;
  saving: number;
  savingRate: number | null;
  categories: { id: string | null; name: string; amount: number }[];
  days: { date: string; income: number; expense: number }[];
  transactions: {
    id: string;
    date: string;
    type: string;
    account: string;
    category: string;
    amount: number;
    balanceDelta: number;
    analyticsAmount: number;
    source: string;
    notes: string;
    labels: string;
  }[];
}
export async function financialReport(
  db: DatabaseClient,
  userId: string,
  fromDate: string,
  toDate: string,
  accountId?: string,
): Promise<FinanceReport> {
  const profile = dbResult(
    await db
      .from("users")
      .select("timezone,display_currency")
      .eq("id", userId)
      .single(),
  )!;
  const bounds = await rpc<{ from: string; to: string }>(
    db,
    "local_date_bounds",
    { p_from: fromDate, p_to: toDate },
  );
  const categoryRows =
    dbResult(await db.from("categories").select("id,name,parent_id")) ?? [];
  const categoryNames = new Map(categoryRows.map((c) => [c.id, c.name]));
  const label = (c: { name: string; parent_id: string | null } | null) =>
    c
      ? `${c.parent_id && categoryNames.has(c.parent_id) ? `${categoryNames.get(c.parent_id)} / ` : ""}${c.name}`
      : "Uncategorized";
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    let q = db
      .from("transactions")
      .select(
        "id,date_time,type,amount,balance_delta,analytics_amount,source_type,notes,tags,account:accounts(name),category:categories(id,name,parent_id)",
      )
      .gte("date_time", bounds.from)
      .lt("date_time", bounds.to)
      .order("date_time")
      .order("id")
      .range(offset, offset + 999);
    if (accountId) q = q.eq("account_id", accountId);
    const page = dbResult(await q) ?? [];
    rows.push(...page);
    if (rows.length > 10000)
      throw new HttpError(
        400,
        "Report exceeds 10,000 entries. Choose a shorter period or one account.",
      );
    if (page.length < 1000) break;
  }
  let income = decimal(0),
    expense = decimal(0);
  const categories = new Map<
      string,
      { id: string | null; name: string; amount: ReturnType<typeof decimal> }
    >(),
    days = new Map<string, { date: string; income: number; expense: number }>();
  const transactions = rows.map((t) => {
    const date = localDay(t.date_time, profile.timezone),
      day = days.get(date) ?? { date, income: 0, expense: 0 };
    if (t.type === "INCOME") {
      income = income.plus(t.analytics_amount);
      day.income = decimal(day.income).plus(t.analytics_amount).toNumber();
    } else if (t.type === "EXPENSE") {
      expense = expense.plus(t.analytics_amount);
      day.expense = decimal(day.expense).plus(t.analytics_amount).toNumber();
      if (Number(t.analytics_amount) > 0) {
        const key = t.category?.id ?? "uncategorized",
          entry = categories.get(key) ?? {
            id: t.category?.id ?? null,
            name: label(t.category),
            amount: decimal(0),
          };
        entry.amount = entry.amount.plus(t.analytics_amount);
        categories.set(key, entry);
      }
    }
    days.set(date, day);
    return {
      id: t.id,
      date: t.date_time,
      type: t.type,
      account: t.account?.name ?? "Account",
      category: label(t.category),
      amount: Number(t.amount),
      balanceDelta: Number(t.balance_delta),
      analyticsAmount: Number(t.analytics_amount),
      source: t.source_type,
      notes: t.notes ?? "",
      labels: Array.isArray(t.tags)
        ? t.tags.filter((v) => typeof v === "string").join(", ")
        : "",
    };
  });
  return {
    fromDate,
    toDate,
    timezone: profile.timezone,
    currency: profile.display_currency,
    income: income.toNumber(),
    expense: expense.toNumber(),
    saving: income.minus(expense).toNumber(),
    savingRate: income.gt(0)
      ? income.minus(expense).div(income).mul(100).toNumber()
      : null,
    categories: [...categories.values()]
      .map((c) => ({ ...c, amount: c.amount.toNumber() }))
      .sort((a, b) => b.amount - a.amount),
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    transactions,
  };
}
