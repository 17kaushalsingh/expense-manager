import DecimalBase from "decimal.js";
import type { Workspace } from "./vault";
import { calculateAdjustments } from "../adjustments";
const Decimal = DecimalBase.clone({ precision: 60 });
/** Raw encrypted snapshot columns intentionally retain their database names. */
export function groupBalances(w: Pick<Workspace, "tables">, groupId: string) {
  const balances: Record<string, DecimalBase> = Object.create(null);
  for (const m of w.tables.group_members ?? [])
    if (m.group_id === groupId) balances[String(m.user_id)] = new Decimal(0);
  const ids = new Set(
    (w.tables.split_expenses ?? [])
      .filter((s) => s.group_id === groupId && !s.deleted_at)
      .map((s) => s.id),
  );
  for (const p of w.tables.split_payers ?? [])
    if (ids.has(p.split_expense_id) && balances[String(p.user_id)])
      balances[String(p.user_id)] = balances[String(p.user_id)].plus(
        String(p.amount_paid),
      );
  for (const p of w.tables.split_participants ?? [])
    if (ids.has(p.split_expense_id) && balances[String(p.user_id)])
      balances[String(p.user_id)] = balances[String(p.user_id)].minus(
        String(p.amount_owed),
      );
  const reversed = new Set(
    (w.tables.settlement_reversals ?? []).map((r) => r.settlement_id),
  );
  for (const s of w.tables.settlements ?? []) {
    if (s.group_id !== groupId || reversed.has(s.id)) continue;
    if (balances[String(s.payer_id)])
      balances[String(s.payer_id)] = balances[String(s.payer_id)].plus(
        String(s.amount),
      );
    if (balances[String(s.payee_id)])
      balances[String(s.payee_id)] = balances[String(s.payee_id)].minus(
        String(s.amount),
      );
  }
  return balances;
}
export function allocation(
  total: number,
  mode: string,
  parties: { userId: string; shareValue?: number }[],
  payers: { userId: string; amountPaid: number }[],
) {
  const n = new Decimal(total);
  if (
    !n.isFinite() ||
    n.lte(0) ||
    n.gte(1e12) ||
    n.decimalPlaces() > 2 ||
    !parties.length ||
    !payers.length ||
    new Set(parties.map((p) => p.userId)).size !== parties.length ||
    new Set(payers.map((p) => p.userId)).size !== payers.length
  )
    throw Error("Choose unique participants and payers with a positive total");
  if (
    !payers.every(
      (p) =>
        Number.isFinite(p.amountPaid) &&
        p.amountPaid > 0 &&
        new Decimal(p.amountPaid).decimalPlaces() <= 2,
    ) ||
    !payers.reduce((s, p) => s.plus(p.amountPaid), new Decimal(0)).eq(n)
  )
    throw Error("Payer amounts must exactly equal the total");
  if (mode === "ADJUSTMENT") return calculateAdjustments(total, parties);
  const values = parties.map(
    (p) => new Decimal(mode === "EQUAL" ? 1 : (p.shareValue ?? -1)),
  );
  if (values.some((v) => !v.isFinite() || v.lt(0)))
    throw Error("Complete participant allocations");
  const sum = values.reduce((s, n) => s.plus(n), new Decimal(0));
  if (
    sum.lte(0) ||
    (mode === "EXACT" &&
      (!sum.eq(n) || values.some((v) => v.decimalPlaces() > 2))) ||
    (mode === "PERCENTAGE" && !sum.eq(100)) ||
    !["EQUAL", "EXACT", "PERCENTAGE", "SHARES"].includes(mode)
  )
    throw Error(
      "Exact amounts must equal the total; percentages must equal 100; shares must be positive",
    );
  const amounts = values.map((v) =>
    mode === "EXACT" ? v : n.mul(100).mul(v).div(sum).floor().div(100),
  );
  const remainder = n
    .minus(amounts.reduce((s, n) => s.plus(n), new Decimal(0)))
    .mul(100)
    .toNumber();
  return parties.map((p, i) => ({
    ...p,
    amountOwed: amounts[i].plus(i < remainder ? 0.01 : 0).toNumber(),
  }));
}
