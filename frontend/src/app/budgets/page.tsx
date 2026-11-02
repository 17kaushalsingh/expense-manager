"use client";
import { monthIn } from "@/lib/calendar";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { useFormat } from "@/lib/format";
import { Category } from "@/lib/types";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
interface Budget {
  id: string;
  categoryId: string | null;
  categoryName: string;
  month: string;
  amount: number;
  spent: number;
  currency: string;
}
export default function Budgets() {
  const { money, currency, timezone } = useFormat();
  const [selectedMonth, setMonth] = useState<string>();
  const month = selectedMonth ?? monthIn(timezone);
  const data = useResource<Budget[]>(`/planning/budgets?month=${month}`),
    categories = useResource<Category[]>("/categories");
  const [editing, setEditing] = useState<Budget | null | undefined>(),
    [remove, setRemove] = useState<Budget>();
  const deletion = useAction(
    () => apiClient.delete(`/planning/budgets/${remove?.id}`),
    () => setRemove(undefined),
  );
  const copy = useAction(() =>
    apiClient.post<{ copied: number }>("/planning/budgets/copy", {
      month: `${month}-01`,
    }),
  );
  return (
    <DashboardLayout>
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monthly budgets</h1>
          <p className="text-sm text-text-secondary">
            Your personal share of spending, using {timezone}.
          </p>
        </div>
        <button className="btn" onClick={() => setEditing(null)}>
          Add budget
        </button>
      </header>
      <div className="flex gap-3 flex-wrap items-end">
        <label className="label">
          Month
          <input
            className="field"
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
        <button
          className="btn-secondary"
          disabled={copy.isPending || data.isLoading}
          onClick={() => copy.mutate(undefined)}
        >
          Copy previous month
        </button>
      </div>
      <ErrorMessage error={data.error || categories.error || copy.error} />
      {copy.isSuccess && (
        <p role="status">Previous month checked; missing budgets copied.</p>
      )}
      {data.isLoading && <p>Loading budgets…</p>}
      {data.data?.length === 0 && (
        <p className="panel">
          No budgets for this month. Set an overall limit or add category
          budgets.
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {data.data?.map((b) => {
          const spent = Number(b.spent),
            amount = Number(b.amount),
            remaining = amount - spent;
          return (
            <article className="panel space-y-3" key={b.id}>
              <div className="flex justify-between gap-2">
                <h2 className="font-semibold">{b.categoryName}</h2>
                <span
                  className={remaining < 0 ? "text-negative" : "text-positive"}
                >
                  {remaining < 0
                    ? `${money(-remaining, b.currency)} over`
                    : `${money(remaining, b.currency)} left`}
                </span>
              </div>
              <p>
                {money(spent, b.currency)} of {money(amount, b.currency)}
              </p>
              <progress
                aria-label={`${b.categoryName} budget used`}
                className="w-full accent-brand-primary"
                max={amount}
                value={Math.min(spent, amount)}
              />
              <p className="text-sm">
                {Math.round((spent / amount) * 100)}% used
              </p>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setEditing(b)}>
                  Edit
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    deletion.reset();
                    setRemove(b);
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="text-xs text-text-secondary">
        Overall and category budgets overlap; they are not added together.
        Transfers and settlements do not use your budget. Deleting a category
        also removes its budgets.
      </p>
      {editing !== undefined && (
        <BudgetForm
          month={month}
          budget={editing}
          currency={currency}
          categories={categories.data ?? []}
          onClose={() => setEditing(undefined)}
        />
      )}
      {remove && (
        <Confirm
          message="Delete this budget? Your transactions stay unchanged."
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </DashboardLayout>
  );
}
function BudgetForm({
  month,
  budget,
  currency,
  categories,
  onClose,
}: {
  month: string;
  budget: Budget | null;
  currency: string;
  categories: Category[];
  onClose: () => void;
}) {
  const action = useAction(
    (body: unknown) =>
      budget
        ? apiClient.put(`/planning/budgets/${budget.id}`, body)
        : apiClient.post("/planning/budgets", body),
    onClose,
  );
  return (
    <Modal title={budget ? "Edit budget" : "Add budget"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            month: `${month}-01`,
            categoryId: f.get("categoryId") || null,
            amount: Number(f.get("amount")),
            currency,
          });
        }}
      >
        <label className="label">
          Category
          <select
            className="field"
            name="categoryId"
            defaultValue={budget?.categoryId ?? ""}
          >
            <option value="">Overall spending</option>
            {categories
              .filter((c) => c.type === "EXPENSE")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="label">
          Monthly limit ({currency})
          <input
            className="field"
            type="number"
            min="0.01"
            step="0.01"
            name="amount"
            defaultValue={budget?.amount}
            required
          />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save budget
        </button>
      </form>
    </Modal>
  );
}
