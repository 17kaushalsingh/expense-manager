import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateAdjustments } from "../../../frontend/src/lib/adjustments";
import { calculateSplitParticipants } from "./splitExpenseService";

describe("adjustment split allocations", () => {
  it("adds personal extras to the equal common portion", () => {
    expect(
      calculateAdjustments(100, [
        { userId: "a", shareValue: 10 },
        { userId: "b" },
        { userId: "c" },
      ]).map((p) => p.amountOwed),
    ).toEqual([40, 30, 30]);
  });
  it("allows reductions without making the final shares negative", () => {
    expect(
      calculateAdjustments(30, [
        { userId: "a", shareValue: -5 },
        { userId: "b" },
        { userId: "c" },
      ]).map((p) => p.amountOwed),
    ).toEqual([6.67, 11.67, 11.66]);
    expect(() =>
      calculateAdjustments(1, [
        { userId: "a", shareValue: -2 },
        { userId: "b" },
      ]),
    ).toThrow(/negative/);
  });
  it("assigns remainder cents in participant order and permits zero shares", () => {
    expect(
      calculateAdjustments(0.02, [
        { userId: "c" },
        { userId: "a" },
        { userId: "b" },
      ]).map((p) => p.amountOwed),
    ).toEqual([0.01, 0.01, 0]);
  });
  it("rejects duplicates, nonfinite values and fractional cents", () => {
    for (const [total, parties] of [
      [1, []],
      [1, [{ userId: "a" }, { userId: "a" }]],
      [0, [{ userId: "a" }]],
      [Infinity, [{ userId: "a" }]],
      [1, [{ userId: "a", shareValue: NaN }]],
      [1, [{ userId: "a", shareValue: 0.001 }]],
    ] as [number, { userId: string; shareValue?: number }[]][])
      expect(() => calculateAdjustments(total, parties)).toThrow();
  });
  it("reconciles cent totals for combinations of signed adjustments and party counts", () => {
    let valid = 0;
    for (let count = 2; count <= 7; count++)
      for (let cents = 1; cents < 100; cents += 3)
        for (const extra of [-9, -2, 0, 1, 7, 40]) {
          const people = Array.from({ length: count }, (_, i) => ({
            userId: String(i),
            shareValue: i === 0 ? extra / 100 : 0,
          }));
          if (cents + extra * (count - 1) < 0 || cents - extra < 0) continue;
          const shares = calculateAdjustments(cents / 100, people);
          const server = calculateSplitParticipants({
            description: "Adjustment property case",
            totalAmount: cents / 100,
            splitType: "ADJUSTMENT",
            participants: people,
            payers: [{ userId: "0", amountPaid: cents / 100 }],
          });
          expect(server.map((p) => p.amountOwed.toNumber())).toEqual(
            shares.map((p) => p.amountOwed),
          );
          valid++;
          expect(
            shares.every(
              (s) =>
                s.amountOwed >= 0 &&
                new Decimal(s.amountOwed).decimalPlaces() <= 2,
            ),
          ).toBe(true);
          expect(
            shares
              .reduce((sum, s) => sum.plus(s.amountOwed), new Decimal(0))
              .eq(new Decimal(cents).div(100)),
          ).toBe(true);
        }
    expect(valid).toBeGreaterThan(500);
  });
});
