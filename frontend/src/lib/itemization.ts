import Decimal from "decimal.js";
export interface Itemization {
  items: { label: string; amount: number; participantIds: string[] }[];
  tax: number;
  tip: number;
}
export function calculateItemization(value: Itemization, participants: string[]) {
  if (!participants.length || participants.length > 50 || new Set(participants).size !== participants.length)
    throw new Error("Choose up to 50 unique participants.");
  if (!value.items.length || value.items.length > 100) throw new Error("Add between 1 and 100 items.");
  const cents = (n: number, zero = false) => {
    const d = new Decimal(n);
    if (!d.isFinite() || d.lt(zero ? 0 : 0.01) || d.gte(1e12) || !d.eq(d.toDecimalPlaces(2)))
      throw new Error("Use valid amounts with at most two decimal places.");
    return d.mul(100);
  };
  const allocations: Record<string, Decimal> = Object.fromEntries(participants.map(id => [id, new Decimal(0)]));
  let subtotal = new Decimal(0);
  for (const item of value.items) {
    if (!item.label.trim() || item.label.trim().length > 120) throw new Error("Give every item a name of up to 120 characters.");
    if (!item.participantIds.length || new Set(item.participantIds).size !== item.participantIds.length || item.participantIds.some(id => !participants.includes(id)))
      throw new Error("Assign each item to current selected participants without duplicates.");
    const amount = cents(item.amount), base = amount.div(item.participantIds.length).floor();
    let remaining = amount.minus(base.mul(item.participantIds.length)).toNumber();
    for (const id of participants.filter(id => item.participantIds.includes(id))) {
      allocations[id] = allocations[id].plus(base).plus(remaining-- > 0 ? 1 : 0);
    }
    subtotal = subtotal.plus(amount);
  }
  const extras = cents(value.tax, true).plus(cents(value.tip, true));
  const total = subtotal.plus(extras);
  if (total.gte(1e14)) throw new Error("The expense total is too large.");
  let extraAllocated = new Decimal(0);
  const original = { ...allocations };
  for (const id of participants) {
    const extra = extras.mul(original[id]).div(subtotal).floor();
    allocations[id] = allocations[id].plus(extra); extraAllocated = extraAllocated.plus(extra);
  }
  let remaining = extras.minus(extraAllocated).toNumber();
  for (const id of participants.filter(id => original[id].gt(0))) if (remaining-- > 0) allocations[id] = allocations[id].plus(1);
  return {
    subtotal: subtotal.div(100).toFixed(2), total: total.div(100).toFixed(2),
    allocations: Object.fromEntries(participants.map(id => [id, allocations[id].div(100).toFixed(2)])),
  };
}
