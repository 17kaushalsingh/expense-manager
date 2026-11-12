import Decimal from "decimal.js";
import type { Workspace } from "./vault";
import { deviceDay } from "./personal";
import { recurrenceDate } from "./recurrence";
type Row = Record<string, unknown>;
export function periodWindow(
  plan: Row,
  today: string,
): { start: string; end: string } | null {
  const anchor = String(plan.start_date),
    end = plan.end_date ? String(plan.end_date) : null,
    f = String(plan.frequency);
  if (today < anchor || (end && today > end) || plan.archived) return null;
  if (f === "CUSTOM") return end ? { start: anchor, end } : null;
  const days = (
    { DAILY: 1, WEEKLY: 7, BIWEEKLY: 14 } as Record<string, number>
  )[f];
  let index = 0;
  if (days)
    index = Math.floor(
      (Date.parse(today + "T12:00:00Z") - Date.parse(anchor + "T12:00:00Z")) /
        86400000 /
        days,
    );
  else {
    const months = (
      { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 } as Record<string, number>
    )[f];
    if (!months) throw Error("Unknown budget frequency");
    index = Math.floor(
      ((Number(today.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
        Number(today.slice(5, 7)) -
        Number(anchor.slice(5, 7))) /
        months,
    );
    if (String(recurrenceDate(anchor, f, index)) > today) index--;
  }
  const start = recurrenceDate(anchor, f, index)!,
    next = recurrenceDate(anchor, f, index + 1)!;
  const date = new Date(next + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  const last = date.toISOString().slice(0, 10);
  return { start, end: end && end < last ? end : last };
}
export function deviceReport(
  w: Workspace,
  from: string,
  to: string,
  accountId = "",
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from > to
  )
    throw Error("Choose a valid date range");
  const days = new Map<
      string,
      { date: string; income: Decimal; expense: Decimal }
    >(),
    categories = new Map<
      string,
      { id: string; name: string; amount: Decimal }
    >();
  let income = new Decimal(0),
    expense = new Decimal(0);
  const rows = (w.tables.transactions ?? []).filter(
    (t) =>
      (!accountId || t.account_id === accountId) &&
      deviceDay(new Date(String(t.date_time)), w.profile.timezone) >= from &&
      deviceDay(new Date(String(t.date_time)), w.profile.timezone) <= to,
  );
  for (const t of rows) {
    if (!["INCOME", "EXPENSE"].includes(String(t.type))) continue;
    const value = new Decimal(String(t.analytics_amount));
    if (value.lte(0)) continue;
    const date = deviceDay(new Date(String(t.date_time)), w.profile.timezone),
      day = days.get(date) ?? {
        date,
        income: new Decimal(0),
        expense: new Decimal(0),
      };
    if (t.type === "INCOME") {
      day.income = day.income.plus(value);
      income = income.plus(value);
    } else {
      day.expense = day.expense.plus(value);
      expense = expense.plus(value);
      const id = String(t.category_id ?? "uncategorized"),
        category = categories.get(id) ?? {
          id,
          name: String(
            w.tables.categories?.find((c) => c.id === t.category_id)?.name ??
              "Uncategorized",
          ),
          amount: new Decimal(0),
        };
      category.amount = category.amount.plus(value);
      categories.set(id, category);
    }
    days.set(date, day);
  }
  return {
    income: income.toNumber(),
    expense: expense.toNumber(),
    net: income.minus(expense).toNumber(),
    rows,
    days: [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        income: d.income.toNumber(),
        expense: d.expense.toNumber(),
      })),
    categories: [...categories.values()]
      .sort((a, b) => b.amount.cmp(a.amount))
      .map((c) => ({ ...c, amount: c.amount.toNumber() })),
  };
}
export function budgetProgress(
  w: Workspace,
  plan: Row,
  today = deviceDay(new Date(), w.profile.timezone),
) {
  const window = periodWindow(plan, today);
  if (!window) return null;
  const amounts = deviceReport(w, window.start, window.end).rows;
  const relevant = new Set(
    (w.tables.categories ?? [])
      .filter(
        (c) => c.id === plan.category_id || c.parent_id === plan.category_id,
      )
      .map((c) => c.id),
  );
  const spent = amounts
    .filter(
      (t) =>
        t.type === "EXPENSE" &&
        (!plan.category_id || relevant.has(t.category_id)),
    )
    .reduce((s, t) => s.plus(String(t.analytics_amount)), new Decimal(0));
  const limit = new Decimal(
    String(
      w.tables.budget_overrides?.find(
        (o) => o.plan_id === plan.id && o.period_start === window.start,
      )?.amount ?? plan.amount,
    ),
  );
  const days = Math.max(
    1,
    Math.round(
      (Date.parse(window.end + "T12:00:00Z") -
        Date.parse(today + "T12:00:00Z")) /
        86400000,
    ) + 1,
  );
  return {
    ...window,
    spent: spent.toNumber(),
    remaining: limit.minus(spent).toNumber(),
    percent: limit.gt(0) ? spent.div(limit).mul(100).toNumber() : 0,
    dailyAllowance: Decimal.max(0, limit.minus(spent))
      .div(days)
      .toDecimalPlaces(2)
      .toNumber(),
  };
}
export function csvExport(w: Workspace, rows: Row[]) {
  const cell = (v: unknown) => {
    if (typeof v === "number") return String(v);
    let text = String(v ?? "");
    if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    [
      "ID",
      "Date (UTC)",
      "Type",
      "Account",
      "Currency",
      "Category",
      "Amount",
      "Balance change",
      "Personal income/expense",
      "Source",
      "Notes",
      "Labels",
    ],
    ...rows.map((t) => [
      t.id,
      t.date_time,
      t.type,
      w.tables.accounts?.find((a) => a.id === t.account_id)?.name,
      w.profile.displayCurrency,
      w.tables.categories?.find((c) => c.id === t.category_id)?.name,
      t.amount,
      t.balance_delta,
      t.analytics_amount,
      t.source_type,
      t.notes,
      Array.isArray(t.tags) ? t.tags.join(", ") : "",
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
