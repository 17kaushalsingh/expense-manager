import { describe, it, expect } from "vitest";
import { blankWorkspace } from "../../../frontend/src/lib/device/vault";
import {
  periodWindow,
  deviceReport,
  budgetProgress,
  csvExport,
} from "../../../frontend/src/lib/device/reports";
describe("offline calendar reports and budget windows", () => {
  it("retains month-end anchors and clamps leap years", () => {
    const p = { start_date: "2024-01-31", frequency: "MONTHLY" };
    expect(periodWindow(p, "2024-02-29")).toEqual({
      start: "2024-02-29",
      end: "2024-03-30",
    });
    expect(periodWindow(p, "2024-03-31")).toEqual({
      start: "2024-03-31",
      end: "2024-04-29",
    });
    expect(
      periodWindow(
        { start_date: "2024-02-29", frequency: "YEARLY" },
        "2025-02-28",
      ),
    ).toEqual({ start: "2025-02-28", end: "2026-02-27" });
  });
  it.each([
    ["DAILY", "2026-11-11", "2026-11-11"],
    ["WEEKLY", "2026-11-08", "2026-11-14"],
    ["BIWEEKLY", "2026-11-01", "2026-11-14"],
    ["MONTHLY", "2026-11-01", "2026-11-30"],
    ["QUARTERLY", "2026-11-01", "2027-01-31"],
    ["YEARLY", "2026-11-01", "2027-10-31"],
    ["CUSTOM", "2026-11-01", "2026-12-31"],
  ])(
    "computes %s periods without local DST arithmetic",
    (frequency, start, end) =>
      expect(
        periodWindow(
          {
            start_date: "2026-11-01",
            end_date: frequency === "CUSTOM" ? "2026-12-31" : null,
            frequency,
          },
          "2026-11-11",
        ),
      ).toEqual({ start, end }),
  );
  it("counts personal analytics once, includes child categories and applies overrides", () => {
    const w = blankWorkspace("Ledger", "USD", "America/New_York");
    w.tables.categories = [
      { id: "parent", name: "Food" },
      { id: "child", name: "Groceries", parent_id: "parent" },
    ];
    w.tables.transactions = [
      {
        id: "t",
        type: "EXPENSE",
        analytics_amount: 10,
        amount: 10,
        date_time: "2026-11-02T02:00:00Z",
        category_id: "child",
        account_id: "cash",
        notes: '=HYPERLINK("unsafe")',
      },
      {
        id: "transfer",
        type: "TRANSFER",
        analytics_amount: 0,
        amount: 100,
        date_time: "2026-11-01T12:00:00Z",
      },
    ];
    w.tables.budget_overrides = [
      { plan_id: "p", period_start: "2026-11-01", amount: 12 },
    ];
    expect(deviceReport(w, "2026-11-01", "2026-11-01").expense).toBe(10);
    const progress = budgetProgress(
      w,
      {
        id: "p",
        start_date: "2026-11-01",
        frequency: "MONTHLY",
        amount: 20,
        category_id: "parent",
      },
      "2026-11-11",
    )!;
    expect(progress.spent).toBe(10);
    expect(progress.remaining).toBe(2);
    expect(progress.percent).toBeCloseTo(83.3333);
    expect(csvExport(w, w.tables.transactions)).toContain("'=HYPERLINK");
  });
});
