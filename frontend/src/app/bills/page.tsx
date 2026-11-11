"use client";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource, useAction } from "@/hooks/useResource";
import { useAccounts } from "@/hooks/useDashboard";
import { useFormat } from "@/lib/format";
import { dayIn } from "@/lib/calendar";
import { apiClient } from "@/lib/api/client";
import { Account, Category } from "@/lib/types";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
interface Bill {
  id: string;
  name: string;
  type: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  accountId: string | null;
  frequency: string;
  startDate: string;
  endDate: string | null;
  timezone: string;
  status: string;
  notes: string;
  nextDueDate: string | null;
}
interface Occurrence {
  id: string;
  billId: string;
  dueDate: string;
  reviewDate: string;
  timezone: string;
  status: string;
  payload: Pick<
    Bill,
    | "name"
    | "type"
    | "amount"
    | "currency"
    | "categoryId"
    | "accountId"
    | "notes"
  >;
}
export default function Bills() {
  const { money, currency, timezone } = useFormat(),
    bills = useResource<Bill[]>("/bills"),
    accounts = useAccounts(),
    categories = useResource<Category[]>("/categories");
  const [status, setStatus] = useState("DUE"),
    [offset, setOffset] = useState(0),
    [edit, setEdit] = useState<Bill | null | undefined>(),
    [record, setRecord] = useState<Occurrence>(),
    [postpone, setPostpone] = useState<Occurrence>(),
    [decision, setDecision] = useState<{
      row: Occurrence;
      action: "skip" | "reverse";
    }>(),
    [showArchived, setArchived] = useState(false);
  const occurrences = useResource<{ items: Occurrence[]; total: number }>(
      `/bills/occurrences?status=${status}&limit=25&offset=${offset}`,
    ),
    refresh = useAction(() => apiClient.post("/bills/refresh", {})),
    review = useAction(
      () =>
        apiClient.post(
          `/bills/occurrences/${decision?.row.id}/${decision?.action}`,
          {},
        ),
      () => setDecision(undefined),
    );
  const today = dayIn(new Date().toISOString(), timezone),
    tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const upcoming =
    bills.data?.filter(
      (b) =>
        b.status === "ACTIVE" &&
        b.nextDueDate &&
        b.nextDueDate <= tomorrow.toISOString().slice(0, 10),
    ) ?? [];
  return (
    <DashboardLayout>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow">Nothing slips through</p>
          <h1 className="text-3xl font-bold mt-2">Bills & recurring income</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(undefined)}
          >
            Check due items
          </button>
          <button className="btn" onClick={() => setEdit(null)}>
            New schedule
          </button>
        </div>
      </header>
      <p className="text-sm text-text-secondary">
        Review each occurrence before recording. Hosted scheduling runs hourly,
        even when the app is closed. Pending items do not change balances.
      </p>
      <ErrorMessage
        error={
          bills.error ||
          accounts.error ||
          categories.error ||
          occurrences.error ||
          refresh.error
        }
      />
      {refresh.isSuccess && (
        <p role="status" className="text-sm">
          Due items checked.
        </p>
      )}
      {upcoming.length > 0 && (
        <section className="panel space-y-2">
          <h2 className="font-semibold">Coming up</h2>
          {upcoming.map((b) => (
            <p key={b.id} className="text-sm">
              {b.name} · {money(Number(b.amount))} · {b.nextDueDate} (
              {b.timezone})
            </p>
          ))}
        </section>
      )}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Review timeline</h2>
          <label className="label">
            Show
            <select
              className="field"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              {["DUE", "RECORDED", "SKIPPED", "REVERSED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        {occurrences.isLoading && <p>Loading timeline…</p>}
        {occurrences.data?.items.length === 0 && (
          <p className="panel text-text-secondary">
            No {status.toLowerCase()} occurrences. Scheduled items appear when
            their local due date arrives.
          </p>
        )}
        {occurrences.data?.items.map((o) => (
          <article
            key={o.id}
            className="panel flex flex-wrap justify-between gap-4"
          >
            <div>
              <p className="eyebrow">
                {o.payload.type.toLowerCase()} · {o.status.toLowerCase()}
              </p>
              <h3 className="font-semibold text-lg mt-1">{o.payload.name}</h3>
              <p className="text-sm text-text-secondary">
                Due {o.dueDate}
                {o.reviewDate !== o.dueDate &&
                  ` · postponed to ${o.reviewDate}`}{" "}
                · {o.timezone}
              </p>
              <p className="text-xl font-semibold mt-2">
                {money(Number(o.payload.amount), o.payload.currency)}
              </p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              {o.status === "DUE" && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => setRecord(o)}
                  >
                    Review & record
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setPostpone(o)}
                  >
                    Postpone
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      review.reset();
                      setDecision({ row: o, action: "skip" });
                    }}
                  >
                    Skip
                  </button>
                </>
              )}
              {o.status === "RECORDED" && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    review.reset();
                    setDecision({ row: o, action: "reverse" });
                  }}
                >
                  Reverse record
                </button>
              )}
            </div>
          </article>
        ))}
        {occurrences.data && occurrences.data.total > 25 && (
          <div className="flex justify-between items-center">
            <button
              className="btn-secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous
            </button>
            <p className="text-sm">
              {offset + 1}–{Math.min(offset + 25, occurrences.data.total)} of{" "}
              {occurrences.data.total}
            </p>
            <button
              className="btn-secondary"
              disabled={offset + 25 >= occurrences.data.total}
              onClick={() => setOffset(offset + 25)}
            >
              Next
            </button>
          </div>
        )}
      </section>
      <div className="flex justify-between gap-3">
        <h2 className="text-xl font-semibold">Schedules</h2>
        <label className="flex gap-2 text-sm items-center">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Include archived
        </label>
      </div>
      {bills.isLoading && <p>Loading schedules…</p>}
      {bills.data?.length === 0 && (
        <p className="panel">
          Set up rent, subscriptions, salary or a one-off bill.
        </p>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        {bills.data
          ?.filter((b) => showArchived || b.status !== "ARCHIVED")
          .map((b) => (
            <article key={b.id} className="panel space-y-3">
              <p className="eyebrow">
                {b.frequency.toLowerCase()} · {b.status.toLowerCase()}
              </p>
              <h3 className="text-xl font-semibold">{b.name}</h3>
              <p>
                {money(Number(b.amount))} · {b.type.toLowerCase()}
              </p>
              <p className="text-sm text-text-secondary">
                {b.nextDueDate ? `Next ${b.nextDueDate}` : "No next occurrence"}{" "}
                · {b.timezone}
              </p>
              {b.status !== "ARCHIVED" && (
                <button className="btn-secondary" onClick={() => setEdit(b)}>
                  Edit / pause / archive
                </button>
              )}
            </article>
          ))}
      </div>
      {edit !== undefined && (
        <BillForm
          bill={edit}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          today={today}
          currency={currency}
          timezone={timezone}
          onClose={() => setEdit(undefined)}
        />
      )}
      {record && (
        <RecordBill
          row={record}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setRecord(undefined)}
        />
      )}
      {postpone && (
        <Postpone row={postpone} onClose={() => setPostpone(undefined)} />
      )}
      {decision && (
        <Modal
          title={
            decision.action === "skip"
              ? "Skip occurrence"
              : "Reverse recorded entry"
          }
          onClose={() => setDecision(undefined)}
          busy={review.isPending}
        >
          <p>
            {decision.action === "skip"
              ? "Skip this occurrence? The schedule continues for future dates."
              : "Undo the recorded balance and analytics effects? This does not cancel any external payment."}
          </p>
          <ErrorMessage error={review.error} />
          <button
            className="btn"
            disabled={review.isPending}
            onClick={() => review.mutate(undefined)}
          >
            {decision.action === "skip"
              ? "Skip this occurrence"
              : "Reverse record"}
          </button>
        </Modal>
      )}
    </DashboardLayout>
  );
}
function BillForm({
  bill,
  accounts,
  categories,
  today,
  currency,
  timezone,
  onClose,
}: {
  bill: Bill | null;
  accounts: Account[];
  categories: Category[];
  today: string;
  currency: string;
  timezone: string;
  onClose: () => void;
}) {
  const [type, setType] = useState(bill?.type ?? "EXPENSE"),
    action = useAction(
      (body: unknown) =>
        bill
          ? apiClient.put(`/bills/${bill.id}`, body)
          : apiClient.post("/bills", body),
      onClose,
    );
  return (
    <Modal
      title={bill ? "Edit schedule" : "New schedule"}
      onClose={onClose}
      busy={action.isPending}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            name: f.get("name"),
            type,
            amount: Number(f.get("amount")),
            currency,
            categoryId: f.get("category") || null,
            accountId: f.get("account") || null,
            frequency: bill?.frequency ?? f.get("frequency"),
            startDate: bill?.startDate ?? f.get("start"),
            endDate: f.get("end") || null,
            timezone: bill?.timezone ?? f.get("timezone"),
            status: f.get("status"),
            notes: f.get("notes"),
          });
        }}
      >
        <label className="label">
          Name
          <input
            className="field"
            name="name"
            defaultValue={bill?.name}
            maxLength={120}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Type
            <select
              className="field"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </select>
          </label>
          <label className="label">
            Amount ({currency})
            <input
              className="field"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={bill?.amount}
              required
            />
          </label>
        </div>
        <label className="label">
          Default account
          <select
            className="field"
            name="account"
            defaultValue={bill?.accountId ?? ""}
          >
            <option value="">Choose during review</option>
            {accounts
              .filter(
                (a) =>
                  !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(a.type),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
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
            name="category"
            defaultValue={
              categories.some(
                (c) => c.id === bill?.categoryId && c.type === type,
              )
                ? bill!.categoryId!
                : ""
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
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Repeats
            <select
              name="frequency"
              className="field"
              defaultValue={bill?.frequency ?? "MONTHLY"}
              disabled={!!bill}
            >
              {[
                "ONCE",
                "DAILY",
                "WEEKLY",
                "BIWEEKLY",
                "MONTHLY",
                "QUARTERLY",
                "YEARLY",
              ].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="label">
            Starts
            <input
              className="field"
              name="start"
              type="date"
              defaultValue={bill?.startDate ?? today}
              min={bill ? undefined : today}
              disabled={!!bill}
              required
            />
          </label>
          <label className="label">
            Ends (optional)
            <input
              className="field"
              name="end"
              type="date"
              defaultValue={bill?.endDate ?? ""}
            />
          </label>
          <label className="label">
            Status
            <select
              name="status"
              className="field"
              defaultValue={bill?.status ?? "ACTIVE"}
            >
              {["ACTIVE", "PAUSED", ...(bill ? ["ARCHIVED"] : [])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="label">
          IANA timezone
          <input
            className="field"
            name="timezone"
            defaultValue={bill?.timezone ?? timezone}
            disabled={!!bill}
            required
          />
        </label>
        <label className="label">
          Notes
          <textarea
            className="field"
            name="notes"
            defaultValue={bill?.notes ?? ""}
            maxLength={2000}
          />
        </label>
        <p className="text-xs text-text-secondary">
          Changes affect future occurrences. Paused dates are skipped on resume.
          Archiving skips pending occurrences and cannot be undone. Cadence and
          timezone stay fixed.
        </p>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save schedule
        </button>
      </form>
    </Modal>
  );
}
function RecordBill({
  row,
  accounts,
  categories,
  onClose,
}: {
  row: Occurrence;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
}) {
  const action = useAction(
    (body: unknown) =>
      apiClient.post(`/bills/occurrences/${row.id}/record`, body),
    onClose,
  );
  return (
    <Modal
      title={`Record · ${row.payload.name}`}
      onClose={onClose}
      busy={action.isPending}
    >
      <p className="text-sm text-text-secondary">
        Review the actual amount and account. This records{" "}
        {row.payload.type.toLowerCase()} now; no money is sent.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            accountId: f.get("account"),
            amount: Number(f.get("amount")),
            categoryId: f.get("category") || null,
            notes: f.get("notes"),
            dateTime: new Date().toISOString(),
          });
        }}
      >
        <label className="label">
          Account
          <select
            className="field"
            name="account"
            defaultValue={row.payload.accountId ?? ""}
            required
          >
            <option value="">Choose account</option>
            {accounts
              .filter(
                (a) =>
                  !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(a.type),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="label">
          Actual amount
          <input
            className="field"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={row.payload.amount}
            required
          />
        </label>
        <label className="label">
          Category
          <select
            className="field"
            name="category"
            defaultValue={row.payload.categoryId ?? ""}
          >
            <option value="">Uncategorized</option>
            {categories
              .filter((c) => c.type === row.payload.type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="label">
          Notes
          <textarea
            className="field"
            name="notes"
            defaultValue={row.payload.notes || row.payload.name}
            maxLength={2000}
          />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Record {row.payload.type.toLowerCase()}
        </button>
      </form>
    </Modal>
  );
}
function Postpone({ row, onClose }: { row: Occurrence; onClose: () => void }) {
  const action = useAction(
    (reviewDate: string) =>
      apiClient.post(`/bills/occurrences/${row.id}/postpone`, { reviewDate }),
    onClose,
  );
  return (
    <Modal title="Postpone review" onClose={onClose} busy={action.isPending}>
      <p className="text-sm text-text-secondary">
        The original due date remains {row.dueDate}. Future recurrence dates
        stay anchored.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(new FormData(e.currentTarget).get("date") as string);
        }}
      >
        <label className="label">
          Review date
          <input
            className="field"
            name="date"
            type="date"
            defaultValue={row.reviewDate}
            required
          />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Postpone
        </button>
      </form>
    </Modal>
  );
}
