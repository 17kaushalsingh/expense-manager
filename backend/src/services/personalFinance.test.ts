import { describe, it, expect } from "vitest";
import { installments, loanWorthOn, localDay } from "./personalFinance";
describe("personal finance calendars and principal", () => {
  it("allocates exact installment cents and partial payments without losing month anchors", () => {
    const rows = installments("10.01", 3, "2028-01-31", "MONTHLY", "4.00");
    expect(rows.map((r) => r.amount)).toEqual([3.34, 3.34, 3.33]);
    expect(rows.map((r) => r.dueDate)).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
    ]);
    expect(rows.map((r) => r.remaining)).toEqual([0, 2.68, 3.33]);
    expect(
      installments(0.01, 3, null, "MONTHLY", 0).map((r) => r.amount),
    ).toEqual([0.01, 0, 0]);
  });
  it("keeps weekly dates stable over leap and daylight-saving boundaries", () => {
    expect(
      installments(10, 3, "2028-02-27", "WEEKLY", 0).map((r) => r.dueDate),
    ).toEqual(["2028-02-27", "2028-03-05", "2028-03-12"]);
    expect(localDay("2026-11-01T05:30:00Z", "America/New_York")).toBe(
      "2026-11-01",
    );
    expect(localDay("2026-11-01T06:30:00Z", "America/New_York")).toBe(
      "2026-11-01",
    );
  });
  it("counts principal once and excludes interest, reversed and future repayments", () => {
    const loans = [
      { id: "a", direction: "LENT", principal: 100, start_date: "2026-01-01" },
      {
        id: "b",
        direction: "BORROWED",
        principal: 50,
        start_date: "2026-01-01",
      },
    ];
    const payments = [
      {
        loan_id: "a",
        principal: 20,
        date_time: "2026-02-01T00:00:00Z",
        reversed_at: null,
      },
      {
        loan_id: "a",
        principal: 10,
        date_time: "2026-02-01T00:00:00Z",
        reversed_at: "2026-02-02",
      },
    ];
    expect(loanWorthOn(loans, payments, "2026-01-31").net).toBe(50);
    expect(loanWorthOn(loans, payments, "2026-02-01").net).toBe(30);
  });
});
