"use client";
import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource } from "@/hooks/useResource";
import { useNetWorth } from "@/hooks/useDashboard";
import { useFormat } from "@/lib/format";
import { ErrorMessage } from "@/components/ui/Controls";
interface CashFlow {
  totalIncome: number;
  totalExpense: number;
  cashFlow: number;
  series: { date: string; income: number; expense: number }[];
}
export default function Analytics() {
  const [range, setRange] = useState("1M");
  const spending = useResource<{
    totalExpense: number;
    categories: {
      id: string | null;
      name: string;
      amount: number;
      percentage: number;
    }[];
  }>(`/analytics/category-spending?range=${range}`);
  const flow = useResource<CashFlow>(`/analytics/cash-flow?range=${range}`),
    worth = useNetWorth(),
    { money, timezone, currency } = useFormat();
  return (
    <DashboardLayout>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-text-secondary">
          Your income and personal expenses, in {currency}. Dates use {timezone}
          .
        </p>
      </header>
      <nav aria-label="Analytics time range" className="flex gap-2 flex-wrap">
        {["1W", "1M", "3M", "1Y", "ALL"].map((r) => (
          <button
            key={r}
            aria-pressed={r === range}
            className={r === range ? "btn" : "btn-secondary"}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </nav>
      <ErrorMessage error={flow.error || worth.error} />
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          ["Income", flow.data?.totalIncome],
          ["Expenses", flow.data?.totalExpense],
          ["Net cash flow", flow.data?.cashFlow],
        ].map(([label, value]) => (
          <article key={label} className="panel space-y-2">
            <h2 className="text-sm text-text-secondary">{label}</h2>
            <p className="text-2xl font-bold tabular-nums">
              {flow.isLoading ? "…" : money(Number(value ?? 0))}
            </p>
          </article>
        ))}
      </div>
      <section className="panel space-y-5">
        <h2 className="font-semibold text-lg">Income and expenses</h2>
        {flow.isLoading ? (
          <p role="status">Loading cash flow…</p>
        ) : flow.data && !flow.data.totalIncome && !flow.data.totalExpense ? (
          <p className="text-text-secondary">
            No income or expenses in this time range.
          </p>
        ) : (
          flow.data && (
            <div className="h-80 w-full min-w-0" aria-label="Cash flow chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flow.data.series} accessibilityLayer>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-soft)"
                  />
                  <XAxis
                    dataKey="date"
                    stroke="var(--text-secondary)"
                    minTickGap={35}
                  />
                  <YAxis
                    stroke="var(--text-secondary)"
                    tickFormatter={(value) => money(Number(value))}
                    width={90}
                  />
                  <Tooltip
                    formatter={(value) => money(Number(value))}
                    contentStyle={{
                      background: "var(--surface-primary)",
                      borderColor: "var(--border-soft)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="income"
                    name="Income"
                    fill="var(--positive)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="expense"
                    name="Expenses"
                    fill="var(--brand-primary)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        )}
        <p className="text-xs text-text-secondary">
          Transfers and settlements are excluded. Split expenses count only your
          personal share.
        </p>
      </section>
      <section className="panel space-y-4">
        <h2 className="font-semibold text-lg">Spending by category</h2>
        <ErrorMessage error={spending.error} />
        {spending.isLoading && <p>Loading categories…</p>}
        {spending.data?.categories.length === 0 && (
          <p>No spending in this range.</p>
        )}
        {spending.data?.categories.map((c) => (
          <div key={c.id ?? "uncategorized"} className="space-y-1">
            <div className="flex justify-between gap-3">
              <span>{c.name}</span>
              <strong>
                {money(c.amount)} · {c.percentage.toFixed(1)}%
              </strong>
            </div>
            <progress
              className="w-full accent-brand-primary"
              aria-label={`${c.name} share of spending`}
              max={100}
              value={c.percentage}
            />
          </div>
        ))}
      </section>
      <section className="panel">
        <h2 className="text-text-secondary text-sm">Current net worth</h2>
        <p className="text-3xl font-bold mt-2">
          {worth.isLoading ? "…" : money(worth.data?.netWorth ?? 0)}
        </p>
      </section>
    </DashboardLayout>
  );
}
