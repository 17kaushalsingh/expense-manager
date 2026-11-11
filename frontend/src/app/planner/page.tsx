"use client";
import { T } from "@/components/i18n/Language";
import Link from "next/link";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Modal, ErrorMessage, Confirm } from "@/components/ui/Controls";
import { useResource, useAction } from "@/hooks/useResource";
import { useFormat } from "@/lib/format";
import { dayIn } from "@/lib/calendar";
import { apiClient } from "@/lib/api/client";
import { Category } from "@/lib/types";
interface BudgetPlan {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  amount: number;
  effectiveAmount: number;
  currency: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  archived: boolean;
  alertsEnabled: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  spent: number;
  elapsedFraction: number;
  overrideId: string | null;
}
interface Monthly {
  plan: {
    id: string;
    expectedIncome: number;
    expectedExpense: number;
    targetSavingRate: number;
  } | null;
  periodStart: string;
  periodEnd: string;
  income: number;
  expense: number;
  saving: number;
  savingRate: number | null;
}
const frequencies = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
  "CUSTOM",
];
export default function Planner() {
  const { money, currency, timezone } = useFormat();
  const [selected, setSelected] = useState<string>();
  const date = selected ?? dayIn(new Date().toISOString(), timezone),
    month = date.slice(0, 7);
  const budgets = useResource<BudgetPlan[]>(
      `/personal-planning/budget-plans?date=${date}`,
    ),
    prefs = useResource<{ payDay: number }>("/personal-planning/preferences"),
    monthly = useResource<Monthly>(
      `/personal-planning/monthly-plan?month=${month}-01`,
    ),
    cats = useResource<Category[]>("/categories");
  const [edit, setEdit] = useState<BudgetPlan | null | undefined>(),
    [override, setOverride] = useState<BudgetPlan>(),
    [remove, setRemove] = useState<BudgetPlan>(),
    [showArchived, setShowArchived] = useState(false);
  const deletion = useAction(
    () => apiClient.delete(`/personal-planning/budget-plans/${remove?.id}`),
    () => setRemove(undefined),
  );
  const preference = useAction((payDay: number) =>
    apiClient.put("/personal-planning/preferences", { payDay }),
  );
  const action = useAction((body: unknown) =>
    apiClient.put("/personal-planning/monthly-plan", body),
  );
  const archive = useAction((p: BudgetPlan) =>
    apiClient.put(`/personal-planning/budget-plans/${p.id}`, {
      name: p.name,
      categoryId: p.categoryId,
      amount: Number(p.amount),
      currency: p.currency,
      frequency: p.frequency,
      startDate: p.startDate,
      endDate: p.endDate,
      archived: !p.archived,
      alertsEnabled: p.alertsEnabled,
    }),
  );
  const reset = useAction((id: string) =>
    apiClient.delete(`/personal-planning/budget-overrides/${id}`),
  );
  return (
    <DashboardLayout>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Give every month a direction</p>
          <h1 className="text-3xl font-bold mt-2">Your plan</h1>
        </div>
        <button className="btn" onClick={() => setEdit(null)}>
          New budget plan
        </button>
      </header>
      <div className="flex flex-wrap gap-4 items-end">
        <label className="label">
          Review date
          <input
            type="date"
            className="field"
            value={date}
            onChange={(e) => e.target.value && setSelected(e.target.value)}
          />
        </label>
        <label className="label">
          Payday
          <select
            className="field"
            value={prefs.data?.payDay ?? 1}
            disabled={preference.isPending || prefs.isLoading}
            onChange={(e) => preference.mutate(Number(e.target.value))}
          >
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <Link href="/budgets" className="text-brand-primary text-sm pb-3">
          Legacy monthly limits →
        </Link>
      </div>
      <ErrorMessage
        error={
          budgets.error ||
          prefs.error ||
          monthly.error ||
          cats.error ||
          preference.error ||
          archive.error ||
          reset.error
        }
      />
      <section className="panel space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Plan vs reality · {month}</h2>
          <p className="text-sm text-text-secondary">
            {monthly.data?.periodStart} — {monthly.data?.periodEnd} · {timezone}
            . Payday 29–31 clamps in short months.
          </p>
        </div>
        {monthly.isLoading ? (
          <p>Loading your month…</p>
        ) : (
          monthly.data && (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  [
                    "Income",
                    monthly.data.income,
                    monthly.data.plan?.expectedIncome,
                  ],
                  [
                    "Expenses",
                    monthly.data.expense,
                    monthly.data.plan?.expectedExpense,
                  ],
                  [
                    "Saved",
                    monthly.data.saving,
                    monthly.data.plan
                      ? Number(monthly.data.plan.expectedIncome) -
                        Number(monthly.data.plan.expectedExpense)
                      : undefined,
                  ],
                ].map(([name, actual, planned]) => (
                  <div
                    key={name}
                    className="rounded-xl bg-surface-secondary p-4"
                  >
                    <p className="text-sm text-text-secondary">{name}</p>
                    <p className="text-2xl font-semibold mt-1">
                      {money(Number(actual))}
                    </p>
                    <p className="text-xs text-text-secondary mt-2">
                      {planned === undefined
                        ? "No plan set"
                        : `${money(Number(planned))} planned`}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                Savings rate:{" "}
                {monthly.data.savingRate === null
                  ? "Available after income is recorded"
                  : `${Number(monthly.data.savingRate).toFixed(1)}%`}
                {monthly.data.plan &&
                  ` · target ${monthly.data.plan.targetSavingRate}%`}
              </p>
              <form
                key={`${month}-${monthly.data.plan?.id ?? "new"}`}
                className="grid sm:grid-cols-3 gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  action.mutate({
                    month: `${month}-01`,
                    expectedIncome: Number(f.get("income")),
                    expectedExpense: Number(f.get("expense")),
                    targetSavingRate: Number(f.get("rate")),
                    currency,
                  });
                }}
              >
                <label className="label">
                  Planned income ({currency})
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="0.01"
                    name="income"
                    required
                    defaultValue={monthly.data.plan?.expectedIncome ?? ""}
                  />
                </label>
                <label className="label">
                  Planned expenses ({currency})
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="0.01"
                    name="expense"
                    required
                    defaultValue={monthly.data.plan?.expectedExpense ?? ""}
                  />
                </label>
                <label className="label">
                  Savings target (%)
                  <input
                    className="field"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    name="rate"
                    defaultValue={monthly.data.plan?.targetSavingRate ?? 20}
                    required
                  />
                </label>
                <ErrorMessage error={action.error} />
                <div className="sm:col-span-3">
                  <button className="btn-secondary" disabled={action.isPending}>
                    Save monthly plan
                  </button>
                  {action.isSuccess && (
                    <span className="text-sm ml-3" role="status">
                      Plan saved.
                    </span>
                  )}
                </div>
              </form>
            </>
          )
        )}
      </section>
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl font-semibold">Budget plans</h2>
        <label className="flex gap-2 items-center text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Include archived
        </label>
      </div>
      {budgets.isLoading && <p>Loading budgets…</p>}
      {budgets.data &&
        !budgets.data.filter((b) => showArchived || !b.archived).length && (
          <p className="panel text-text-secondary">
            Create a daily, weekly, fortnightly, monthly, quarterly, annual, or
            custom budget. Each plan repeats from its original start date.
          </p>
        )}
      <div className="grid lg:grid-cols-2 gap-4">
        {budgets.data
          ?.filter((b) => showArchived || !b.archived)
          .map((b) => {
            const ratio = Number(b.spent) / Number(b.effectiveAmount),
              pace = Number(b.effectiveAmount) * Number(b.elapsedFraction);
            return (
              <article className="panel space-y-3" key={b.id}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="eyebrow">
                      {b.frequency.toLowerCase()}
                      {b.archived ? " · archived" : ""}
                    </p>
                    <h3 className="text-xl font-semibold mt-1">{b.name}</h3>
                    <p className="text-sm text-text-secondary">
                      {b.categoryName}
                    </p>
                  </div>
                  <strong
                    className={ratio >= 1 ? "text-negative" : "text-positive"}
                  >
                    {money(Number(b.effectiveAmount) - Number(b.spent))} left
                  </strong>
                </div>
                {b.periodStart ? (
                  <>
                    <p className="text-sm text-text-secondary">
                      {b.periodStart} — {b.periodEnd}
                    </p>
                    <p>
                      {money(Number(b.spent))} /{" "}
                      {money(Number(b.effectiveAmount))}
                      {b.overrideId ? " · period override" : ""}
                    </p>
                    <progress
                      className="w-full accent-brand-primary"
                      aria-label={`${b.name} spending`}
                      max={Number(b.effectiveAmount)}
                      value={Math.min(
                        Number(b.spent),
                        Number(b.effectiveAmount),
                      )}
                    />
                    <p className="text-sm text-text-secondary">
                      Pace allowance: {money(pace)} ·{" "}
                      {Math.round(Number(b.elapsedFraction) * 100)}% of period
                      elapsed
                    </p>
                    {b.alertsEnabled && ratio >= 0.8 && (
                      <p
                        role="status"
                        className={
                          ratio >= 1 ? "text-negative" : "text-text-secondary"
                        }
                      >
                        {ratio >= 1 ? "Limit reached" : "80% threshold reached"}{" "}
                        · {Math.round(ratio * 100)}% used
                      </p>
                    )}
                    <button
                      className="btn-secondary"
                      onClick={() => setOverride(b)}
                    >
                      Adjust this period
                    </button>
                    {b.overrideId && (
                      <button
                        className="btn-secondary ml-2"
                        disabled={reset.isPending}
                        onClick={() => reset.mutate(b.overrideId!)}
                      >
                        Use plan amount
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-text-secondary">
                    Outside this plan’s dates.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => setEdit(b)}>
                    <T text="Edit" />
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={archive.isPending}
                    onClick={() => archive.mutate(b)}
                  >
                    {b.archived ? "Unarchive" : "Archive"}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      deletion.reset();
                      setRemove(b);
                    }}
                  >
                    <T text="Delete" />
                  </button>
                </div>
              </article>
            );
          })}
      </div>
      <p className="text-xs text-text-secondary">
        Budgets may overlap; their limits are not added. Only personal income
        and expenses count. Plans and targets never move money.
      </p>
      {edit !== undefined && (
        <PlanForm
          plan={edit}
          date={date}
          currency={currency}
          categories={cats.data ?? []}
          onClose={() => setEdit(undefined)}
        />
      )}
      {override && (
        <OverrideForm plan={override} onClose={() => setOverride(undefined)} />
      )}
      {remove && (
        <Confirm
          message="Delete this budget plan and its overrides? Transactions stay unchanged."
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </DashboardLayout>
  );
}
function PlanForm({
  plan,
  date,
  currency,
  categories,
  onClose,
}: {
  plan: BudgetPlan | null;
  date: string;
  currency: string;
  categories: Category[];
  onClose: () => void;
}) {
  const [frequency, setFrequency] = useState(plan?.frequency ?? "MONTHLY");
  const action = useAction(
    (body: unknown) =>
      plan
        ? apiClient.put(`/personal-planning/budget-plans/${plan.id}`, body)
        : apiClient.post("/personal-planning/budget-plans", body),
    onClose,
  );
  return (
    <Modal
      title={plan ? "Edit budget plan" : "New budget plan"}
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
            currency,
            categoryId: f.get("category") || null,
            frequency,
            startDate: f.get("start"),
            endDate: f.get("end") || null,
            archived: plan?.archived ?? false,
            alertsEnabled: f.get("alerts") === "on",
          });
        }}
      >
        <label className="label">
          <T text="Name" />
          <input
            name="name"
            className="field"
            maxLength={120}
            defaultValue={plan?.name}
            required
          />
        </label>
        <label className="label">
          <T text="Category" />
          <select
            className="field"
            name="category"
            defaultValue={plan?.categoryId ?? ""}
          >
            <option value="">All expenses</option>
            {categories
              .filter((c) => c.type === "EXPENSE")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">
            Amount ({currency})
            <input
              name="amount"
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={plan?.amount}
              required
            />
          </label>
          <label className="label">
            Period
            <select
              className="field"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              {frequencies.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="label">
            Starts
            <input
              name="start"
              className="field"
              type="date"
              defaultValue={plan?.startDate ?? date}
              required
            />
          </label>
          <label className="label">
            Ends{frequency !== "CUSTOM" && " (optional)"}
            <input
              name="end"
              className="field"
              type="date"
              defaultValue={plan?.endDate ?? ""}
              required={frequency === "CUSTOM"}
            />
          </label>
        </div>
        <label className="flex gap-2 text-sm">
          <input
            name="alerts"
            type="checkbox"
            defaultChecked={plan?.alertsEnabled ?? true}
          />
          Show 80% and 100% in-app warnings
        </label>
        <p className="text-xs text-text-secondary">
          Existing period overrides must be removed before changing schedule
          dates.
        </p>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save plan
        </button>
      </form>
    </Modal>
  );
}
function OverrideForm({
  plan,
  onClose,
}: {
  plan: BudgetPlan;
  onClose: () => void;
}) {
  const action = useAction(
    (amount: number) =>
      apiClient.put(`/personal-planning/budget-plans/${plan.id}/override`, {
        periodStart: plan.periodStart,
        amount,
      }),
    onClose,
  );
  return (
    <Modal title="Adjust this period" onClose={onClose} busy={action.isPending}>
      <p>
        {plan.periodStart} — {plan.periodEnd}. Future periods keep the plan
        amount.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(Number(new FormData(e.currentTarget).get("amount")));
        }}
      >
        <label className="label">
          Period limit ({plan.currency})
          <input
            name="amount"
            type="number"
            className="field"
            min="0.01"
            step="0.01"
            defaultValue={plan.effectiveAmount}
            required
          />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save override
        </button>
      </form>
    </Modal>
  );
}
