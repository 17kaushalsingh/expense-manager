"use client";
import { useState } from "react";
import { useResource, useAction } from "@/hooks/useResource";
import { useFormat } from "@/lib/format";
import { apiClient } from "@/lib/api/client";
import { ErrorMessage } from "@/components/ui/Controls";
interface Summary {
  currency: string;
  timezone: string;
  expenseCount: number;
  totalSpending: number;
  youPaid: number;
  yourShare: number;
  paymentsSent: number;
  paymentsReceived: number;
  netChange: number;
}
export function GroupReport({ groupId }: { groupId: string }) {
  const [month, setMonth] = useState("");
  const suffix = month ? `?month=${month}` : "";
  const report = useResource<Summary>(`/groups/${groupId}/summary${suffix}`);
  const { money } = useFormat();
  const download = useAction(async () => {
    const blob = await apiClient.download(`/groups/${groupId}/export${suffix}`);
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `group-expenses-${month || "all"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const data = report.data;
  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap gap-3 justify-between items-end">
        <div>
          <h2 className="section-title">Group spending</h2>
          <p className="text-sm text-text-secondary">
            Expenses and recorded payments for the selected period.
          </p>
        </div>
        <label className="label">
          Month
          <input
            className="field"
            type="month"
            min="1000-01"
            max="9999-12"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button className="btn-secondary" onClick={() => setMonth("")}>
          All time
        </button>
        <button
          className="btn-secondary"
          disabled={download.isPending || !data}
          onClick={() => download.mutate()}
        >
          {download.isPending ? "Preparing…" : "Export CSV"}
        </button>
      </div>
      <ErrorMessage error={report.error || download.error} />
      {report.isLoading && <p role="status">Loading totals…</p>}
      {data && (
        <>
          <p className="text-sm text-text-secondary">
            {data.expenseCount} expenses · {month || "All time"} ·{" "}
            {data.timezone}
          </p>
          <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ["Group spending", data.totalSpending],
              ["You paid", data.youPaid],
              ["Your share", data.yourShare],
              ["Payments sent", data.paymentsSent],
              ["Payments received", data.paymentsReceived],
              ["Your net change", data.netChange],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-surface-secondary p-4">
                <dt className="text-xs text-text-secondary">{label}</dt>
                <dd className="text-xl mt-1 tabular-nums">
                  {money(Number(value), data.currency)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-text-secondary">
            Net change = paid − your share + payments sent − payments received.
            It describes this period; your current balance is shown above.
            Pending drafts are excluded.
          </p>
          {data.expenseCount === 0 && <p>No expenses in this period.</p>}
        </>
      )}
    </section>
  );
}
