"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { Account, Category } from "@/lib/types";
import { useFormat } from "@/lib/format";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
interface Entry {
  id: string;
  type: "INCOME" | "EXPENSE";
  totalAmount: number;
  currency: string;
  categoryId: string | null;
  dateTime: string;
  notes: string;
  tags: string[];
  requestKey: string;
  allocations: { accountId: string; amount: number }[];
}
export function PersonalEntryEditor({
  entryId,
  accounts,
  categories,
  onClose,
}: {
  entryId?: string;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const data = useResource<Entry>(
    `/transactions/personal-entries/${entryId}`,
    !!entryId,
  );
  return entryId && !data.data ? (
    <Modal title="Load personal entry" onClose={onClose}>
      <ErrorMessage error={data.error} />
      {data.isLoading && <p>Loading payment accounts…</p>}
    </Modal>
  ) : (
    <EntryForm
      entry={data.data}
      accounts={accounts}
      categories={categories}
      onClose={onClose}
    />
  );
}
function EntryForm({
  entry,
  accounts,
  categories,
  onClose,
}: {
  entry?: Entry;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const { currency, money } = useFormat(),
    [type, setType] = useState(entry?.type ?? "EXPENSE"),
    [total, setTotal] = useState(String(entry?.totalAmount ?? "")),
    [parts, setParts] = useState(
      entry?.allocations.map((a) => ({
        accountId: a.accountId,
        amount: String(a.amount),
      })) ?? [
        { accountId: "", amount: "" },
        { accountId: "", amount: "" },
      ],
    ),
    [key] = useState(() => entry?.requestKey ?? crypto.randomUUID());
  const [initialDate] = useState(() => {
    const d = entry ? new Date(entry.dateTime) : new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const action = useAction(
    (body: unknown) =>
      entry
        ? apiClient.put(`/transactions/personal-entries/${entry.id}`, body)
        : apiClient.post("/transactions/personal-entries", body),
    onClose,
  );
  const sum = parts.reduce(
      (n, p) =>
        n.plus(p.amount && Number.isFinite(Number(p.amount)) ? p.amount : 0),
      new Decimal(0),
    ),
    matches = !!total && new Decimal(total).eq(sum);
  return (
    <Modal
      title={entry ? "Edit payment across accounts" : "Pay across accounts"}
      onClose={onClose}
      busy={action.isPending}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            type,
            totalAmount: Number(total),
            currency,
            categoryId: f.get("category") || null,
            dateTime: new Date(f.get("date") as string).toISOString(),
            notes: f.get("notes"),
            tags: [
              ...new Set(
                String(f.get("tags") || "")
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              ),
            ],
            requestKey: key,
            allocations: parts.map((p) => ({
              accountId: p.accountId,
              amount: Number(p.amount),
            })),
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Type
            <select
              className="field"
              value={type}
              onChange={(e) => setType(e.target.value as Entry["type"])}
            >
              <option>EXPENSE</option>
              <option>INCOME</option>
            </select>
          </label>
          <label className="label">
            Total ({currency})
            <input
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              required
            />
          </label>
        </div>
        <label className="label">
          Category
          <select
            key={type}
            className="field"
            name="category"
            defaultValue={entry?.type === type ? (entry.categoryId ?? "") : ""}
          >
            <option value="">Uncategorized</option>
            {categories
              .filter((c) => c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="space-y-3">
          <legend className="font-semibold text-sm mb-2">
            Funding accounts
          </legend>
          {parts.map((p, i) => (
            <div key={i} className="flex gap-2 items-end">
              <label className="label flex-1 min-w-0">
                Account {i + 1}
                <select
                  className="field"
                  value={p.accountId}
                  onChange={(e) =>
                    setParts(
                      parts.map((v, j) =>
                        i === j ? { ...v, accountId: e.target.value } : v,
                      ),
                    )
                  }
                  required
                >
                  <option value="">Choose</option>
                  {accounts
                    .filter(
                      (a) =>
                        !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(
                          a.type,
                        ),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="label w-28">
                Amount
                <input
                  className="field"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={p.amount}
                  onChange={(e) =>
                    setParts(
                      parts.map((v, j) =>
                        i === j ? { ...v, amount: e.target.value } : v,
                      ),
                    )
                  }
                  required
                />
              </label>
              <button
                type="button"
                className="btn-secondary !px-2 mb-0.5"
                aria-label={`Remove account ${i + 1}`}
                disabled={parts.length <= 1}
                onClick={() => setParts(parts.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-brand-primary text-sm"
            disabled={parts.length >= 20}
            onClick={() => setParts([...parts, { accountId: "", amount: "" }])}
          >
            + Add account
          </button>
          <p
            className={
              matches ? "text-positive text-sm" : "text-text-secondary text-sm"
            }
          >
            {money(sum.toNumber())} allocated
            {total ? ` / ${money(Number(total))}` : ""}
            {matches ? " · total matched" : ""}
          </p>
        </fieldset>
        <label className="label">
          When (device local time)
          <input
            className="field"
            type="datetime-local"
            name="date"
            defaultValue={initialDate}
            required
          />
        </label>
        <label className="label">
          Notes
          <input
            className="field"
            name="notes"
            defaultValue={entry?.notes}
            maxLength={2000}
          />
        </label>
        <label className="label">
          Labels (comma-separated)
          <input
            className="field"
            name="tags"
            defaultValue={entry?.tags.join(", ")}
            maxLength={820}
          />
        </label>
        <p className="text-xs text-text-secondary">
          Each account appears once. Component amounts must equal the total;
          analytics count their sum once. Remove attached receipts and event
          links before replacing this record.
        </p>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending || !matches}>
          Save personal entry
        </button>
      </form>
    </Modal>
  );
}
export function BulkTransactions({
  ids,
  categories,
  type,
  onClose,
}: {
  ids: string[];
  categories: Category[];
  type: string | undefined;
  onClose: () => void;
}) {
  const [field, setField] = useState("category"),
    action = useAction(
      (body: unknown) => apiClient.post("/transactions/bulk", body),
      onClose,
    );
  return (
    <Modal
      title={`Update ${ids.length} manual entries`}
      onClose={onClose}
      busy={action.isPending}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const changes =
            field === "category"
              ? { categoryId: f.get("category") || null }
              : field === "labels"
                ? {
                    tags: [
                      ...new Set(
                        String(f.get("labels") || "")
                          .split(",")
                          .map((t) => t.trim().toLowerCase())
                          .filter(Boolean),
                      ),
                    ],
                  }
                : field === "notes"
                  ? { notes: f.get("notes") }
                  : {};
          action.mutate({ ids, changes, delete: field === "delete" });
        }}
      >
        <label className="label">
          Change
          <select
            className="field"
            value={field}
            onChange={(e) => setField(e.target.value)}
          >
            <option value="category">Replace category</option>
            <option value="labels">Replace labels</option>
            <option value="notes">Replace notes</option>
            <option value="delete">Delete & reverse balances</option>
          </select>
        </label>
        {field === "category" && (
          <label className="label">
            Category
            <select className="field" name="category">
              <option value="">Uncategorized</option>
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {field === "labels" && (
          <label className="label">
            Labels (comma-separated)
            <input className="field" name="labels" maxLength={820} />
          </label>
        )}
        {field === "notes" && (
          <label className="label">
            Notes
            <textarea className="field" name="notes" maxLength={2000} />
          </label>
        )}
        <p className="text-sm text-text-secondary">
          {field === "delete"
            ? "Deletion reverses every selected account effect. Remove attached receipts first. This cannot be undone."
            : "This replaces the selected field on every selected entry. Other fields stay unchanged."}{" "}
          The entire batch succeeds or rolls back together.
        </p>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending || ids.length === 0}>
          {field === "delete" ? "Delete selected entries" : "Apply changes"}
        </button>
      </form>
    </Modal>
  );
}
