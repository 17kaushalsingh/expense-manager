"use client";
import { T } from "@/components/i18n/Language";
import { AmountCalculator } from "./AmountCalculator";
import { useState } from "react";
import { Account, Category, Transaction } from "@/lib/types";
import { useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
function usable(accounts: Account[]) {
  return accounts.filter(
    (a) => !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(a.type),
  );
}
export function TransactionEditor({
  transaction,
  accounts,
  categories,
  onClose,
}: {
  transaction?: Transaction;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const [type, setType] = useState(transaction?.type || "EXPENSE");
  const [amount, setAmount] = useState(String(transaction?.amount ?? "")),
    [calculator, setCalculator] = useState(false);
  const action = useAction(
    (body: Record<string, unknown>) =>
      transaction
        ? apiClient.put(`/transactions/${transaction.id}`, body)
        : apiClient.post("/transactions", body),
    onClose,
  );
  return (
    <Modal
      title={transaction ? "Edit transaction" : "Add transaction"}
      onClose={onClose}
      busy={action.isPending}
    >
      {calculator && (
        <AmountCalculator
          initial={amount}
          onClose={() => setCalculator(false)}
          onApply={(v) => {
            setAmount(v);
            setCalculator(false);
          }}
        />
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            type,
            accountId: f.get("accountId"),
            categoryId: f.get("categoryId") || null,
            amount: Number(f.get("amount")),
            dateTime: new Date(String(f.get("dateTime"))).toISOString(),
            notes: String(f.get("notes") || "") || undefined,
            tags: [
              ...new Set(
                String(f.get("tags") || "")
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              ),
            ],
          });
        }}
      >
        <label className="label">
          <T text="Type" />
          <select
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value as "INCOME" | "EXPENSE")}
          >
            <option>EXPENSE</option>
            <option>INCOME</option>
          </select>
        </label>
        <label className="label">
          <T text="Account" />
          <select
            className="field"
            name="accountId"
            defaultValue={
              transaction?.accountId ??
              usable(accounts).find((a) => Number(a.balance) > 0)?.id ??
              usable(accounts)[0]?.id
            }
            required
          >
            <option value="">
              <T text="Choose account" />
            </option>
            {usable(accounts).map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          <T text="Category" />
          <select
            key={type}
            className="field"
            name="categoryId"
            defaultValue={
              transaction?.type === type ? (transaction.categoryId ?? "") : ""
            }
          >
            <option value="">
              <T text="Uncategorized" />
            </option>
            {categories
              .filter((c) => c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="label">
          <T text="Amount" />
          <input
            className="field"
            name="amount"
            data-autofocus
            autoFocus
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="subtle-link"
          onClick={() => setCalculator(true)}
        >
          Open amount calculator
        </button>
        <label className="label">
          Date and time
          <input
            className="field"
            name="dateTime"
            type="datetime-local"
            required
            defaultValue={localDate(transaction?.dateTime)}
          />
        </label>
        <label className="label">
          <T text="Notes" />
          <input
            className="field"
            name="notes"
            defaultValue={transaction?.notes}
          />
        </label>
        <ErrorMessage error={action.error} />
        <label className="label">
          Labels (comma-separated)
          <input
            className="field"
            name="tags"
            defaultValue={transaction?.tags?.join(", ") ?? ""}
            placeholder="groceries, work"
            maxLength={820}
          />
          <span className="text-xs text-text-secondary">
            Up to 20 labels, 40 characters each.
          </span>
        </label>
        <button className="btn" disabled={action.isPending}>
          Save transaction
        </button>
      </form>
    </Modal>
  );
}
function localDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function Transfer({
  accounts,
  onClose,
}: {
  accounts: Account[];
  onClose: () => void;
}) {
  const action = useAction(
    (body: Record<string, unknown>) =>
      apiClient.post("/transactions/transfer", body),
    onClose,
  );
  return (
    <Modal
      title="Transfer between accounts"
      onClose={onClose}
      busy={action.isPending}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            sourceAccountId: f.get("sourceAccountId"),
            targetAccountId: f.get("targetAccountId"),
            amount: Number(f.get("amount")),
            dateTime: new Date(String(f.get("dateTime"))).toISOString(),
          });
        }}
      >
        {["sourceAccountId", "targetAccountId"].map((name, i) => (
          <label className="label" key={name}>
            {i === 0 ? "From" : "To"}
            <select className="field" name={name} required>
              <option value="">
                <T text="Choose account" />
              </option>
              {usable(accounts).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="label">
          <T text="Amount" />
          <input
            className="field"
            type="number"
            step="0.01"
            min="0.01"
            name="amount"
            required
          />
        </label>
        <label className="label">
          Date and time
          <input
            className="field"
            type="datetime-local"
            name="dateTime"
            defaultValue={localDate()}
            required
          />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          <T text="Transfer" />
        </button>
      </form>
    </Modal>
  );
}
