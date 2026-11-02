import { decimal } from "../utils/money";
export function localDay(iso: string, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  return [
    p.find((x) => x.type === "year")!.value,
    p.find((x) => x.type === "month")!.value,
    p.find((x) => x.type === "day")!.value,
  ].join("-");
}
export function calendarSummary(
  rows: { date_time: string; type: string; analytics_amount: number }[],
  month: string,
  timezone: string,
) {
  const days: Record<
    string,
    { date: string; income: number; expense: number; count: number }
  > = {};
  const end = new Date(`${month}-01T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  for (let n = 1; n <= end.getUTCDate(); n++) {
    const date = `${month}-${String(n).padStart(2, "0")}`;
    days[date] = { date, income: 0, expense: 0, count: 0 };
  }
  for (const r of rows) {
    const day = days[localDay(r.date_time, timezone)];
    if (
      !day ||
      r.analytics_amount <= 0 ||
      !["INCOME", "EXPENSE"].includes(r.type)
    )
      continue;
    const key = r.type === "INCOME" ? "income" : "expense";
    day[key] = decimal(day[key]).plus(r.analytics_amount).toNumber();
    day.count++;
  }
  const list = Object.values(days);
  return {
    month,
    timezone,
    days: list,
    totalIncome: list.reduce((n, d) => n.plus(d.income), decimal(0)).toNumber(),
    totalExpense: list
      .reduce((n, d) => n.plus(d.expense), decimal(0))
      .toNumber(),
  };
}
