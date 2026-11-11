"use client";
import { useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource } from "@/hooks/useResource";
import { useAccounts } from "@/hooks/useDashboard";
import { apiClient } from "@/lib/api/client";
import { useFormat } from "@/lib/format";
import { dayIn } from "@/lib/calendar";
import { ErrorMessage } from "@/components/ui/Controls";
interface Report {
  fromDate: string;
  toDate: string;
  currency: string;
  timezone: string;
  income: number;
  expense: number;
  saving: number;
  savingRate: number | null;
  categories: { id: string | null; name: string; amount: number }[];
  days: { date: string; income: number; expense: number }[];
  transactions: { id: string }[];
}
export default function Reports() {
  const { money, timezone } = useFormat(),
    today = dayIn(new Date().toISOString(), timezone),
    [from, setFrom] = useState<string>(),
    [to, setTo] = useState<string>(),
    [account, setAccount] = useState(""),
    fromDate = from ?? today.slice(0, 7) + "-01",
    toDate = to ?? today,
    accounts = useAccounts();
  const params = new URLSearchParams({
      fromDate,
      toDate,
      ...(account ? { accountId: account } : {}),
    }),
    valid = !!fromDate && !!toDate && fromDate <= toDate,
    data = useResource<Report>(`/reports?${params}`, valid);
  const [exporting, setExporting] = useState<string>(),
    [error, setError] = useState<unknown>();
  async function download(format: "pdf" | "xlsx") {
    setExporting(format);
    setError(undefined);
    try {
      const blob = await apiClient.download(
          `/reports?${params}&format=${format}`,
        ),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `ledgersync-${fromDate}-${toDate}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e);
    } finally {
      setExporting(undefined);
    }
  }
  const largest = Math.max(0, ...(data.data?.days.map((d) => d.expense) ?? [])),
    calendarDays = valid
      ? Math.min(
          3660,
          Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000) +
            1,
        )
      : 0,
    byDay = new Map(data.data?.days.map((d) => [d.date, d]));
  return (
    <DashboardLayout>
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="eyebrow">From records to perspective</p>
          <h1 className="text-3xl font-bold mt-2">Money reports</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={!!exporting || !valid || data.isLoading || !!data.error}
            onClick={() => void download("pdf")}
          >
            {exporting === "pdf" ? "Preparing…" : "Export PDF"}
          </button>
          <button
            className="btn"
            disabled={!!exporting || !valid || data.isLoading || !!data.error}
            onClick={() => void download("xlsx")}
          >
            {exporting === "xlsx" ? "Preparing…" : "Export Excel"}
          </button>
        </div>
      </header>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="label">
          From
          <input
            className="field"
            type="date"
            value={fromDate}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="label">
          Through
          <input
            className="field"
            type="date"
            value={toDate}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="label">
          Account
          <select
            className="field"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!valid && (
        <p role="alert" className="text-negative">
          Choose a start date on or before the end date.
        </p>
      )}
      <ErrorMessage error={data.error || accounts.error || error} />
      {data.isLoading && <p>Building your report…</p>}
      {valid && data.data && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              ["Income", data.data.income],
              ["Personal expenses", data.data.expense],
              ["Saved", data.data.saving],
            ].map(([label, value]) => (
              <article key={label} className="panel">
                <h2 className="text-sm text-text-secondary">{label}</h2>
                <p className="text-3xl font-semibold mt-2">
                  {money(Number(value))}
                </p>
              </article>
            ))}
          </div>
          <section className="panel space-y-3">
            <h2 className="font-semibold">Savings rate</h2>
            <p className="text-3xl font-semibold">
              {data.data.savingRate === null
                ? "—"
                : `${data.data.savingRate.toFixed(1)}%`}
            </p>
            <p className="text-sm text-text-secondary">
              Income minus personal expenses, divided by income. Available after
              income is recorded. This measures the selected records and period.
            </p>
          </section>
          <section className="panel space-y-4">
            <h2 className="text-lg font-semibold">Spending activity</h2>
            <p className="text-sm text-text-secondary">
              Each square is a local calendar day in {data.data.timezone}.
              Darker means more spending in this period.
            </p>
            <div
              className="flex flex-wrap gap-1.5"
              aria-label="Daily spending heatmap"
            >
              {Array.from({ length: calendarDays }, (_, i) => {
                const date = new Date(`${fromDate}T12:00:00Z`);
                date.setUTCDate(date.getUTCDate() + i);
                const key = date.toISOString().slice(0, 10),
                  expense = byDay.get(key)?.expense ?? 0;
                return (
                  <Link
                    key={key}
                    href={`/transactions?view=calendar&onDate=${key}`}
                    title={`${key}: ${money(expense)} spent`}
                    aria-label={`${key}: ${money(expense)} spent`}
                    className="h-6 w-6 rounded-[5px] border border-border-soft focus:ring-2 focus:ring-brand-primary"
                    style={{
                      background: expense
                        ? `color-mix(in srgb, var(--positive) ${Math.max(20, Math.round((expense / (largest || 1)) * 100))}%, var(--surface-secondary))`
                        : "var(--surface-secondary)",
                    }}
                  />
                );
              })}
            </div>
            <p className="text-xs text-text-secondary">
              {data.data.transactions.length} ledger entries. Empty days have no
              personal expense recorded.
            </p>
          </section>
          <section className="panel space-y-4">
            <h2 className="text-lg font-semibold">Category breakdown</h2>
            {!data.data.categories.length && (
              <p className="text-text-secondary">No spending in this period.</p>
            )}
            {data.data.categories.map((c) => (
              <div key={c.id ?? "uncategorized"} className="space-y-2">
                <div className="flex justify-between gap-3">
                  <span>{c.name}</span>
                  <strong>{money(c.amount)}</strong>
                </div>
                <progress
                  className="w-full accent-brand-primary"
                  aria-label={`${c.name} share of spending`}
                  value={c.amount}
                  max={data.data!.expense || 1}
                />
              </div>
            ))}
          </section>
        </>
      )}
      <p className="text-xs text-text-secondary">
        Personal shares count once. Transfers, settlements and loan principal
        are excluded from income/expense totals. Excel includes transaction
        details as literal cells; PDF summarizes categories and daily activity.
        Exports contain your private financial records.
      </p>
    </DashboardLayout>
  );
}
