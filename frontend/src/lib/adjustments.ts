import Decimal from "decimal.js";

const Money = Decimal.clone({ precision: 60 });

/** Adjustments are extras to an equal common portion, not final exact shares. */
export function calculateAdjustments(
  total: number,
  participants: { userId: string; shareValue?: number }[],
) {
  const amount = new Money(total);
  if (
    !amount.isFinite() ||
    amount.lte(0) ||
    amount.gte(1e12) ||
    amount.decimalPlaces() > 2
  )
    throw new Error("Use a positive total with at most two decimal places.");
  if (
    !participants.length ||
    participants.length > 100 ||
    participants.some((p) => !p.userId) ||
    new Set(participants.map((p) => p.userId)).size !== participants.length
  )
    throw new Error("Choose between 1 and 100 unique participants.");
  const adjustments = participants.map((p) => new Money(p.shareValue ?? 0));
  if (
    adjustments.some(
      (n) => !n.isFinite() || n.abs().gte(1e12) || n.decimalPlaces() > 2,
    )
  )
    throw new Error(
      "Adjustments must be amounts with at most two decimal places.",
    );
  const count = participants.length,
    cents = amount.mul(100);
  const remaining = cents.minus(
    adjustments.reduce((sum, n) => sum.plus(n.mul(100)), new Money(0)),
  );
  // Compare integer numerators to avoid rounding a negative fraction up to zero.
  const numerators = adjustments.map((n) =>
    remaining.plus(n.mul(100).mul(count)),
  );
  if (numerators.some((n) => n.lt(0)))
    throw new Error("Adjustments cannot make anyone’s final share negative.");
  const allocations = numerators.map((n) => n.div(count).floor());
  const remainder = cents
    .minus(allocations.reduce((sum, n) => sum.plus(n), new Money(0)))
    .toNumber();
  return participants.map((p, i) => ({
    userId: p.userId,
    shareValue: adjustments[i].toNumber(),
    amountOwed: allocations[i]
      .plus(i < remainder ? 1 : 0)
      .div(100)
      .toNumber(),
  }));
}
