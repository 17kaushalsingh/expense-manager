"use client";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource, useAction } from "@/hooks/useResource";
import { useAccounts } from "@/hooks/useDashboard";
import { useFormat } from "@/lib/format";
import { dayIn } from "@/lib/calendar";
import { apiClient } from "@/lib/api/client";
import { Account, Category, Transaction } from "@/lib/types";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
interface FinanceEvent {
  id: string;
  name: string;
  kind: string;
  startDate: string;
  endDate: string;
  amount: number;
  currency: string;
  notes: string;
  archived: boolean;
  spent: number;
  planned: number;
}
interface Cost {
  id: string;
  name: string;
  amount: number;
  categoryId: string | null;
  isCompleted: boolean;
  recordedTransactionId: string | null;
}
export default function Events() {
  const { money, currency, timezone } = useFormat(),
    events = useResource<FinanceEvent[]>("/wealth/events");
  const [edit, setEdit] = useState<FinanceEvent | null | undefined>(),
    [remove, setRemove] = useState<FinanceEvent>(),
    [selectedId, setSelected] = useState<string>(),
    [archived, setArchived] = useState(false);
  const deletion = useAction(
    () => apiClient.delete(`/wealth/events/${remove?.id}`),
    () => setRemove(undefined),
  );
  const selected = events.data?.find((e) => e.id === selectedId),
    today = dayIn(new Date().toISOString(), timezone);
  return (
    <DashboardLayout>
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="eyebrow">Plan for the moments that matter</p>
          <h1 className="text-3xl font-bold mt-2">Trips & events</h1>
        </div>
        <button className="btn" onClick={() => setEdit(null)}>
          New event
        </button>
      </header>
      <label className="flex gap-2 items-center text-sm">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        Include archived
      </label>
      <ErrorMessage error={events.error} />
      {events.isLoading && <p>Loading events…</p>}
      {events.data &&
        !events.data.filter((e) => archived || !e.archived).length && (
          <p className="panel">
            Plan a trip, wedding or project. Link your own expenses to track the
            real cost.
          </p>
        )}
      <div className="grid lg:grid-cols-2 gap-4">
        {events.data
          ?.filter((e) => archived || !e.archived)
          .map((e) => {
            const days =
                Math.round(
                  (Date.parse(e.endDate) - Date.parse(e.startDate)) / 86400000,
                ) + 1,
              remainingDays = Math.max(
                0,
                Math.round(
                  (Date.parse(e.endDate) -
                    Date.parse(today > e.startDate ? today : e.startDate)) /
                    86400000,
                ) + 1,
              );
            return (
              <article key={e.id} className="panel space-y-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="eyebrow">
                      {e.kind.toLowerCase()}
                      {e.archived && " · archived"}
                    </p>
                    <h2 className="text-xl font-semibold mt-1">{e.name}</h2>
                  </div>
                  <span className="text-sm text-text-secondary">
                    {days} days
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  {e.startDate} — {e.endDate}
                </p>
                <div className="flex justify-between gap-3">
                  <p>{money(Number(e.spent))} spent</p>
                  <strong
                    className={
                      Number(e.spent) > Number(e.amount)
                        ? "text-negative"
                        : "text-positive"
                    }
                  >
                    {money(Number(e.amount) - Number(e.spent))} left
                  </strong>
                </div>
                <progress
                  className="w-full accent-brand-primary"
                  aria-label={`${e.name} budget`}
                  value={Math.min(Number(e.amount), Number(e.spent))}
                  max={Number(e.amount)}
                />
                <p className="text-sm text-text-secondary">
                  {money(Number(e.amount))} budget · {money(Number(e.planned))}{" "}
                  planned costs
                </p>
                <p className="text-sm">
                  {remainingDays
                    ? `${money(Math.max(0, Number(e.amount) - Number(e.spent)) / remainingDays)} per remaining day`
                    : `Event ended · ${money(Number(e.spent) / days)} spent per day`}
                </p>
                {e.notes && (
                  <p className="text-sm whitespace-pre-wrap">{e.notes}</p>
                )}
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      setSelected(selectedId === e.id ? undefined : e.id)
                    }
                  >
                    {selectedId === e.id ? "Close details" : "Costs & expenses"}
                  </button>
                  <button className="btn-secondary" onClick={() => setEdit(e)}>
                    Edit
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      deletion.reset();
                      setRemove(e);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
      </div>
      {selected && <EventDetails key={selected.id} event={selected} />}
      <p className="text-xs text-text-secondary">
        Only linked personal expense amounts count. Planned costs and checkmarks
        never change balances. An expense belongs to one event. Deleting an
        event leaves its transactions intact.
      </p>
      {edit !== undefined && (
        <EventForm
          event={edit}
          today={today}
          currency={currency}
          onClose={() => setEdit(undefined)}
        />
      )}
      {remove && (
        <Confirm
          message={`Delete ${remove.name} and its plan? Recorded transactions remain in your history.`}
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </DashboardLayout>
  );
}
function EventDetails({ event }: { event: FinanceEvent }) {
  const { money } = useFormat(),
    costs = useResource<Cost[]>(`/wealth/events/${event.id}/costs`),
    accounts = useAccounts(),
    categories = useResource<Category[]>("/categories");
  const links = useResource<
    {
      id: string;
      transaction: {
        id: string;
        notes: string;
        dateTime: string;
        analyticsAmount: number;
      };
    }[]
  >(`/wealth/events/${event.id}/transactions`);
  const [edit, setEdit] = useState<Cost | null | undefined>(),
    [record, setRecord] = useState<Cost>(),
    [remove, setRemove] = useState<Cost>(),
    [link, setLink] = useState(false);
  const toggle = useAction((c: Cost) =>
      apiClient.put(`/wealth/costs/${c.id}`, {
        name: c.name,
        amount: Number(c.amount),
        categoryId: c.categoryId,
        isCompleted: !c.isCompleted,
      }),
    ),
    deletion = useAction(
      () => apiClient.delete(`/wealth/costs/${remove?.id}`),
      () => setRemove(undefined),
    ),
    unlink = useAction((id: string) =>
      apiClient.delete(`/wealth/event-transactions/${id}`),
    );
  return (
    <section className="panel space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl font-semibold">{event.name} · details</h2>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEdit(null)}>
            Plan a cost
          </button>
          <button className="btn-secondary" onClick={() => setLink(true)}>
            Link expense
          </button>
        </div>
      </header>
      <ErrorMessage
        error={
          costs.error ||
          links.error ||
          accounts.error ||
          categories.error ||
          toggle.error ||
          unlink.error
        }
      />
      <h3 className="font-semibold">Planned costs</h3>
      {costs.isLoading && <p>Loading costs…</p>}
      {costs.data?.length === 0 && (
        <p className="text-text-secondary text-sm">
          Add the costs you expect, then check off or record each one.
        </p>
      )}
      <div className="divide-y divide-border-soft">
        {costs.data?.map((c) => (
          <div className="py-4 space-y-2" key={c.id}>
            <div className="flex justify-between gap-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={c.isCompleted}
                  disabled={toggle.isPending}
                  onChange={() => toggle.mutate(c)}
                />
                <span>{c.name}</span>
              </label>
              <strong>{money(Number(c.amount))}</strong>
            </div>
            <div className="flex flex-wrap gap-2 pl-6">
              {c.recordedTransactionId ? (
                <span className="text-positive text-sm">Expense recorded</span>
              ) : (
                <button
                  className="text-sm text-brand-primary"
                  onClick={() => setRecord(c)}
                >
                  Record expense
                </button>
              )}
              <button
                className="text-sm text-text-secondary"
                onClick={() => setEdit(c)}
              >
                Edit plan
              </button>
              <button
                className="text-sm text-text-secondary"
                onClick={() => {
                  deletion.reset();
                  setRemove(c);
                }}
              >
                Remove plan
              </button>
            </div>
          </div>
        ))}
      </div>
      <h3 className="font-semibold">Linked expenses</h3>
      {links.isLoading && <p>Loading expenses…</p>}
      {links.data?.length === 0 && (
        <p className="text-sm text-text-secondary">No expenses linked yet.</p>
      )}
      {links.data?.map((l) => (
        <div
          key={l.id}
          className="flex gap-3 justify-between border-t border-border-soft pt-3"
        >
          <div>
            <p>{l.transaction.notes || "Expense"}</p>
            <p className="text-sm text-text-secondary">
              {money(Number(l.transaction.analyticsAmount))} · personal share
            </p>
          </div>
          <button
            className="text-sm text-text-secondary"
            disabled={unlink.isPending}
            onClick={() => unlink.mutate(l.id)}
          >
            Unlink
          </button>
        </div>
      ))}
      {edit !== undefined && (
        <CostForm
          cost={edit}
          event={event}
          categories={categories.data ?? []}
          onClose={() => setEdit(undefined)}
        />
      )}
      {record && (
        <RecordCost
          cost={record}
          accounts={accounts.data ?? []}
          onClose={() => setRecord(undefined)}
        />
      )}
      {link && (
        <LinkExpense eventId={event.id} onClose={() => setLink(false)} />
      )}
      {remove && (
        <Confirm
          message="Remove this planned cost? Recorded expenses stay linked."
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </section>
  );
}
function EventForm({
  event,
  currency,
  today,
  onClose,
}: {
  event: FinanceEvent | null;
  currency: string;
  today: string;
  onClose: () => void;
}) {
  const action = useAction(
    (body: unknown) =>
      event
        ? apiClient.put(`/wealth/events/${event.id}`, body)
        : apiClient.post("/wealth/events", body),
    onClose,
  );
  return (
    <Modal
      title={event ? "Edit event" : "New event"}
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
            kind: f.get("kind"),
            amount: Number(f.get("amount")),
            startDate: f.get("start"),
            endDate: f.get("end"),
            notes: f.get("notes"),
            currency,
            archived: f.get("archived") === "on",
          });
        }}
      >
        <label className="label">
          Name
          <input
            className="field"
            name="name"
            maxLength={120}
            defaultValue={event?.name}
            required
          />
        </label>
        <label className="label">
          Kind
          <select
            className="field"
            name="kind"
            defaultValue={event?.kind ?? "TRIP"}
          >
            {["TRIP", "WEDDING", "PROJECT", "OTHER"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Starts
            <input
              className="field"
              type="date"
              name="start"
              defaultValue={event?.startDate ?? today}
              required
            />
          </label>
          <label className="label">
            Ends
            <input
              className="field"
              type="date"
              name="end"
              defaultValue={event?.endDate ?? today}
              required
            />
          </label>
        </div>
        <label className="label">
          Budget ({currency})
          <input
            className="field"
            type="number"
            min="0.01"
            step="0.01"
            name="amount"
            defaultValue={event?.amount}
            required
          />
        </label>
        <label className="label">
          Notes
          <textarea
            className="field"
            name="notes"
            maxLength={2000}
            defaultValue={event?.notes ?? ""}
          />
        </label>
        {event && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={event.archived}
            />
            Archived
          </label>
        )}
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save event
        </button>
      </form>
    </Modal>
  );
}
function CostForm({
  cost,
  event,
  categories,
  onClose,
}: {
  cost: Cost | null;
  event: FinanceEvent;
  categories: Category[];
  onClose: () => void;
}) {
  const action = useAction(
    (body: unknown) =>
      cost
        ? apiClient.put(`/wealth/costs/${cost.id}`, body)
        : apiClient.post(`/wealth/events/${event.id}/costs`, body),
    onClose,
  );
  return (
    <Modal
      title={cost ? "Edit planned cost" : "Plan a cost"}
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
            amount: Number(f.get("amount")),
            categoryId: f.get("category") || null,
            isCompleted: cost?.isCompleted ?? false,
          });
        }}
      >
        <label className="label">
          Cost name
          <input
            className="field"
            name="name"
            defaultValue={cost?.name}
            maxLength={120}
            required
          />
        </label>
        <label className="label">
          Estimate ({event.currency})
          <input
            className="field"
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            defaultValue={cost?.amount}
            required
          />
        </label>
        <label className="label">
          Category for recording
          <select
            className="field"
            name="category"
            defaultValue={cost?.categoryId ?? ""}
          >
            <option value="">Uncategorized</option>
            {categories
              .filter((c) => c.type === "EXPENSE")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save planned cost
        </button>
      </form>
    </Modal>
  );
}
function RecordCost({
  cost,
  accounts,
  onClose,
}: {
  cost: Cost;
  accounts: Account[];
  onClose: () => void;
}) {
  const action = useAction(
    (body: unknown) => apiClient.post(`/wealth/costs/${cost.id}/record`, body),
    onClose,
  );
  return (
    <Modal
      title={`Record · ${cost.name}`}
      onClose={onClose}
      busy={action.isPending}
    >
      <p className="text-sm text-text-secondary">
        This records a real expense now and changes the chosen account balance.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            accountId: f.get("account"),
            amount: Number(f.get("amount")),
            dateTime: new Date().toISOString(),
          });
        }}
      >
        <label className="label">
          Account
          <select className="field" name="account" required>
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
            defaultValue={cost.amount}
            required
          />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Record expense
        </button>
      </form>
    </Modal>
  );
}
function LinkExpense({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const rows = useResource<{ items: Transaction[] }>(
      `/transactions/page?type=EXPENSE&limit=100&q=${encodeURIComponent(q)}`,
    ),
    { money, date } = useFormat();
  const action = useAction(
    (transactionId: string) =>
      apiClient.post(`/wealth/events/${eventId}/transactions`, {
        transactionId,
      }),
    onClose,
  );
  return (
    <Modal
      title="Link an existing expense"
      onClose={onClose}
      busy={action.isPending}
    >
      <label className="label">
        Search notes
        <input
          className="field"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <ErrorMessage error={rows.error || action.error} />
      <p className="text-xs text-text-secondary">
        Most recent 100 matches. Search to narrow the list. Each expense can
        belong to one event.
      </p>
      {rows.isLoading && <p>Loading expenses…</p>}
      {rows.data?.items
        .filter((t) => Number(t.analyticsAmount) > 0)
        .map((t) => (
          <button
            className="w-full text-left border-t border-border-soft py-3"
            key={t.id}
            disabled={action.isPending}
            onClick={() => action.mutate(t.id)}
          >
            <span className="block font-medium">
              {t.notes || "Expense"} · {money(Number(t.analyticsAmount))}
            </span>
            <span className="text-xs text-text-secondary">
              {date(t.dateTime)}
            </span>
          </button>
        ))}
    </Modal>
  );
}
