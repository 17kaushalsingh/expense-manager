import { describe, it, expect } from "vitest";
import { blankWorkspace } from "../../../frontend/src/lib/device/vault";
import {
  acknowledge,
  resolveReferences,
} from "../../../frontend/src/lib/device/syncState";
import {
  createLocalLoan,
  payLocalLoan,
  saveLocalBill,
  generateLocalBills,
  setLocalBillStatus,
  reviewLocalBill,
  saveLocalRecord,
} from "../../../frontend/src/lib/device/personal";
function cloud() {
  const w = blankWorkspace("Ledger", "USD", "UTC");
  w.mode = "CLOUD";
  w.ownerId = w.profile.id;
  w.tables.accounts = [
    { id: "cash", currency: "USD", type: "CASH", balance: 100 },
  ];
  return w;
}
describe("offline command dependency and version handling", () => {
  it("rewrites entity IDs while preserving names, notes, labels and arbitrary metadata", () => {
    const body = {
      id: "local",
      input: {
        accountId: "local",
        notes: "local",
        tags: ["local"],
        name: "local",
        metadata: { id: "local" },
        participants: [{ userId: "local" }],
        participantIds: ["local"],
      },
    };
    expect(resolveReferences(body, { local: "server" })).toEqual({
      id: "server",
      input: {
        accountId: "server",
        notes: "local",
        tags: ["local"],
        name: "local",
        metadata: { id: "local" },
        participants: [{ userId: "server" }],
        participantIds: ["server"],
      },
    });
  });
  it("advances only dependent versions and retains the current record's server version", () => {
    const w = cloud(),
      id = saveLocalRecord(w, "budget_plans", {
        name: "Plan",
        amount: 20,
        frequency: "MONTHLY",
        start_date: "2026-11-01",
        currency: "USD",
      });
    saveLocalRecord(
      w,
      "budget_plans",
      {
        name: "Plan",
        amount: 30,
        frequency: "MONTHLY",
        start_date: "2026-11-01",
        currency: "USD",
      },
      id,
    );
    const unrelated = saveLocalRecord(w, "personal_assets", {
      name: "Asset",
      kind: "OTHER",
      currency: "USD",
    });
    const cmd = w.commands[0];
    acknowledge(w, cmd, { id: "server-budget", rowVersion: "123" });
    expect(w.tables.budget_plans[0].row_version).toBe("123");
    expect(w.commands[0].payload.expectedVersion).toBe("123");
    expect(
      w.commands.find((c) => c.payload.localId === unrelated)!.payload
        .expectedVersion,
    ).toBeUndefined();
  });
  it("durably queues cloud loans, repayments, schedules, reviews and pause changes", () => {
    const w = cloud(),
      loan = createLocalLoan(w, {
        name: "Loan",
        counterparty: "Synthetic",
        principal: 10,
        direction: "LENT",
        startDate: "2026-11-01",
        accountId: "cash",
      });
    payLocalLoan(w, loan, {
      principal: 2,
      interest: 1,
      accountId: "cash",
      date: "2026-11-11",
    });
    const bill = saveLocalBill(w, {
      name: "Bill",
      amount: 3,
      type: "EXPENSE",
      accountId: "cash",
      currency: "USD",
      frequency: "MONTHLY",
      startDate: "2026-11-01",
      timezone: "UTC",
    });
    generateLocalBills(w, new Date("2026-11-11T12:00:00Z"));
    reviewLocalBill(w, String(w.tables.bill_occurrences[0].id), "RECORD", {
      accountId: "cash",
      amount: 3,
    });
    setLocalBillStatus(w, bill, "PAUSED");
    expect(w.commands.map((c) => c.kind)).toEqual([
      "LOAN_CREATE",
      "LOAN_PAY",
      "BILL_CREATE",
      "BILL_REFRESH",
      "BILL_RECORD",
      "BILL_UPDATE",
    ]);
    expect(
      w.commands.find((c) => c.kind === "BILL_RECORD")!.payload,
    ).toMatchObject({ billId: bill, occurrenceIndex: 0 });
  });
});
