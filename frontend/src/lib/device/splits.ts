import DecimalBase from "decimal.js";
const Decimal = DecimalBase.clone({ precision: 60 });
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
