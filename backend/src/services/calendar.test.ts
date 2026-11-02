import { describe, it, expect } from "vitest";
import { calendarSummary, localDay } from "./calendar";
describe("spending calendar", () => {
  it("assigns entries to the user's saved local date", () => {
    expect(localDay("2026-02-28T18:30:00Z", "Asia/Kolkata")).toBe("2026-03-01");
    expect(localDay("2026-03-08T04:59:00Z", "America/New_York")).toBe(
      "2026-03-07",
    );
    expect(localDay("2026-03-08T05:00:00Z", "America/New_York")).toBe(
      "2026-03-08",
    );
  });
  it("counts personal shares once and excludes transfers/zero adjustments", () => {
    const result = calendarSummary(
      [
        {
          date_time: "2026-02-15T12:00:00Z",
          type: "EXPENSE",
          analytics_amount: 5.01,
        },
        {
          date_time: "2026-02-15T12:00:00Z",
          type: "TRANSFER",
          analytics_amount: 10,
        },
        {
          date_time: "2026-02-15T12:00:00Z",
          type: "EXPENSE",
          analytics_amount: 0,
        },
        {
          date_time: "2026-02-28T18:30:00Z",
          type: "EXPENSE",
          analytics_amount: 7,
        },
      ],
      "2026-02",
      "Asia/Kolkata",
    );
    expect(result.totalExpense).toBe(5.01);
    expect(result.days[14].count).toBe(1);
    expect(result.days).toHaveLength(28);
  });
  it("zero-fills leap years and conserves decimal totals", () => {
    const result = calendarSummary(
      [
        {
          date_time: "2024-02-15T12:00:00Z",
          type: "INCOME",
          analytics_amount: 0.1,
        },
        {
          date_time: "2024-02-15T12:00:00Z",
          type: "INCOME",
          analytics_amount: 0.2,
        },
      ],
      "2024-02",
      "UTC",
    );
    expect(result.days).toHaveLength(29);
    expect(result.totalIncome).toBe(0.3);
    expect(result.days[0].income).toBe(0);
  });
});
