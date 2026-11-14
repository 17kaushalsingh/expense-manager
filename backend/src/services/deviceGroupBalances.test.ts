import { describe, it, expect } from "vitest";
import { blankWorkspace } from "../../../frontend/src/lib/device/vault";
import { groupBalances } from "../../../frontend/src/lib/device/splits";
function snapshot() {
  const w = blankWorkspace("Ledger", "USD", "UTC");
  w.tables.group_members = [
    { group_id: "group", user_id: "alice" },
    { group_id: "group", user_id: "bob" },
    { group_id: "other", user_id: "cara" },
  ];
  w.tables.split_expenses = [
    { id: "expense", group_id: "group" },
    { id: "unrelated", group_id: "other" },
  ];
  w.tables.split_payers = [
    { split_expense_id: "expense", user_id: "alice", amount_paid: 12.01 },
    { split_expense_id: "unrelated", user_id: "alice", amount_paid: 900 },
  ];
  w.tables.split_participants = [
    { split_expense_id: "expense", user_id: "alice", amount_owed: 6.01 },
    { split_expense_id: "expense", user_id: "bob", amount_owed: 6 },
  ];
  return w;
}
const values = (w: ReturnType<typeof snapshot>) =>
  Object.fromEntries(
    Object.entries(groupBalances(w, "group")).map(([id, n]) => [
      id,
      n.toFixed(2),
    ]),
  );
describe("saved group balances from real database column names", () => {
  it("counts payer/share rows exactly once and excludes another group", () => {
    expect(values(snapshot())).toEqual({ alice: "6.00", bob: "-6.00" });
  });
  it("includes partial settlements and ignores reversed or unrelated payments", () => {
    const w = snapshot();
    w.tables.settlements = [
      {
        id: "paid",
        group_id: "group",
        payer_id: "bob",
        payee_id: "alice",
        amount: 2,
      },
      {
        id: "reversed",
        group_id: "group",
        payer_id: "bob",
        payee_id: "alice",
        amount: 1,
      },
      {
        id: "other",
        group_id: "other",
        payer_id: "bob",
        payee_id: "alice",
        amount: 100,
      },
    ];
    w.tables.settlement_reversals = [{ settlement_id: "reversed" }];
    expect(values(w)).toEqual({ alice: "4.00", bob: "-4.00" });
    expect(
      Object.values(groupBalances(w, "group")).reduce(
        (sum, n) => sum + n.toNumber(),
        0,
      ),
    ).toBe(0);
  });
  it("returns all members at zero without posted expenses", () => {
    const w = snapshot();
    w.tables.split_expenses = [];
    expect(values(w)).toEqual({ alice: "0.00", bob: "0.00" });
  });
});
