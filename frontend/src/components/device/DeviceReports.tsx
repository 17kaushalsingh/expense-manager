"use client";
import { useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { Workspace } from "@/lib/device/vault";
import { deviceReport, csvExport } from "@/lib/device/reports";
import { deviceDay } from "@/lib/device/personal";
import { translate } from "@/lib/i18n/catalogs";
import { useLocale, T } from "@/components/i18n/Language";
export function DeviceReports({ w }: { w: Workspace }) {
  const locale = useLocale(),
    today = deviceDay(new Date(), w.profile.timezone),
    [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today),
    [account, setAccount] = useState("");
  const money = (v: unknown) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: w.profile.displayCurrency,
    }).format(Number(v));
  const valid = from && to && from <= to,
    data = valid ? deviceReport(w, from, to, account) : null;
  return (
    <section className="panel space-y-5">
      <h2 className="text-xl"><T text="Offline money reports" /></h2>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="label"><T text="From" /><input
            className="field"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label className="label"><T text="To" /><input
            className="field"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>
        <label className="label">
          <T text="Account" />
          <select
            className="field"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value=""><T text="All accounts" /></option>
            {w.tables.accounts?.map((a) => (
              <option key={String(a.id)} value={String(a.id)}>
                {String(a.name)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!data ? (
        <p role="alert"><T text="Choose an end date on or after the start." /></p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Income", data.income],
              ["Expenses", data.expense],
              ["Net cash flow", data.net],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-text-secondary">
                  <T text={String(label)} />
                </p>
                <p className="font-semibold tabular-nums">{money(value)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-secondary">
            {w.mode === "CLOUD"
              ? "Includes unsynced personal entries from this device; pending shared changes are excluded."
              : "Uses only recorded personal income and expenses. Transfers and principal repayments do not count as income or spending."}
          </p>
          {!data.days.length ? (
            <p><T text="No income or spending in this period." /></p>
          ) : (
            <div
              className="h-72 w-full min-w-0"
              role="img"
              aria-label="Daily income and expense chart"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.days}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) =>
                      new Intl.DateTimeFormat(locale, {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(v + "T12:00:00Z"))
                    }
                  />
                  <YAxis
                    tickFormatter={(v) =>
                      new Intl.NumberFormat(locale, {
                        notation: "compact",
                      }).format(v)
                    }
                    width={55}
                  />
                  <Tooltip formatter={(v) => money(v)} />
                  <Legend />
                  <Bar
                    dataKey="income"
                    name={translate("Income", locale)}
                    fill="#37744f"
                  />
                  <Bar
                    dataKey="expense"
                    name={translate("Expenses", locale)}
                    fill="#ba5666"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-2">
            {data.categories.map((c) => (
              <p key={c.id} className="flex justify-between gap-3">
                <span>{c.name}</span>
                <span className="tabular-nums">{money(c.amount)}</span>
              </p>
            ))}
          </div>
          <button
            className="btn-secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                  new Blob(["\uFEFF" + csvExport(w, data.rows)], {
                    type: "text/csv;charset=utf-8",
                  }),
                ),
                a = document.createElement("a");
              a.href = url;
              a.download = `device-report-${from}-${to}.csv`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          ><T text="Export this period as CSV" /></button>
        </>
      )}
    </section>
  );
}
