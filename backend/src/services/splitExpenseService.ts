import Decimal from "decimal.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "../errors/httpError";
import { rpc } from "../db";
import { decimal } from "../utils/money";
import { CreateSplitExpenseInput } from "../validation/schemas";
export function calculateSplitParticipants(input: CreateSplitExpenseInput) {
  const fail = (message: string): never => {
    throw new HttpError(400, message);
  };
  if (
    !input.participants.length ||
    new Set(input.participants.map((p) => p.userId)).size !==
      input.participants.length ||
    new Set(input.payers.map((p) => p.userId)).size !== input.payers.length
  )
    fail("Duplicate or missing parties");
  const total = decimal(input.totalAmount);
  if (total.lte(0) || !total.eq(total.toDecimalPlaces(2)))
    fail("Invalid amount");
  if (input.splitType === "ADJUSTMENT") {
    const extras = input.participants.map((p) => decimal(p.shareValue ?? 0));
    if (
      input.participants.length > 100 ||
      extras.some((n) => n.abs().gte(1e12) || !n.eq(n.toDecimalPlaces(2)))
    )
      fail("Adjustments must be signed cent amounts");
    const count = input.participants.length;
    const common = total
      .mul(100)
      .minus(extras.reduce((sum, n) => sum.plus(n.mul(100)), decimal(0)));
    const numerators = extras.map((n) => common.plus(n.mul(100).mul(count)));
    if (numerators.some((n) => n.lt(0)))
      fail("Adjustments cannot make a final share negative");
    const cents = numerators.map((n) => n.div(count).floor());
    const remainder = total
      .mul(100)
      .minus(cents.reduce((sum, n) => sum.plus(n), decimal(0)))
      .toNumber();
    return input.participants.map((p, i) => ({
      ...p,
      amountOwed: cents[i].plus(i < remainder ? 1 : 0).div(100),
    }));
  }
  const weights = input.participants.map((p) =>
    decimal(input.splitType === "EQUAL" ? 1 : (p.shareValue ?? -1)),
  );
  if (weights.some((w) => w.isNegative())) fail("Missing or negative share");
  const sum = weights.reduce((a, b) => a.plus(b), decimal(0));
  if (
    input.splitType === "EXACT" &&
    (!sum.eq(total) || weights.some((w) => !w.eq(w.toDecimalPlaces(2))))
  )
    fail("Exact amounts do not sum up to total amount");
  if (input.splitType === "PERCENTAGE" && !sum.eq(100))
    fail("Percentages do not sum to 100");
  if (sum.lte(0)) fail("Shares must be greater than zero");
  const amounts = weights.map((w) =>
    input.splitType === "EXACT"
      ? w
      : total.mul(100).mul(w).div(sum).floor().div(100),
  );
  const remainder = total
    .minus(amounts.reduce((a, b) => a.plus(b), decimal(0)))
    .mul(100)
    .toNumber();
  return input.participants.map((p, i) => ({
    ...p,
    amountOwed: amounts[i].plus(i < remainder ? "0.01" : 0) as Decimal,
  }));
}
export async function createSplitExpense(
  client: SupabaseClient,
  input: CreateSplitExpenseInput,
) {
  if (!input.itemization) calculateSplitParticipants(input);
  return rpc(client, "create_split_expense_atomic", { p_input: input });
}
