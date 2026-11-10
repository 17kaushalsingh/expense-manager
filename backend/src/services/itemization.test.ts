import { describe, expect, it } from "vitest";
import { calculateItemization } from "../../../frontend/src/lib/itemization";
describe("itemized receipt allocations", () => {
  it("shares line remainders in participant order and allocates tax/tip exactly", () => {
    const result = calculateItemization(
      {
        items: [
          { label: "Shared", amount: 5.01, participantIds: ["b", "a"] },
          { label: "Bob", amount: 5, participantIds: ["b"] },
        ],
        tax: 1,
        tip: 1.01,
      },
      ["a", "b"],
    );
    expect(result.total).toBe("12.02");
    expect(result.allocations).toEqual({ a: "3.02", b: "9.00" });
  });
  it("never assigns adjustments to people with no item share", () => {
    expect(
      calculateItemization(
        {
          items: [{ label: "Tea", amount: 0.01, participantIds: ["a"] }],
          tax: 0.01,
          tip: 0.01,
        },
        ["b", "a"],
      ).allocations,
    ).toEqual({ b: "0.00", a: "0.03" });
  });
  it("preserves cent allocation near the supported monetary limit", () => {
    const result = calculateItemization(
      {
        items: [
          { label: "Large", amount: 999999999990.01, participantIds: ["a"] },
          { label: "Shared cent", amount: 0.01, participantIds: ["a", "b"] },
          { label: "Small", amount: 9.94, participantIds: ["b"] },
        ],
        tax: 0.02,
        tip: 0.01,
      },
      ["a", "b"],
    );
    expect(result.total).toBe("999999999999.99");
    expect(result.allocations).toEqual({ a: "999999999990.05", b: "9.94" });
  });
  it.each([
    { label: "Tea", amount: 1.001, participantIds: ["a"] },
    { label: "Tea", amount: 0, participantIds: ["a"] },
    { label: "", amount: 1, participantIds: ["a"] },
    { label: "Tea", amount: 1, participantIds: [] },
    { label: "Tea", amount: 1, participantIds: ["a", "a"] },
    { label: "Tea", amount: 1, participantIds: ["outsider"] },
  ])("rejects invalid item %j", (item) => {
    expect(() =>
      calculateItemization({ items: [item], tax: 0, tip: 0 }, ["a"]),
    ).toThrow();
  });
  it("allocates discounts and extras without negative or unassigned cents", () => {
    const input = {
      items: [{ label: "Shared", amount: 0.03, participantIds: ["a", "b"] }],
      tax: 0,
      tip: 0,
      discount: 0.01,
    };
    expect(calculateItemization(input, ["c", "a", "b"])).toMatchObject({
      total: "0.02",
      allocations: { c: "0.00", a: "0.02", b: "0.00" },
    });
    expect(
      calculateItemization({ ...input, tax: 0.01, tip: 0.01, discount: 0.03 }, [
        "a",
        "b",
      ]).total,
    ).toBe("0.02");
    for (const discount of [-1, 0.001, 0.04, Infinity, NaN])
      expect(() =>
        calculateItemization({ ...input, discount }, ["a", "b"]),
      ).toThrow();
    expect(() =>
      calculateItemization({ ...input, discount: 0.03 }, ["a", "b"]),
    ).toThrow(/positive/);
  });
  it("preserves every cent across many discount and participant combinations", () => {
    for (let n = 1; n <= 9; n++)
      for (let subtotal = 1; subtotal <= 30; subtotal++)
        for (let discount = 0; discount < subtotal; discount++) {
          const ids = Array.from({ length: n }, (_, i) => String(i));
          const result = calculateItemization(
            {
              items: [
                {
                  label: "Shared",
                  amount: subtotal / 100,
                  participantIds: ids,
                },
              ],
              tax: 0,
              tip: 0,
              discount: discount / 100,
            },
            ids,
          );
          expect(
            Object.values(result.allocations).reduce(
              (sum, value) => sum + Math.round(Number(value) * 100),
              0,
            ),
          ).toBe(subtotal - discount);
          expect(
            Object.values(result.allocations).every(
              (value) => Number(value) >= 0,
            ),
          ).toBe(true);
        }
  });
  it("rejects negative adjustments and duplicate participants", () => {
    const input = {
      items: [{ label: "Tea", amount: 1, participantIds: ["a"] }],
      tax: -0.01,
      tip: 0,
    };
    expect(() => calculateItemization(input, ["a"])).toThrow();
    expect(() =>
      calculateItemization({ ...input, tax: 0 }, ["a", "a"]),
    ).toThrow();
  });
});
