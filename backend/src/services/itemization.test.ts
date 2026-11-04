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
