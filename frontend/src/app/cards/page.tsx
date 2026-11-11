"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAccounts } from "@/hooks/useDashboard";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { useFormat } from "@/lib/format";
import { monthIn, dayIn } from "@/lib/calendar";
import { Account, Transaction } from "@/lib/types";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
interface Terms {
  accountId: string;
  creditLimit: number;
  statementDay: number;
  dueDay: number;
}
interface Plan {
  id: string;
  transactionId: string;
  name: string;
  firstDueDate: string;
  installmentCount: number;
  paidPrincipal: number;
  transaction: { amount: number };
  schedule: {
    number: number;
    dueDate: string;
    amount: number;
    remaining: number;
  }[];
}
export default function Cards() {
  const accounts = useAccounts(),
    terms = useResource<Terms[]>("/cards"),
    { money } = useFormat();
  const [selected, setSelected] = useState<string>();
  const cards = accounts.data?.filter((a) => a.type === "CREDIT_CARD") ?? [];
  return (
    <DashboardLayout>
      <header>
        <p className="eyebrow">Stay ahead of the statement</p>
        <h1 className="text-3xl font-bold mt-2">
          <T text="Credit cards" />
        </h1>
      </header>
      <ErrorMessage error={accounts.error || terms.error} />
      {accounts.isLoading && <p>Loading cards…</p>}
      {!accounts.isLoading && cards.length === 0 && (
        <p className="panel">
          Add a credit-card account under{" "}
          <Link href="/accounts" className="text-brand-primary">
            <T text="Accounts" />
          </Link>{" "}
          to configure its terms.
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((c) => {
          const t = terms.data?.find((t) => t.accountId === c.id);
          return (
            <article key={c.id} className="panel space-y-3">
              <h2 className="text-xl font-semibold">{c.name}</h2>
              <p className="text-3xl font-semibold">
                {money(Number(c.balance))}
              </p>
              <p className="text-sm text-text-secondary">
                Current card balance
              </p>
              {t && (
                <>
                  <p
                    className={
                      Number(c.balance) > Number(t.creditLimit)
                        ? "text-negative"
                        : "text-text-secondary"
                    }
                  >
                    {money(Number(t.creditLimit) - Number(c.balance))} available
                    · {money(Number(t.creditLimit))} limit
                  </p>
                  <p className="text-sm">
                    Statement day {t.statementDay} · payment day {t.dueDay}
                  </p>
                </>
              )}
              <button
                className="btn-secondary"
                onClick={() =>
                  setSelected(selected === c.id ? undefined : c.id)
                }
              >
                {selected === c.id
                  ? "Close details"
                  : "Terms, statements & plans"}
              </button>
            </article>
          );
        })}
      </div>
      {cards.find((c) => c.id === selected) && (
        <CardDetails
          key={selected}
          account={cards.find((c) => c.id === selected)!}
          terms={terms.data?.find((t) => t.accountId === selected)}
        />
      )}
      <p className="text-xs text-text-secondary">
        Record card payments as transfers from a cash/bank account to the card.
        No card issuer is connected. Statements reflect your recorded ledger,
        not an issuer’s official statement.
      </p>
    </DashboardLayout>
  );
}
function CardDetails({ account, terms }: { account: Account; terms?: Terms }) {
  const { money, currency, timezone } = useFormat(),
    [chosen, setMonth] = useState<string>(),
    month = chosen ?? monthIn(timezone),
    statement = useResource<{
      start: string;
      end: string;
      due: string;
      openingBalance: number;
      closingBalance: number;
      charges: number;
      credits: number;
      entries: { id: string; notes: string; balanceDelta: number }[];
    }>(`/cards/${account.id}/statement?month=${month}`, !!terms),
    plans = useResource<Plan[]>(`/cards/${account.id}/installments`);
  const [edit, setEdit] = useState<Plan | null | undefined>(),
    [remove, setRemove] = useState<Plan>();
  const save = useAction((body: unknown) =>
      apiClient.put(`/cards/${account.id}/settings`, body),
    ),
    deletion = useAction(
      () => apiClient.delete(`/cards/installments/${remove?.id}`),
      () => setRemove(undefined),
    );
  return (
    <section className="panel space-y-5">
      <h2 className="text-xl font-semibold">{account.name}</h2>
      <form
        key={account.id}
        className="grid sm:grid-cols-3 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate({
            creditLimit: Number(f.get("limit")),
            statementDay: Number(f.get("statement")),
            dueDay: Number(f.get("due")),
          });
        }}
      >
        <label className="label">
          Credit limit ({currency})
          <input
            className="field"
            name="limit"
            type="number"
            min="0"
            step="0.01"
            defaultValue={terms?.creditLimit ?? 0}
            required
          />
        </label>
        <label className="label">
          Statement day
          <input
            className="field"
            name="statement"
            type="number"
            min="1"
            max="31"
            defaultValue={terms?.statementDay ?? 1}
            required
          />
        </label>
        <label className="label">
          Payment day
          <input
            className="field"
            name="due"
            type="number"
            min="1"
            max="31"
            defaultValue={terms?.dueDay ?? 15}
            required
          />
        </label>
        <div className="sm:col-span-3">
          <button className="btn-secondary" disabled={save.isPending}>
            Save card terms
          </button>
          {save.isSuccess && (
            <span className="text-sm ml-3" role="status">
              Saved.
            </span>
          )}
        </div>
      </form>
      <ErrorMessage error={save.error || plans.error || statement.error} />
      {terms && (
        <>
          <label className="label">
            Statement month
            <input
              className="field max-w-xs"
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
          {statement.isLoading ? (
            <p>Loading statement…</p>
          ) : (
            statement.data && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  {statement.data.start} — {statement.data.end} · due{" "}
                  {statement.data.due}
                </p>
                <div className="grid sm:grid-cols-4 gap-3">
                  {[
                    ["Opening", statement.data.openingBalance],
                    ["Charges", statement.data.charges],
                    ["Payments / credits", statement.data.credits],
                    ["Closing", statement.data.closingBalance],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="bg-surface-secondary rounded-xl p-3"
                    >
                      <p className="text-xs text-text-secondary">{label}</p>
                      <p className="font-semibold mt-1">
                        {money(Number(value))}
                      </p>
                    </div>
                  ))}
                </div>
                <details>
                  <summary className="text-sm text-brand-primary cursor-pointer">
                    Statement entries ({statement.data.entries.length})
                  </summary>
                  {statement.data.entries.map((t) => (
                    <div
                      key={t.id}
                      className="flex justify-between gap-3 border-t border-border-soft mt-2 py-2 text-sm"
                    >
                      <span>{t.notes || "Entry"}</span>
                      <span>{money(Number(t.balanceDelta))}</span>
                    </div>
                  ))}
                </details>
              </div>
            )
          )}
        </>
      )}
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">Installment plans</h3>
        <button className="btn-secondary" onClick={() => setEdit(null)}>
          Plan a purchase
        </button>
      </div>
      <p className="text-xs text-text-secondary">
        These plans divide an already recorded card purchase into principal
        installments. Paid principal is your manual reconciliation marker.
        Record actual repayments separately as account transfers. Plans never
        create another expense or assume interest.
      </p>
      {plans.isLoading && <p>Loading plans…</p>}
      {plans.data?.length === 0 && (
        <p className="text-sm text-text-secondary">No installment plans.</p>
      )}
      {plans.data?.map((p) => (
        <article
          key={p.id}
          className="rounded-xl bg-surface-secondary p-4 space-y-3"
        >
          <div className="flex justify-between gap-3">
            <h4 className="font-semibold">{p.name}</h4>
            <span>{money(Number(p.transaction.amount))}</span>
          </div>
          <p className="text-sm">
            {money(Number(p.paidPrincipal))} marked paid · {p.installmentCount}{" "}
            installments
          </p>
          <details>
            <summary className="cursor-pointer text-sm text-brand-primary">
              Payment dates
            </summary>
            <div className="max-h-52 overflow-auto">
              {p.schedule.map((s) => (
                <div
                  key={s.number}
                  className="py-2 flex justify-between gap-3 text-sm"
                >
                  <span>
                    #{s.number} · {s.dueDate}
                  </span>
                  <span>
                    {money(s.amount)} · {money(s.remaining)} left
                  </span>
                </div>
              ))}
            </div>
          </details>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setEdit(p)}>
              Edit / reconcile
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                deletion.reset();
                setRemove(p);
              }}
            >
              Remove plan
            </button>
          </div>
        </article>
      ))}
      {edit !== undefined && (
        <PlanForm
          account={account}
          plan={edit}
          today={dayIn(new Date().toISOString(), timezone)}
          onClose={() => setEdit(undefined)}
        />
      )}
      {remove && (
        <Confirm
          message="Remove this installment plan? The original purchase and card balance stay unchanged."
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </section>
  );
}
function PlanForm({
  account,
  plan,
  today,
  onClose,
}: {
  account: Account;
  plan: Plan | null;
  today: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState(""),
    rows = useResource<{ items: Transaction[] }>(
      `/transactions/page?type=EXPENSE&accountId=${account.id}&q=${encodeURIComponent(q)}&limit=100`,
      !plan,
    ),
    { money } = useFormat(),
    action = useAction(
      (body: unknown) =>
        plan
          ? apiClient.put(`/cards/installments/${plan.id}`, body)
          : apiClient.post(`/cards/${account.id}/installments`, body),
      onClose,
    );
  return (
    <Modal
      title={plan ? "Reconcile installment plan" : "Plan card installments"}
      onClose={onClose}
      busy={action.isPending}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            transactionId: plan?.transactionId ?? f.get("transaction"),
            name: f.get("name"),
            firstDueDate: f.get("date"),
            installmentCount: Number(f.get("count")),
            paidPrincipal: Number(f.get("paid")),
          });
        }}
      >
        {!plan && (
          <>
            <label className="label">
              Find a purchase
              <input
                className="field"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label className="label">
              Recorded purchase
              <select className="field" name="transaction" required>
                <option value="">Choose purchase (latest 100 matches)</option>
                {rows.data?.items
                  .filter((t) => Number(t.balanceDelta) > 0)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.notes || "Purchase"} · {money(Number(t.amount))}
                    </option>
                  ))}
              </select>
            </label>
            <ErrorMessage error={rows.error} />
          </>
        )}
        <label className="label">
          Plan name
          <input
            className="field"
            name="name"
            defaultValue={plan?.name}
            maxLength={120}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            First due date
            <input
              className="field"
              name="date"
              type="date"
              defaultValue={plan?.firstDueDate ?? today}
              required
            />
          </label>
          <label className="label">
            Monthly installments
            <input
              className="field"
              name="count"
              type="number"
              min="1"
              max="600"
              defaultValue={plan?.installmentCount ?? 3}
              required
            />
          </label>
        </div>
        <label className="label">
          Principal already repaid
          <input
            className="field"
            name="paid"
            type="number"
            min="0"
            step="0.01"
            max={plan?.transaction.amount}
            defaultValue={plan?.paidPrincipal ?? 0}
            required
          />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save plan
        </button>
      </form>
    </Modal>
  );
}
