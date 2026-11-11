"use client";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource, useAction } from "@/hooks/useResource";
import { useAccounts } from "@/hooks/useDashboard";
import { apiClient } from "@/lib/api/client";
import { useFormat } from "@/lib/format";
import { dayIn } from "@/lib/calendar";
import { Account } from "@/lib/types";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
interface Loan {
  id: string;
  name: string;
  counterparty: string;
  direction: string;
  principal: number;
  repaid: number;
  outstanding: number;
  interestTotal: number;
  currency: string;
  startDate: string;
  firstDueDate: string | null;
  frequency: string;
  installmentCount: number;
  notes: string;
  archived: boolean;
  installments: {
    number: number;
    dueDate: string | null;
    amount: number;
    paid: number;
    remaining: number;
  }[];
}
interface Payment {
  id: string;
  principal: number;
  interest: number;
  dateTime: string;
  notes: string;
  reversedAt: string | null;
}
const cashAccounts = (accounts: Account[]) =>
  accounts.filter((a) =>
    ["CASH", "BANK_ACCOUNT", "PREPAID_CARD", "INVESTMENT"].includes(a.type),
  );
export default function Loans() {
  const { money, currency, timezone } = useFormat(),
    loans = useResource<Loan[]>("/loans"),
    accounts = useAccounts();
  const [edit, setEdit] = useState<Loan | null | undefined>(),
    [pay, setPay] = useState<Loan>(),
    [remove, setRemove] = useState<Loan>(),
    [showArchived, setArchived] = useState(false);
  const deletion = useAction(
    () => apiClient.delete(`/loans/${remove?.id}`),
    () => setRemove(undefined),
  );
  const total = (direction: string) =>
    loans.data
      ?.filter((l) => l.direction === direction)
      .reduce((n, l) => n + Number(l.outstanding), 0) ?? 0;
  return (
    <DashboardLayout>
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="eyebrow">Keep promises in view</p>
          <h1 className="text-3xl font-bold mt-2">Borrowing & lending</h1>
        </div>
        <button className="btn" onClick={() => setEdit(null)}>
          New loan
        </button>
      </header>
      <p className="text-sm text-text-secondary">
        Your private loans with people outside shared groups. Use this or a loan
        account for the same debt, to avoid counting it twice.
      </p>
      <ErrorMessage error={loans.error || accounts.error} />
      <div className="grid sm:grid-cols-2 gap-4">
        <article className="panel">
          <p className="text-sm text-text-secondary">
            Lent · principal to collect
          </p>
          <p className="text-3xl font-semibold text-positive mt-2">
            {loans.isLoading ? "…" : money(total("LENT"))}
          </p>
        </article>
        <article className="panel">
          <p className="text-sm text-text-secondary">
            Borrowed · principal to repay
          </p>
          <p className="text-3xl font-semibold mt-2">
            {loans.isLoading ? "…" : money(total("BORROWED"))}
          </p>
        </article>
      </div>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        Include archived
      </label>
      {loans.isLoading && <p>Loading loans…</p>}
      {loans.data &&
        !loans.data.filter((l) => showArchived || !l.archived).length && (
          <p className="panel">
            Track a loan’s principal, installment dates and interest here. No
            money is sent to anyone.
          </p>
        )}
      <div className="grid lg:grid-cols-2 gap-4">
        {loans.data
          ?.filter((l) => showArchived || !l.archived)
          .map((l) => (
            <article key={l.id} className="panel space-y-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="eyebrow">
                    {l.direction === "LENT" ? "Lent to" : "Borrowed from"}{" "}
                    {l.counterparty}
                  </p>
                  <h2 className="text-xl font-semibold mt-1">{l.name}</h2>
                </div>
                <strong className="text-xl">
                  {money(Number(l.outstanding))}
                </strong>
              </div>
              <p className="text-sm text-text-secondary">
                {money(Number(l.repaid))} of {money(Number(l.principal))}{" "}
                principal repaid · {money(Number(l.interestTotal))} interest{" "}
                {l.direction === "LENT" ? "received" : "paid"}
              </p>
              <progress
                className="w-full accent-brand-primary"
                aria-label={`${l.name} principal repaid`}
                max={Number(l.principal)}
                value={Number(l.repaid)}
              />
              {l.notes && (
                <p className="text-sm whitespace-pre-wrap">{l.notes}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-secondary"
                  disabled={l.archived}
                  onClick={() => setPay(l)}
                >
                  {l.direction === "LENT"
                    ? "Record collection"
                    : "Record payment"}
                </button>
                <button className="btn-secondary" onClick={() => setEdit(l)}>
                  Edit details
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    deletion.reset();
                    setRemove(l);
                  }}
                >
                  Delete
                </button>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-brand-primary">
                  Installment plan
                </summary>
                <div className="max-h-64 overflow-auto divide-y divide-border-soft">
                  {l.installments.map((i) => (
                    <div
                      key={i.number}
                      className="py-2 flex justify-between gap-3 text-sm"
                    >
                      <span>
                        #{i.number} · {i.dueDate ?? "No due date"}
                      </span>
                      <span>
                        {money(i.amount)} ·{" "}
                        {i.remaining
                          ? `${money(i.remaining)} remaining`
                          : "paid"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-text-secondary mt-2">
                  Principal is allocated to oldest installments first. Interest
                  is recorded separately.
                </p>
              </details>
              <PaymentHistory loan={l} />
            </article>
          ))}
      </div>
      {edit !== undefined && (
        <LoanForm
          loan={edit}
          accounts={accounts.data ?? []}
          today={dayIn(new Date().toISOString(), timezone)}
          currency={currency}
          onClose={() => setEdit(undefined)}
        />
      )}
      {pay && (
        <PaymentForm
          loan={pay}
          accounts={accounts.data ?? []}
          onClose={() => setPay(undefined)}
        />
      )}
      {remove && (
        <Confirm
          message={`Delete ${remove.name}? Loans with recorded cash activity must be repaid and archived instead.`}
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </DashboardLayout>
  );
}
function LoanForm({
  loan,
  accounts,
  currency,
  today,
  onClose,
}: {
  loan: Loan | null;
  accounts: Account[];
  currency: string;
  today: string;
  onClose: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    action = useAction(
      (body: unknown) =>
        loan
          ? apiClient.put(`/loans/${loan.id}`, body)
          : apiClient.post("/loans", body),
      onClose,
    );
  return (
    <Modal
      title={loan ? "Edit loan details" : "New private loan"}
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
            counterparty: f.get("counterparty"),
            firstDueDate: f.get("due") || null,
            frequency: f.get("frequency"),
            installmentCount: Number(f.get("count")),
            notes: f.get("notes"),
            archived: f.get("archived") === "on",
            ...(!loan
              ? {
                  direction: f.get("direction"),
                  principal: Number(f.get("principal")),
                  currency,
                  startDate: f.get("start"),
                  accountId: f.get("account") || null,
                  requestKey: key,
                }
              : {}),
          });
        }}
      >
        <label className="label">
          Loan name
          <input
            className="field"
            name="name"
            defaultValue={loan?.name}
            maxLength={120}
            required
          />
        </label>
        <label className="label">
          Person’s name
          <input
            className="field"
            name="counterparty"
            defaultValue={loan?.counterparty}
            maxLength={120}
            required
          />
        </label>
        {!loan && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="label">
                Direction
                <select className="field" name="direction">
                  <option value="LENT">I lent money</option>
                  <option value="BORROWED">I borrowed money</option>
                </select>
              </label>
              <label className="label">
                Principal ({currency})
                <input
                  className="field"
                  name="principal"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
            </div>
            <label className="label">
              Start date
              <input
                className="field"
                name="start"
                type="date"
                defaultValue={today}
                max={today}
                required
              />
            </label>
            <label className="label">
              Initial cash movement
              <select className="field" name="account">
                <option value="">
                  Already recorded elsewhere · no cash entry
                </option>
                {cashAccounts(accounts).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · record principal now
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-text-secondary">
              Choosing an account records cash received or paid on the start
              date. The principal becomes a private receivable or liability in
              net worth either way.
            </p>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            First due date
            <input
              className="field"
              name="due"
              type="date"
              defaultValue={loan?.firstDueDate ?? ""}
            />
          </label>
          <label className="label">
            Installments
            <input
              className="field"
              name="count"
              type="number"
              min="1"
              max="600"
              defaultValue={loan?.installmentCount ?? 1}
              required
            />
          </label>
        </div>
        <label className="label">
          Frequency
          <select
            className="field"
            name="frequency"
            defaultValue={loan?.frequency ?? "MONTHLY"}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </label>
        <label className="label">
          Notes
          <textarea
            className="field"
            name="notes"
            maxLength={2000}
            defaultValue={loan?.notes ?? ""}
          />
        </label>
        {loan && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={loan.archived}
            />
            Archive (principal must be fully repaid)
          </label>
        )}
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save loan
        </button>
      </form>
    </Modal>
  );
}
function PaymentForm({
  loan,
  accounts,
  onClose,
}: {
  loan: Loan;
  accounts: Account[];
  onClose: () => void;
}) {
  const [initialDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [key] = useState(() => crypto.randomUUID()),
    action = useAction(
      (body: unknown) => apiClient.post(`/loans/${loan.id}/payments`, body),
      onClose,
    );
  return (
    <Modal
      title={
        loan.direction === "LENT" ? "Record collection" : "Record repayment"
      }
      onClose={onClose}
      busy={action.isPending}
    >
      <p className="text-sm text-text-secondary">
        Record money already {loan.direction === "LENT" ? "received" : "paid"}.
        Principal reduces the debt; interest counts as{" "}
        {loan.direction === "LENT" ? "income" : "an expense"}. No payment is
        sent.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            principal: Number(f.get("principal")),
            interest: Number(f.get("interest")),
            accountId: f.get("account"),
            notes: f.get("notes"),
            dateTime: new Date(f.get("date") as string).toISOString(),
            requestKey: key,
          });
        }}
      >
        <label className="label">
          Account
          <select className="field" name="account" required>
            <option value="">Choose account</option>
            {cashAccounts(accounts).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Principal
            <input
              className="field"
              name="principal"
              type="number"
              min="0"
              max={loan.outstanding}
              step="0.01"
              defaultValue={loan.outstanding}
              required
            />
          </label>
          <label className="label">
            Interest
            <input
              className="field"
              name="interest"
              type="number"
              min="0"
              step="0.01"
              defaultValue={0}
              required
            />
          </label>
        </div>
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
          <textarea className="field" name="notes" maxLength={2000} />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Record payment
        </button>
      </form>
    </Modal>
  );
}
function PaymentHistory({ loan }: { loan: Loan }) {
  const [open, setOpen] = useState(false),
    [reverse, setReverse] = useState<Payment>(),
    data = useResource<Payment[]>(`/loans/${loan.id}/payments`, open),
    { money, date } = useFormat();
  const action = useAction(
    () => apiClient.post(`/loans/payments/${reverse?.id}/reverse`, {}),
    () => setReverse(undefined),
  );
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm text-brand-primary">
        Payment history
      </summary>
      <ErrorMessage error={data.error} />
      {data.isLoading && <p className="mt-2 text-sm">Loading history…</p>}
      {data.data?.length === 0 && (
        <p className="text-sm text-text-secondary mt-2">
          No payments recorded.
        </p>
      )}
      {data.data?.map((p) => (
        <div
          key={p.id}
          className="border-t border-border-soft py-3 mt-2 space-y-1"
        >
          <p className="text-sm">
            {date(p.dateTime)}
            {p.reversedAt && " · reversed"}
          </p>
          <p className="text-sm">
            {money(Number(p.principal))} principal + {money(Number(p.interest))}{" "}
            interest
          </p>
          {p.notes && <p className="text-xs text-text-secondary">{p.notes}</p>}
          {!p.reversedAt && (
            <button
              className="text-sm text-negative"
              onClick={() => {
                action.reset();
                setReverse(p);
              }}
            >
              Reverse record
            </button>
          )}
        </div>
      ))}
      {reverse && (
        <Modal
          title="Reverse payment record"
          onClose={() => setReverse(undefined)}
          busy={action.isPending}
        >
          <p>
            Undo the account entries and restore the principal owed? This does
            not cancel an external payment.
          </p>
          <ErrorMessage error={action.error} />
          <button
            className="btn"
            disabled={action.isPending}
            onClick={() => action.mutate(undefined)}
          >
            Reverse record
          </button>
        </Modal>
      )}
    </details>
  );
}
