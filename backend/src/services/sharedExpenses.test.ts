import { describe, it, expect } from "vitest";
import {
  sharedFilters,
  visibleSplit,
  visibleSplitResponse,
} from "./sharedExpenses";
describe("shared expense query boundaries", () => {
  it("rejects conflicting contexts, reversed ranges and unbounded pages", () => {
    for (const f of [
      { fromDate: "2026-11-11", toDate: "2026-11-01" },
      { minAmount: 20, maxAmount: 10 },
      { limit: 101 },
      { offset: -1 },
      { currency: "usd" },
      {
        groupId: "55555555-5555-4555-8555-555555555555",
        context: "individual",
      },
    ])
      expect(sharedFilters.safeParse(f).success).toBe(false);
    expect(sharedFilters.parse({ q: "  dinner  " })).toMatchObject({
      q: "dinner",
      limit: 25,
      offset: 0,
    });
  });
  it("exposes only the actor's account and personal category", () => {
    const split = {
      creator_id: "a",
      category_id: "category-a",
      payers: [
        { user_id: "a", account_id: "account-a" },
        { user_id: "b", account_id: "account-b" },
      ],
    };
    expect(visibleSplit(split, "b")).toEqual({
      creator_id: "a",
      category_id: null,
      payers: [{ user_id: "a" }, { user_id: "b", account_id: "account-b" }],
    });
    expect(visibleSplit(split, "a").category_id).toBe("category-a");
    expect(split.payers[0].account_id).toBe("account-a");
    expect(
      visibleSplitResponse(
        {
          creatorId: "a",
          categoryId: "c",
          payers: [{ userId: "a", accountId: "private" }],
        },
        "b",
      ),
    ).toEqual({ creatorId: "a", categoryId: null, payers: [{ userId: "a" }] });
  });
});
