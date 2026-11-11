"use client";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource, useAction } from "@/hooks/useResource";
import { useAccounts } from "@/hooks/useDashboard";
import { apiClient } from "@/lib/api/client";
import { useFormat } from "@/lib/format";
import { Account } from "@/lib/types";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
interface Goal {
  id: string;
  name: string;
  accountId: string;
  targetAmount: number;
  targetDate: string | null;
  currency: string;
  account: Pick<Account, "name" | "balance">;
}
export default function Goals() {
  const { money, currency } = useFormat();
  const data = useResource<Goal[]>("/planning/goals"),
    accounts = useAccounts();
  const [edit, setEdit] = useState<Goal | null | undefined>(),
    [remove, setRemove] = useState<Goal>();
  const deletion = useAction(
    () => apiClient.delete(`/planning/goals/${remove?.id}`),
    () => setRemove(undefined),
  );
  return (
    <DashboardLayout>
      <header className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-bold">Savings goals</h1>
        <button className="btn" onClick={() => setEdit(null)}>
          Add goal
        </button>
      </header>
      <p className="text-text-secondary">
        Give an asset account a purpose. Progress follows its actual balance;
        creating a goal never moves money. Each account supports one goal.
      </p>
      <ErrorMessage error={data.error || accounts.error} />
      {data.isLoading && <p>Loading goals…</p>}
      {data.data?.length === 0 && (
        <p className="panel">
          No savings goals yet. Link a savings account to your next milestone.
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {data.data?.map((g) => {
          const saved = Math.max(0, Number(g.account.balance)),
            target = Number(g.targetAmount);
          return (
            <article className="panel space-y-3" key={g.id}>
              <h2 className="font-semibold text-lg">{g.name}</h2>
              <p>
                {g.account.name}
                {g.targetDate ? ` · target ${g.targetDate}` : ""}
              </p>
              <p>
                {money(saved, g.currency)} / {money(target, g.currency)}
              </p>
              <progress
                className="w-full accent-brand-primary"
                aria-label={`${g.name} progress`}
                value={Math.min(saved, target)}
                max={target}
              />
              <p
                className={
                  saved >= target ? "text-positive" : "text-text-secondary"
                }
              >
                {saved >= target
                  ? "Goal reached!"
                  : `${money(target - saved, g.currency)} to go`}
              </p>
              <div
                className="grid grid-cols-4 gap-2"
                aria-label={`${g.name} milestones`}
              >
                {[25, 50, 75, 100].map((percent) => (
                  <div
                    key={percent}
                    className={`text-center rounded-lg p-2 text-xs ${saved >= (target * percent) / 100 ? "bg-positive/10 text-positive" : "bg-surface-secondary text-text-secondary"}`}
                  >
                    {saved >= (target * percent) / 100 ? "✓ " : ""}
                    {percent}%
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setEdit(g)}>
                  Edit
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    deletion.reset();
                    setRemove(g);
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {edit !== undefined && (
        <GoalForm
          goal={edit}
          currency={currency}
          accounts={accounts.data ?? []}
          onClose={() => setEdit(undefined)}
        />
      )}
      {remove && (
        <Confirm
          message="Delete this goal? Your account and money stay unchanged."
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </DashboardLayout>
  );
}
function GoalForm({
  goal,
  currency,
  accounts,
  onClose,
}: {
  goal: Goal | null;
  currency: string;
  accounts: Account[];
  onClose: () => void;
}) {
  const action = useAction(
    (body: unknown) =>
      goal
        ? apiClient.put(`/planning/goals/${goal.id}`, body)
        : apiClient.post("/planning/goals", body),
    onClose,
  );
  return (
    <Modal
      title={goal ? "Edit savings goal" : "Add savings goal"}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            name: f.get("name"),
            accountId: f.get("accountId"),
            targetAmount: Number(f.get("targetAmount")),
            targetDate: f.get("targetDate") || null,
            currency,
          });
        }}
      >
        <label className="label">
          Goal name
          <input
            className="field"
            name="name"
            defaultValue={goal?.name}
            required
            maxLength={120}
          />
        </label>
        <label className="label">
          Dedicated account
          <select
            className="field"
            name="accountId"
            defaultValue={goal?.accountId ?? ""}
            required
          >
            <option value="">Choose account</option>
            {accounts
              .filter((a) =>
                ["CASH", "BANK_ACCOUNT", "PREPAID_CARD", "INVESTMENT"].includes(
                  a.type,
                ),
              )
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="label">
          Target ({currency})
          <input
            className="field"
            name="targetAmount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={goal?.targetAmount}
            required
          />
        </label>
        <label className="label">
          Target date (optional)
          <input
            className="field"
            name="targetDate"
            type="date"
            defaultValue={goal?.targetDate ?? ""}
          />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save goal
        </button>
      </form>
    </Modal>
  );
}
