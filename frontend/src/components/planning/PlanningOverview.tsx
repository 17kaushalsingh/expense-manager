"use client";
import Link from "next/link";
import { useResource } from "@/hooks/useResource";
import { useFormat } from "@/lib/format";
import { monthIn } from "@/lib/calendar";
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
  return (
    <section className="panel space-y-3">
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold text-lg">Your financial plan</h2>
        <Link className="text-brand-primary" href="/budgets">
          Budgets
        </Link>
      </div>
      <ErrorMessage error={rows.error} />
      {rows.isLoading ? (
        <p>Checking this month’s budgets…</p>
      ) : alerts.length ? (
        alerts.map((b) => (
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
          {rows.data?.length
            ? "All budgets are below 80% of their limits."
            : "Set monthly limits to see spending alerts here."}
        </p>
      )}
      <Link href="/goals" className="text-brand-primary text-sm">
        Track your savings goals →
      </Link>
    </section>
  );
}
