import { it, expect } from "vitest";
import { cardCycle } from "./cardCycle";
it("retains statement anchors and places payment after closing", () => {
  expect(cardCycle("2028-03", 31, 5)).toEqual({
    start: "2028-03-01",
    end: "2028-03-31",
    due: "2028-04-05",
  });
  expect(cardCycle("2028-02", 31, 31)).toEqual({
    start: "2028-02-01",
    end: "2028-02-29",
    due: "2028-02-29",
  });
  expect(cardCycle("2026-01", 10, 25)).toEqual({
    start: "2025-12-11",
    end: "2026-01-10",
    due: "2026-01-25",
  });
});
