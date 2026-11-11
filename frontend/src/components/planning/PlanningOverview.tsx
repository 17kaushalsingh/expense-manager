"use client";
import Link from "next/link";
import { useResource } from "@/hooks/useResource";
import { useFormat } from "@/lib/format";
import { monthIn, dayIn } from "@/lib/calendar";
import { ErrorMessage } from "@/components/ui/Controls";
export function PlanningOverview() {
  const { money, timezone } = useFormat();
  const rows = useResource<
    {
      id: string;
      categoryName: string;
      amount: number;
      spent: number;
      currency: string;
    }[]
  >(`/planning/budgets?month=${monthIn(timezone)}`);
  const alerts =
    rows.data?.filter((b) => Number(b.spent) >= Number(b.amount) * 0.8) ?? [];
  const plans = useResource<
    {
      id: string;
      name: string;
      effectiveAmount: number;
      spent: number;
      currency: string;
      archived: boolean;
      alertsEnabled: boolean;
      periodStart: string | null;
    }[]
  >(
    `/personal-planning/budget-plans?date=${dayIn(new Date().toISOString(), timezone)}`,
  );
  const planAlerts =
    plans.data?.filter(
      (p) =>
        !p.archived &&
        p.alertsEnabled &&
        p.periodStart &&
        Number(p.spent) >= Number(p.effectiveAmount) * 0.8,
    ) ?? [];
  return (
    <section className="panel space-y-3">
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold text-lg">Your financial plan</h2>
        <Link className="text-brand-primary" href="/planner">
          Review plan
        </Link>
      </div>
      <ErrorMessage error={rows.error || plans.error} />
      {rows.isLoading || plans.isLoading ? (
        <p>Checking this month’s budgets…</p>
      ) : alerts.length || planAlerts.length ? (
        [
          ...alerts,
          ...planAlerts.map((p) => ({
            id: p.id,
            categoryName: p.name,
            spent: p.spent,
            amount: p.effectiveAmount,
            currency: p.currency,
          })),
        ].map((b) => (
          <p
            key={b.id}
            className={
              Number(b.spent) > Number(b.amount)
                ? "text-negative"
                : "text-text-secondary"
            }
          >
            {b.categoryName}: {money(Number(b.spent), b.currency)} of{" "}
            {money(Number(b.amount), b.currency)} used.
          </p>
        ))
      ) : (
        <p className="text-text-secondary">
          {rows.data?.length || plans.data?.length
            ? "All budgets are below 80% of their limits."
            : "Set spending limits to see budget alerts here."}
        </p>
      )}
      <Link href="/goals" className="text-brand-primary text-sm">
        Track your savings goals →
      </Link>
    </section>
  );
}
