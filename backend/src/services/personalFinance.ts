import { decimal } from "../utils/money";
import Decimal from "decimal.js";
import { DatabaseClient, dbResult } from "../db";
export async function loanWorthRows(db: DatabaseClient) {
  const loans: LoanWorth[] = [],
    payments: PaymentWorth[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page =
      dbResult(
        await db
          .from("personal_loans")
          .select("id,direction,principal,start_date")
          .order("id")
          .range(offset, offset + 999),
      ) ?? [];
    loans.push(...page);
    if (page.length < 1000) break;
  }
  for (let offset = 0; ; offset += 1000) {
    const page =
      dbResult(
        await db
          .from("loan_payments")
          .select("loan_id,principal,date_time,reversed_at")
          .order("id")
          .range(offset, offset + 999),
      ) ?? [];
    payments.push(...page);
    if (page.length < 1000) break;
  }
  return { loans, payments };
}
export function localDay(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function installments(
  principal: number | string,
  count: number,
  firstDue: string | null,
  frequency: string,
  repaid: number | string,
) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 600 ||
    !["WEEKLY", "MONTHLY"].includes(frequency)
  )
    throw new Error("Invalid installment plan");
  const cents = decimal(principal).mul(100);
  if (!cents.isInteger() || cents.lte(0)) throw new Error("Invalid principal");
  const base = cents.div(count).floor(),
    remainder = cents.mod(count).toNumber();
  let paid = decimal(repaid);
  return Array.from({ length: count }, (_, index) => {
    const amount = base.plus(index < remainder ? 1 : 0).div(100),
      allocated = Decimal.min(amount, Decimal.max(0, paid));
    paid = paid.minus(allocated);
    let dueDate: string | null = null;
    if (firstDue) {
      const anchor = new Date(`${firstDue}T12:00:00Z`);
      if (frequency === "WEEKLY")
        anchor.setUTCDate(anchor.getUTCDate() + index * 7);
      else {
        const day = anchor.getUTCDate();
        anchor.setUTCDate(1);
        anchor.setUTCMonth(anchor.getUTCMonth() + index);
        const last = new Date(anchor);
        last.setUTCMonth(last.getUTCMonth() + 1);
        last.setUTCDate(0);
        anchor.setUTCDate(Math.min(day, last.getUTCDate()));
      }
      dueDate = anchor.toISOString().slice(0, 10);
    }
    return {
      number: index + 1,
      dueDate,
      amount: amount.toNumber(),
      paid: allocated.toNumber(),
      remaining: amount.minus(allocated).toNumber(),
    };
  });
}
export interface LoanWorth {
  id: string;
  direction: string;
  principal: number | string;
  start_date: string;
}
export interface PaymentWorth {
  loan_id: string;
  principal: number | string;
  date_time: string;
  reversed_at: string | null;
}
export function loanWorthOn(
  loans: LoanWorth[],
  payments: PaymentWorth[],
  day?: string,
  timezone = "UTC",
) {
  let net = decimal(0),
    lent = decimal(0),
    borrowed = decimal(0);
  for (const l of loans) {
    if (day && l.start_date > day) continue;
    const paid = payments
      .filter(
        (p) =>
          p.loan_id === l.id &&
          !p.reversed_at &&
          (!day || localDay(p.date_time, timezone) <= day),
      )
      .reduce((n, p) => n.plus(p.principal), decimal(0));
    const remaining = decimal(l.principal).minus(paid);
    if (l.direction === "LENT") lent = lent.plus(remaining);
    else borrowed = borrowed.plus(remaining);
  }
  net = lent.minus(borrowed);
  return {
    net: net.toNumber(),
    lent: lent.toNumber(),
    borrowed: borrowed.toNumber(),
  };
}
