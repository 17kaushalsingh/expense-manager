import { it, expect } from "vitest";
import { recurrenceDate } from "./recurrence";
it("retains monthly, quarterly and yearly anchors rather than advancing a clamped date", () => {
  expect(
    [0, 1, 2, 3].map((i) => recurrenceDate("2028-01-31", "MONTHLY", i)),
  ).toEqual(["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
  expect(recurrenceDate("2028-02-29", "YEARLY", 1)).toBe("2029-02-28");
  expect(recurrenceDate("2028-02-29", "YEARLY", 4)).toBe("2032-02-29");
  expect(recurrenceDate("2028-01-31", "QUARTERLY", 1)).toBe("2028-04-30");
});
it("handles one-off and interval dates without timezone-dependent arithmetic", () => {
  expect(recurrenceDate("2026-11-01", "ONCE", 1)).toBeNull();
  expect(recurrenceDate("2026-11-01", "BIWEEKLY", 1)).toBe("2026-11-15");
  expect(recurrenceDate("2028-02-28", "DAILY", 2)).toBe("2028-03-01");
  expect(() => recurrenceDate("2028-01-01", "MONTHLY", -1)).toThrow();
});
