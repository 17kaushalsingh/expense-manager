"use client";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
import { useResource, useAction } from "@/hooks/useResource";
import { useAccounts } from "@/hooks/useDashboard";
import { apiClient } from "@/lib/api/client";
import { Transaction, Category, Account } from "@/lib/types";
import { useFormat } from "@/lib/format";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading transactions…</p>}>
      <Transactions />
    </Suspense>
  );
}
function useDebouncedSearch(value: string) {
  const [search, setSearch] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return search;
}
function Transactions() {
  const search = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [exportError, setExportError] = useState<unknown>();
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    accountId: search.get("accountId") || "",
    categoryId: "",
    type: "",
    q: "",
    sourceType: "",
    minAmount: "",
    maxAmount: "",
    sort: "newest",
    from: "",
    to: "",
  });
  const searchText = useDebouncedSearch(filters.q);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters))
    if (v)
      params.set(
        k,
        k === "from"
          ? new Date(`${v}T00:00:00`).toISOString()
          : k === "to"
            ? new Date(`${v}T23:59:59.999`).toISOString()
            : k === "q"
              ? searchText
              : v,
      );
  const rows = useResource<{ items: Transaction[]; total: number }>(
      `/transactions/page?${params}&limit=50&offset=${offset}`,
    ),
    accounts = useAccounts(),
    categories = useResource<Category[]>("/categories");
  const { money, date } = useFormat();
  const [editor, setEditor] = useState<Transaction | null | undefined>(),
    [transfer, setTransfer] = useState(false),
    [remove, setRemove] = useState<Transaction>(),
    [detail, setDetail] = useState<Transaction>();
  const deletion = useAction(
    () => apiClient.delete(`/transactions/${remove?.id}`),
    () => setRemove(undefined),
  );
  return (
    <DashboardLayout>
      <header className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setTransfer(true)}>
            Transfer
          </button>
          <button className="btn" onClick={() => setEditor(null)}>
            Add transaction
          </button>
        </div>
      </header>
      <div className="flex gap-3 flex-wrap items-end">
        <label className="label flex-1 min-w-48">
          Search notes
          <input
            className="field"
            type="search"
            maxLength={200}
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
              setOffset(0);
            }}
            placeholder="Find an expense…"
          />
        </label>
        <label className="label">
          Sort
          <select
            className="field"
            value={filters.sort}
            onChange={(e) => {
              setFilters({ ...filters, sort: e.target.value });
              setOffset(0);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest amount</option>
            <option value="lowest">Lowest amount</option>
          </select>
        </label>
        <button
          className="btn-secondary"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            setExportError(undefined);
            try {
              const exportParams = new URLSearchParams(params);
              exportParams.set("q", filters.q);
              const blob = await apiClient.download(
                `/transactions/export?${exportParams}`,
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "transactions.csv";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              setExportError(e);
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      <section className="panel grid sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(["type", "accountId", "categoryId"] as const).map((k) => (
          <label className="label" key={k}>
            {k === "accountId"
              ? "Account"
              : k === "categoryId"
                ? "Category"
                : "Type"}
            <select
              className="field"
              value={filters[k]}
              onChange={(e) => {
                setFilters({ ...filters, [k]: e.target.value });
                setOffset(0);
              }}
            >
              <option value="">All</option>
              {k === "type"
                ? ["INCOME", "EXPENSE", "TRANSFER"].map((t) => (
                    <option key={t}>{t}</option>
                  ))
                : (k === "accountId" ? accounts.data : categories.data)?.map(
                    (v) => (
                      <option value={v.id} key={v.id}>
                        {v.name}
                      </option>
                    ),
                  )}
            </select>
          </label>
        ))}
        {(["from", "to"] as const).map((k) => (
          <label className="label" key={k}>
            {k === "from" ? "From" : "To"}
            <input
              className="field"
              type="date"
              value={filters[k]}
              onChange={(e) => {
                setFilters({ ...filters, [k]: e.target.value });
                setOffset(0);
              }}
            />
          </label>
        ))}
      </section>
      <section className="panel grid sm:grid-cols-3 gap-3">
        <label className="label">
          Source
          <select
            className="field"
            value={filters.sourceType}
            onChange={(e) => {
              setFilters({ ...filters, sourceType: e.target.value });
              setOffset(0);
            }}
          >
            <option value="">All sources</option>
            {["MANUAL", "SPLIT", "TRANSFER", "SETTLEMENT"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {(["minAmount", "maxAmount"] as const).map((k) => (
          <label className="label" key={k}>
            {k === "minAmount" ? "Minimum amount" : "Maximum amount"}
            <input
              className="field"
              type="number"
              min="0"
              step="0.01"
              value={filters[k]}
              onChange={(e) => {
                setFilters({ ...filters, [k]: e.target.value });
                setOffset(0);
              }}
            />
          </label>
        ))}
      </section>
      <ErrorMessage error={rows.error || exportError} />
      {rows.isLoading && <p>Loading transactions…</p>}
      {rows.data?.items.length === 0 && (
        <p className="panel">No transactions match these filters.</p>
      )}
      <div className="space-y-3">
        {rows.data?.items.map((t) => (
          <article
            key={t.id}
            className="panel flex flex-wrap justify-between gap-4"
          >
            <button className="text-left" onClick={() => setDetail(t)}>
              <h2 className="font-semibold">{t.notes || t.type}</h2>
              <p className="text-xs text-text-secondary">
                {t.account?.name} · {date(t.dateTime)} ·{" "}
                {t.category?.name || t.sourceType}
              </p>
            </button>
            <div className="flex gap-2 items-center">
              <span className="font-semibold tabular-nums">
                {money(t.amount, t.account?.currency)}
              </span>
              {t.sourceType === "MANUAL" && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => setEditor(t)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      deletion.reset();
                      setRemove(t);
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <button
          className="btn-secondary"
          disabled={offset === 0 || rows.isFetching}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Previous
        </button>
        <p>
          {rows.data?.total ?? 0} transactions · page{" "}
          {Math.floor(offset / 50) + 1}
        </p>
        <button
          className="btn-secondary"
          disabled={
            !rows.data || offset + 50 >= rows.data.total || rows.isFetching
          }
          onClick={() => setOffset(offset + 50)}
        >
          Next
        </button>
      </div>
      {editor !== undefined && (
        <TransactionEditor
          transaction={editor ?? undefined}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setEditor(undefined)}
        />
      )}{" "}
      {transfer && (
        <Transfer
          accounts={accounts.data ?? []}
          onClose={() => setTransfer(false)}
        />
      )}{" "}
      {remove && (
        <Confirm
          message="Delete this transaction and reverse its balance effect?"
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate()}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}{" "}
      {detail && (
        <Modal title="Transaction details" onClose={() => setDetail(undefined)}>
          <dl className="space-y-3">
            {Object.entries({
              Type: detail.type,
              Amount: money(detail.amount),
              Account: detail.account?.name,
              Category: detail.category?.name,
              Date: date(detail.dateTime),
              Source: detail.sourceType,
              Notes: detail.notes,
              "Balance change": money(detail.balanceDelta),
            }).map(([label, value]) => (
              <div key={label}>
                <dt className="text-text-secondary text-sm">{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </DashboardLayout>
  );
}
function usable(accounts: Account[]) {
  return accounts.filter(
    (a) => !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(a.type),
  );
}
function TransactionEditor({
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
    >
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
          });
        }}
      >
        <label className="label">
          Type
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
          Account
          <select
            className="field"
            name="accountId"
            defaultValue={transaction?.accountId}
            required
          >
            <option value="">Choose account</option>
            {usable(accounts).map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Category
          <select
            key={type}
            className="field"
            name="categoryId"
            defaultValue={
              transaction?.type === type ? (transaction.categoryId ?? "") : ""
            }
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
        <label className="label">
          Amount
          <input
            className="field"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={transaction?.amount}
          />
        </label>
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
          Notes
          <input
            className="field"
            name="notes"
            defaultValue={transaction?.notes}
          />
        </label>
        <ErrorMessage error={action.error} />
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
function Transfer({
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
    <Modal title="Transfer between accounts" onClose={onClose}>
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
              <option value="">Choose account</option>
              {usable(accounts).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="label">
          Amount
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
          Transfer
        </button>
      </form>
    </Modal>
  );
}
