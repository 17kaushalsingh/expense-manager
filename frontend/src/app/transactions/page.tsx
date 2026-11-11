"use client";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  SlidersHorizontal,
  Download,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
import { useResource, useAction } from "@/hooks/useResource";
import { useAccounts } from "@/hooks/useDashboard";
import { apiClient } from "@/lib/api/client";
import { Transaction, Category } from "@/lib/types";
import { useFormat } from "@/lib/format";
import { monthIn, dayIn } from "@/lib/calendar";
import {
  TransactionEditor,
  Transfer,
} from "@/components/transactions/TransactionForms";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import { Receipts } from "@/components/receipts/Receipts";
import { CsvImport } from "@/components/imports/CsvImport";
import {
  PersonalEntryEditor,
  BulkTransactions,
} from "@/components/transactions/PersonalEntry";
import {
  SpendingCalendar,
  CalendarData,
  changeMonth,
} from "@/components/transactions/SpendingCalendar";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading transactions…</p>}>
      <Transactions />
    </Suspense>
  );
}
function useSearchText(value: string) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setText(value), 300);
    return () => clearTimeout(t);
  }, [value]);
  return text;
}
function Transactions() {
  const search = useSearchParams(),
    { money, date, timezone } = useFormat();
  const [view, setView] = useState(
      search.get("view") === "calendar" ? "calendar" : "daily",
    ),
    [chosenMonth, setMonth] = useState<string | undefined>(
      search.get("accountId") ? "" : undefined,
    ),
    [day, setDay] = useState("");
  const month = chosenMonth ?? monthIn(timezone),
    calendarMonth = month || monthIn(timezone);
  const [filters, setFilters] = useState({
    q: "",
    type: "",
    accountId: search.get("accountId") ?? "",
    categoryId: search.get("categoryId") ?? "",
    label: "",
    sourceType: "",
    fromDate: "",
    toDate: "",
    minAmount: "",
    maxAmount: "",
    sort: "newest",
  });
  const [offset, setOffset] = useState(0),
    [showFilters, setShowFilters] = useState(false),
    [editor, setEditor] = useState<Transaction | null | undefined>(),
    [transfer, setTransfer] = useState(false),
    [detail, setDetail] = useState<Transaction>(),
    [remove, setRemove] = useState<Transaction>(),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState<unknown>();
  const [importing, setImporting] = useState(false);
  const [personal, setPersonal] = useState<string | null | undefined>(),
    [personalDelete, setPersonalDelete] = useState<string>(),
    [selecting, setSelecting] = useState(false),
    [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
      scope: "",
      ids: [],
    }),
    [bulk, setBulk] = useState(false);
  const deletePersonal = useAction(
    () => apiClient.delete(`/transactions/personal-entries/${personalDelete}`),
    () => setPersonalDelete(undefined),
  );
  const text = useSearchText(filters.q),
    params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters))
    if (v) params.set(k, k === "q" ? text : v);
  if (month) params.set("month", month);
  if (day) params.set("onDate", day);
  const scope = params.toString() + ":" + offset,
    selected = selection.scope === scope ? selection.ids : [];
  const labels = useResource<string[]>("/transactions/labels");
  const rows = useResource<{ items: Transaction[]; total: number }>(
      `/transactions/page?${params}&limit=50&offset=${offset}`,
    ),
    accounts = useAccounts(),
    categories = useResource<Category[]>("/categories"),
    calendar = useResource<CalendarData>(
      `/analytics/calendar?month=${calendarMonth}`,
    );
  const deletion = useAction(
    () => apiClient.delete(`/transactions/${remove?.id}`),
    () => setRemove(undefined),
  );
  const setPeriod = (m: string) => {
    setMonth(m);
    setDay("");
    setOffset(0);
  };
  const buckets = new Map<string, Transaction[]>();
  for (const row of rows.data?.items ?? []) {
    const key = dayIn(row.dateTime, timezone);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  async function exportCsv() {
    setExporting(true);
    setExportError(undefined);
    try {
      const p = new URLSearchParams(params);
      p.set("q", filters.q);
      const blob = await apiClient.download(`/transactions/export?${p}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions-${month || "all"}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e);
    } finally {
      setExporting(false);
    }
  }
  return (
    <DashboardLayout>
      <header className="flex justify-between items-end gap-3">
        <div>
          <p className="eyebrow mb-1.5">Your daily money record</p>
          <h1 className="text-3xl">Transactions</h1>
        </div>
        <button className="btn gap-2" onClick={() => setEditor(null)}>
          <Plus size={16} />
          <span className="hidden sm:inline">Add transaction</span>
          <span className="sm:hidden">Add</span>
        </button>
      </header>
      <section className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary !p-2"
              aria-label="Previous period"
              onClick={() => setPeriod(changeMonth(calendarMonth, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <label className="sr-only" htmlFor="activity-month">
              Month
            </label>
            <input
              id="activity-month"
              aria-label="Month"
              type="month"
              className="bg-transparent text-sm font-semibold max-w-38"
              value={month}
              onChange={(e) => setPeriod(e.target.value)}
            />
            <button
              className="btn-secondary !p-2"
              aria-label="Next period"
              onClick={() => setPeriod(changeMonth(calendarMonth, 1))}
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="subtle-link ml-1 hidden sm:inline-flex"
              onClick={() => setPeriod("")}
            >
              All dates
            </button>
          </div>
          <div className="segmented">
            <button
              className="segment"
              aria-pressed={view === "daily"}
              onClick={() => setView("daily")}
            >
              Daily
            </button>
            <button
              className="segment"
              aria-pressed={view === "calendar"}
              onClick={() => {
                setView("calendar");
                if (!month) setPeriod(calendarMonth);
              }}
            >
              Calendar
            </button>
          </div>
        </div>
        {month && (
          <div className="grid grid-cols-3 bg-surface-primary rounded-2xl py-4">
            <div className="text-center border-r border-border-soft">
              <p className="text-[10px] text-text-secondary">Month’s income</p>
              <p className="text-sm font-semibold text-positive tabular-nums mt-1">
                {calendar.isLoading
                  ? "—"
                  : money(calendar.data?.totalIncome ?? 0)}
              </p>
            </div>
            <div className="text-center border-r border-border-soft">
              <p className="text-[10px] text-text-secondary">
                Month’s expenses
              </p>
              <p className="text-sm font-semibold text-negative tabular-nums mt-1">
                {calendar.isLoading
                  ? "—"
                  : money(calendar.data?.totalExpense ?? 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-text-secondary">Net cash flow</p>
              <p className="text-sm font-semibold tabular-nums mt-1">
                {calendar.isLoading
                  ? "—"
                  : money(
                      (calendar.data?.totalIncome ?? 0) -
                        (calendar.data?.totalExpense ?? 0),
                    )}
              </p>
            </div>
          </div>
        )}
        <div className="flex gap-2 items-center">
          <label className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-3 text-text-secondary"
            />
            <input
              aria-label="Search notes"
              className="field !mt-0 !pl-9 !text-sm !py-2.5"
              type="search"
              placeholder="Search transactions"
              maxLength={200}
              value={filters.q}
              onChange={(e) => {
                setFilters({ ...filters, q: e.target.value });
                setOffset(0);
              }}
            />
          </label>
          <button
            className="btn-secondary !p-3"
            aria-label="Transaction filters"
            onClick={() => setShowFilters(true)}
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            className="btn-secondary !p-3"
            aria-label="Export CSV"
            disabled={exporting}
            onClick={exportCsv}
          >
            <Download size={16} />
          </button>
          <button
            className="btn-secondary !text-xs"
            onClick={() => setImporting(true)}
          >
            Import CSV
          </button>
          <button
            className="btn-secondary !p-3"
            aria-label="Transfer between accounts"
            onClick={() => setTransfer(true)}
          >
            <ArrowLeftRight size={16} />
          </button>
        </div>
      </section>
      <div className="flex gap-3 flex-wrap items-center">
        <button className="btn-secondary" onClick={() => setPersonal(null)}>
          Pay across accounts
        </button>
        <button
          className="btn-secondary"
          aria-pressed={selecting}
          onClick={() => {
            setSelecting(!selecting);
            setSelection({ scope, ids: [] });
          }}
        >
          {selecting ? "Done selecting" : "Select manual entries"}
        </button>
        {selecting && (
          <>
            <button
              className="btn-secondary"
              onClick={() =>
                setSelection({
                  scope,
                  ids: (rows.data?.items ?? [])
                    .filter((t) => t.sourceType === "MANUAL")
                    .map((t) => t.id),
                })
              }
            >
              Select page
            </button>
            <button
              className="btn"
              disabled={!selected.length}
              onClick={() => setBulk(true)}
            >
              Update {selected.length} selected
            </button>
          </>
        )}
      </div>
      <ErrorMessage error={rows.error || calendar.error || exportError} />
      {view === "calendar" && (
        <SpendingCalendar
          month={calendarMonth}
          data={calendar.data}
          loading={calendar.isLoading}
          onMonth={setPeriod}
          selected={day}
          onSelect={(d) => {
            setDay(d);
            setOffset(0);
          }}
        />
      )}
      {day && (
        <div className="flex justify-between text-xs text-text-secondary">
          <p>Entries for {day}</p>
          <button className="subtle-link" onClick={() => setDay("")}>
            Show whole month
          </button>
        </div>
      )}
      {rows.isLoading && (
        <p className="text-xs text-text-secondary">Loading transactions…</p>
      )}
      {rows.data?.items.length === 0 && (
        <p className="panel text-text-secondary text-sm">
          No transactions match these filters.
        </p>
      )}
      <div className="space-y-5">
        {[...buckets].map(([day, items]) => (
          <section key={day}>
            <header className="flex items-center gap-2 px-1 mb-2">
              <strong className="text-2xl tracking-tight">
                {Number(day.slice(-2))}
              </strong>
              <div>
                <p className="text-[10px] text-text-secondary">
                  {new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(day + "T12:00:00Z"))}
                </p>
                <p className="text-[10px] font-medium">
                  {new Intl.DateTimeFormat(undefined, {
                    weekday: "short",
                    timeZone: "UTC",
                  }).format(new Date(day + "T12:00:00Z"))}
                </p>
              </div>
              <span className="ml-auto text-[10px] text-text-secondary">
                {items.length} {items.length === 1 ? "entry" : "entries"}
              </span>
            </header>
            <div className="grouped-list">
              {items.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  {selecting && t.sourceType === "MANUAL" && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.notes || t.type} ${money(Number(t.amount))}`}
                      checked={selected.includes(t.id)}
                      onChange={(e) =>
                        setSelection({
                          scope,
                          ids: e.target.checked
                            ? [...selected, t.id]
                            : selected.filter((id) => id !== t.id),
                        })
                      }
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <TransactionRow
                      transaction={t}
                      compact
                      onClick={() => setDetail(t)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="flex justify-between items-center gap-3">
        <button
          className="btn-secondary"
          disabled={offset === 0 || rows.isFetching}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Previous
        </button>
        <p className="text-[11px] text-text-secondary">
          {rows.data?.total ?? 0} entries · page {Math.floor(offset / 50) + 1}
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
      {showFilters && (
        <Modal
          title="Filter transactions"
          onClose={() => setShowFilters(false)}
        >
          <div className="grid grid-cols-2 gap-4">
            {(
              ["type", "accountId", "categoryId", "sourceType", "sort"] as const
            ).map((k) => (
              <label className="label" key={k}>
                {
                  {
                    type: "Type",
                    accountId: "Account",
                    categoryId: "Category",
                    sourceType: "Source",
                    sort: "Sort",
                  }[k]
                }
                <select
                  className="field"
                  value={filters[k]}
                  onChange={(e) => {
                    setFilters({ ...filters, [k]: e.target.value });
                    setOffset(0);
                  }}
                >
                  {k !== "sort" && <option value="">All</option>}
                  {k === "accountId" || k === "categoryId"
                    ? (k === "accountId"
                        ? accounts.data
                        : categories.data
                      )?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))
                    : k === "sort"
                      ? [
                          ["newest", "Newest first"],
                          ["oldest", "Oldest first"],
                          ["highest", "Highest amount"],
                          ["lowest", "Lowest amount"],
                        ].map(([v, n]) => (
                          <option key={v} value={v}>
                            {n}
                          </option>
                        ))
                      : (k === "type"
                          ? ["INCOME", "EXPENSE", "TRANSFER"]
                          : [
                              "MANUAL",
                              "SPLIT",
                              "TRANSFER",
                              "SETTLEMENT",
                              "PERSONAL_LOAN",
                              "PERSONAL_BILL",
                              "PERSONAL_ENTRY",
                            ]
                        ).map((v) => <option key={v}>{v}</option>)}
                </select>
              </label>
            ))}
            {(["fromDate", "toDate"] as const).map((k) => (
              <label className="label" key={k}>
                {k === "fromDate" ? "From date" : "To date"}
                <input
                  className="field"
                  type="date"
                  value={filters[k]}
                  onChange={(e) => {
                    setFilters({ ...filters, [k]: e.target.value });
                    setPeriod("");
                  }}
                />
              </label>
            ))}
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
          </div>
          <label className="label">
            Label
            <select
              className="field"
              value={filters.label}
              onChange={(e) => {
                setFilters({ ...filters, label: e.target.value });
                setOffset(0);
              }}
            >
              <option value="">All labels</option>
              {labels.data?.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </label>
          <button
            className="btn-secondary"
            onClick={() => {
              setPeriod("");
              setShowFilters(false);
            }}
          >
            Show all dates
          </button>
          <button className="btn w-full" onClick={() => setShowFilters(false)}>
            Show transactions
          </button>
        </Modal>
      )}
      {personal !== undefined && (
        <PersonalEntryEditor
          entryId={personal ?? undefined}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setPersonal(undefined)}
        />
      )}
      {personalDelete && (
        <Confirm
          message="Delete this entire multi-account entry and reverse all its balances? Remove linked receipts and event expenses first."
          onClose={() => setPersonalDelete(undefined)}
          onConfirm={() => deletePersonal.mutate(undefined)}
          busy={deletePersonal.isPending}
          error={deletePersonal.error}
        />
      )}
      {bulk && (
        <BulkTransactions
          ids={selected}
          categories={categories.data ?? []}
          type={
            new Set(
              (rows.data?.items ?? [])
                .filter((t) => selected.includes(t.id))
                .map((t) => t.type),
            ).size === 1
              ? (rows.data?.items ?? []).find((t) => selected.includes(t.id))
                  ?.type
              : undefined
          }
          onClose={() => {
            setBulk(false);
            setSelection({ scope, ids: [] });
          }}
        />
      )}
      {editor !== undefined && (
        <TransactionEditor
          transaction={editor ?? undefined}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setEditor(undefined)}
        />
      )}{" "}
      {importing && (
        <CsvImport
          accounts={accounts.data ?? []}
          onClose={() => setImporting(false)}
        />
      )}
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
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}{" "}
      {detail && (
        <Modal title="Transaction details" onClose={() => setDetail(undefined)}>
          <p
            className={`text-3xl font-semibold tabular-nums ${detail.type === "INCOME" ? "text-positive" : "text-negative"}`}
          >
            {money(detail.amount, detail.account?.currency)}
          </p>
          <dl className="space-y-3">
            {Object.entries({
              Type: detail.type.toLowerCase(),
              Account: detail.account?.name,
              Category: detail.category?.name,
              Date: date(detail.dateTime),
              Notes: detail.notes,
              Labels: detail.tags?.join(", "),
              "Balance change": money(detail.balanceDelta),
            }).map(([k, v]) => (
              <div key={k} className="flex gap-3 justify-between text-sm">
                <dt className="text-text-secondary">{k}</dt>
                <dd className="text-right break-words">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {[
            "MANUAL",
            "PERSONAL_ENTRY",
            "PERSONAL_LOAN",
            "PERSONAL_BILL",
          ].includes(detail.sourceType) && (
            <Receipts transactionId={detail.id} canManage />
          )}
          {detail.sourceType === "PERSONAL_ENTRY" ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn"
                onClick={() => {
                  setPersonal(detail.sourceId);
                  setDetail(undefined);
                }}
              >
                Edit entire payment
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  deletePersonal.reset();
                  setPersonalDelete(detail.sourceId);
                  setDetail(undefined);
                }}
              >
                Delete entire payment
              </button>
            </div>
          ) : detail.sourceType === "MANUAL" ? (
            <div className="flex gap-2">
              <button
                className="btn flex-1"
                onClick={() => {
                  setEditor(detail);
                  setDetail(undefined);
                }}
              >
                Edit transaction
              </button>
              <button
                className="btn-secondary text-negative"
                onClick={() => {
                  setRemove(detail);
                  setDetail(undefined);
                  deletion.reset();
                }}
              >
                Delete
              </button>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">
              This entry belongs to a shared expense, payment, bill, loan or
              transfer. Make changes from its original record.
            </p>
          )}
        </Modal>
      )}
    </DashboardLayout>
  );
}
