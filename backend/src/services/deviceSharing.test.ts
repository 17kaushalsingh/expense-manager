import { describe, it, expect } from "vitest";
import { blankWorkspace } from "../../../frontend/src/lib/device/vault";
import {
  attachReceipt,
  prepareReceipt,
  removeReceipt,
} from "../../../frontend/src/lib/device/receiptData";
import { allocation } from "../../../frontend/src/lib/device/splits";
describe("offline sharing and receipt outbox", () => {
  it.each(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"])(
    "validates %s splits with multiple payers and deterministic cents",
    (mode) => {
      const parties = [
          {
            userId: "a",
            shareValue:
              mode === "EXACT" ? 3.34 : mode === "PERCENTAGE" ? 50 : 1,
          },
          {
            userId: "b",
            shareValue:
              mode === "EXACT" ? 3.33 : mode === "PERCENTAGE" ? 50 : 1,
          },
        ],
        result = allocation(6.67, mode, parties, [
          { userId: "a", amountPaid: 3 },
          { userId: "b", amountPaid: 3.67 },
        ]);
      expect(result.map((p) => p.amountOwed)).toEqual([3.34, 3.33]);
    },
  );
  it("rejects duplicate payers/participants and incomplete totals", () => {
    expect(() =>
      allocation(
        10,
        "EQUAL",
        [{ userId: "a" }, { userId: "a" }],
        [{ userId: "a", amountPaid: 10 }],
      ),
    ).toThrow();
    expect(() =>
      allocation(
        10,
        "EQUAL",
        [{ userId: "a" }],
        [
          { userId: "a", amountPaid: 5 },
          { userId: "a", amountPaid: 5 },
        ],
      ),
    ).toThrow();
    expect(() =>
      allocation(
        10,
        "EXACT",
        [{ userId: "a", shareValue: 9 }],
        [{ userId: "a", amountPaid: 10 }],
      ),
    ).toThrow();
    expect(() =>
      allocation(
        10,
        "PERCENTAGE",
        [{ userId: "a", shareValue: 99 }],
        [{ userId: "a", amountPaid: 10 }],
      ),
    ).toThrow();
  });
  it("persists receipt bytes and a stable upload key without changing ledger balances", async () => {
    const w = blankWorkspace("Ledger", "USD", "UTC");
    w.mode = "CLOUD";
    w.ownerId = w.profile.id;
    w.tables.accounts = [{ id: "cash", balance: 100 }];
    w.tables.transactions = [
      { id: "tx", source_type: "MANUAL", source_id: null, account_id: "cash" },
    ];
    const a = await prepareReceipt(
      new File(["%PDF-1.4\nsynthetic"], "test.pdf", {
        type: "application/pdf",
      }),
    );
    attachReceipt(w, "tx", a);
    expect(w.attachments[0].sha256).toBe(a.sha256);
    expect(w.commands[0].kind).toBe("RECEIPT_UPLOAD");
    const key = w.commands[0].id;
    removeReceipt(w, a.id);
    expect(w.commands[0].kind).toBe("RECEIPT_CANCEL");
    expect(w.commands[0].id).toBe(key);
    expect(w.attachments).toHaveLength(0);
    expect(w.tables.accounts[0].balance).toBe(100);
  });
  it("never permits personal receipts on transfers", async () => {
    const w = blankWorkspace("Ledger", "USD", "UTC");
    w.tables.transactions = [{ id: "tx", source_type: "TRANSFER" }];
    const a = await prepareReceipt(
      new File(["%PDF-1.4"], "x.pdf", { type: "application/pdf" }),
    );
    expect(() => attachReceipt(w, "tx", a)).toThrow("cannot have");
  });
});
