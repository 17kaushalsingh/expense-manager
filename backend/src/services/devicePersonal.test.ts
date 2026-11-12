import { describe, it, expect } from "vitest";
import { blankWorkspace } from "../../../frontend/src/lib/device/vault";
import {
  ledgerSummary,
  queueCommand,
} from "../../../frontend/src/lib/device/ledger";
import {
  createLocalLoan,
  payLocalLoan,
  reverseLocalLoanPayment,
  loanOutstanding,
  saveLocalBill,
  generateLocalBills,
  reviewLocalBill,
  setLocalBillStatus,
  localNoon,
  deviceDay,
  saveLocalRecord,
} from "../../../frontend/src/lib/device/personal";
function ledger() {
  const w = blankWorkspace("Ledger", "USD", "UTC");
  w.tables.accounts = [
    {
      id: "cash",
      name: "Wallet",
      currency: "USD",
      type: "CASH",
      balance: 1000,
    },
    { id: "bank", currency: "USD", type: "BANK_ACCOUNT", balance: 500 },
  ];
  return w;
}
describe("complete private-device finance operations", () => {
  it("tracks lent principal, interest, worth and exact reversals", () => {
    const w = ledger(),
      id = createLocalLoan(w, {
        name: "Loan",
        counterparty: "Synthetic",
        direction: "LENT",
        principal: 100,
        startDate: "2026-11-01",
        accountId: "cash",
      });
    expect(w.tables.accounts[0].balance).toBe(900);
    expect(ledgerSummary(w).net).toBe(1500);
    const p = payLocalLoan(w, id, {
      principal: 25,
      interest: 5,
      accountId: "cash",
      date: "2026-11-11",
    });
    expect(loanOutstanding(w, id).toNumber()).toBe(75);
    expect(w.tables.accounts[0].balance).toBe(930);
    expect(ledgerSummary(w)).toEqual({ net: 1505, income: 5, expense: 0 });
    reverseLocalLoanPayment(w, p);
    reverseLocalLoanPayment(w, p);
    expect(loanOutstanding(w, id).toNumber()).toBe(100);
    expect(w.tables.accounts[0].balance).toBe(900);
    expect(ledgerSummary(w)).toEqual({ net: 1500, income: 0, expense: 0 });
    expect(() =>
      payLocalLoan(w, id, {
        principal: 101,
        interest: 0,
        accountId: "cash",
        date: "2026-11-11",
      }),
    ).toThrow("overpay");
  });
  it("tracks borrowed principal without counting debt proceeds as income", () => {
    const w = ledger(),
      id = createLocalLoan(w, {
        name: "Loan",
        counterparty: "Synthetic",
        direction: "BORROWED",
        principal: 100,
        startDate: "2026-11-01",
        accountId: "cash",
      });
    expect(ledgerSummary(w)).toEqual({ net: 1500, income: 0, expense: 0 });
    payLocalLoan(w, id, {
      principal: 50,
      interest: 3,
      accountId: "cash",
      date: "2026-11-11",
    });
    expect(ledgerSummary(w)).toEqual({ net: 1497, income: 0, expense: 3 });
  });
  it("generates unique month-end bill snapshots with exact posting and reversal", () => {
    const w = ledger(),
      id = saveLocalBill(w, {
        name: "Rent",
        type: "EXPENSE",
        amount: 20,
        accountId: "cash",
        frequency: "MONTHLY",
        startDate: "2024-01-31",
        endDate: "2024-03-31",
        timezone: "UTC",
      });
    expect(generateLocalBills(w, new Date("2024-03-31T23:00:00Z"))).toBe(3);
    expect(generateLocalBills(w, new Date("2024-03-31T23:00:00Z"))).toBe(0);
    expect(w.tables.bill_occurrences.map((d) => d.due_date)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
    ]);
    expect(w.tables.accounts[0].balance).toBe(1000);
    const d = String(w.tables.bill_occurrences[0].id);
    reviewLocalBill(w, d, "RECORD", { accountId: "cash", amount: 21 });
    reviewLocalBill(w, d, "RECORD", { accountId: "cash", amount: 21 });
    expect(w.tables.accounts[0].balance).toBe(979);
    expect(ledgerSummary(w).expense).toBe(21);
    reviewLocalBill(w, d, "REVERSE");
    expect(w.tables.accounts[0].balance).toBe(1000);
    expect(ledgerSummary(w).expense).toBe(0);
  });
  it("skips paused periods when resuming and respects timezone dates", () => {
    const w = ledger(),
      id = saveLocalBill(w, {
        name: "Subscription",
        type: "EXPENSE",
        amount: 10,
        accountId: "cash",
        frequency: "MONTHLY",
        startDate: "2026-01-31",
        timezone: "America/New_York",
      });
    setLocalBillStatus(w, id, "PAUSED");
    expect(generateLocalBills(w, new Date("2026-03-01T00:00:00Z"))).toBe(0);
    setLocalBillStatus(w, id, "ACTIVE", new Date("2026-03-01T12:00:00Z"));
    expect(generateLocalBills(w, new Date("2026-03-31T23:00:00Z"))).toBe(1);
    expect(w.tables.bill_occurrences[0].due_date).toBe("2026-03-31");
  });
  it.each([
    "Pacific/Kiritimati",
    "Pacific/Honolulu",
    "America/New_York",
    "Asia/Kolkata",
  ])("records the intended local calendar day in %s", (zone) => {
    for (const date of ["2026-03-08", "2026-11-01"]) {
      expect(deviceDay(new Date(localNoon(date, zone)), zone)).toBe(date);
    }
  });
  it("allocates a multi-account expense exactly once and reverses all components", () => {
    const w = ledger(),
      c = queueCommand(w, "PERSONAL_ENTRY_CREATE", {
        type: "EXPENSE",
        totalAmount: 10.01,
        currency: "USD",
        dateTime: "2026-11-11T12:00:00Z",
        allocations: [
          { accountId: "cash", amount: 3.34 },
          { accountId: "bank", amount: 6.67 },
        ],
      });
    expect(ledgerSummary(w).expense).toBe(10.01);
    expect(w.tables.accounts.map((a) => a.balance)).toEqual([996.66, 493.33]);
    queueCommand(w, "PERSONAL_ENTRY_DELETE", {}, c.id);
    expect(w.tables.accounts.map((a) => a.balance)).toEqual([1000, 500]);
    expect(ledgerSummary(w).expense).toBe(0);
  });
  it("edits and reverses conversion source records without description matching", () => {
    const w = ledger(),
      body = {
        accountId: "cash",
        type: "EXPENSE",
        originalCurrency: "EUR",
        originalAmount: 10,
        exchangeRate: 1.5,
        rateDate: "2026-11-01",
        dateTime: "2026-11-11T12:00:00Z",
      },
      c = queueCommand(w, "CONVERSION_CREATE", body);
    const tx = w.tables.transactions[0].id;
    queueCommand(w, "CONVERSION_UPDATE", { ...body, exchangeRate: 2 }, c.id);
    expect(w.tables.transactions[0].id).toBe(tx);
    expect(w.tables.accounts[0].balance).toBe(980);
    queueCommand(w, "CONVERSION_DELETE", {}, c.id);
    expect(w.tables.accounts[0].balance).toBe(1000);
  });
  it("includes noncash valuations once and rejects incompatible card settings", () => {
    const w = ledger(),
      asset = saveLocalRecord(w, "personal_assets", {
        name: "Car",
        kind: "VEHICLE",
      });
    saveLocalRecord(w, "asset_valuations", {
      asset_id: asset,
      value_date: "2026-11-01",
      value: 100,
    });
    saveLocalRecord(w, "asset_valuations", {
      asset_id: asset,
      value_date: "2026-11-10",
      value: 90,
    });
    expect(ledgerSummary(w).net).toBe(1590);
    expect(() =>
      saveLocalRecord(w, "card_settings", {
        account_id: "cash",
        credit_limit: 1000,
        statement_day: 0,
        due_day: 15,
      }),
    ).toThrow("credit-card");
  });
});
