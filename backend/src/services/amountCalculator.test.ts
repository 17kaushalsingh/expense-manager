import { describe, it, expect } from "vitest";
import { calculateAmount } from "../../../frontend/src/lib/amountCalculator";
describe("expense amount calculator", () => {
  it.each([
    ["0.1+0.2", "0.30"],
    ["12.50+3.20", "15.70"],
    ["(10+2)*3", "36.00"],
    ["10/3", "3.33"],
    ["0.005", "0.01"],
    ["20-5*2", "10.00"],
    ["-2+10", "8.00"],
    ["(12,5+3,5)÷2", "8.00"],
    ["3×4−2", "10.00"],
  ])("calculates %s without floating point loss", (expression, result) =>
    expect(calculateAmount(expression)).toBe(result),
  );
  it.each([
    "",
    "1/0",
    "2(3)",
    "alert(1)",
    "1;2",
    "NaN",
    "1,000.50",
    "1e3",
    "-1",
    "999999999999.995",
    "(1+2",
    "+".repeat(50) + "1",
  ])("rejects invalid or unsafe expression %s", (expression) =>
    expect(() => calculateAmount(expression)).toThrow(),
  );
});
