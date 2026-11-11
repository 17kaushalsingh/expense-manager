"use client";
import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource, useAction } from "@/hooks/useResource";
import { useNetWorth } from "@/hooks/useDashboard";
import { apiClient } from "@/lib/api/client";
import { useFormat } from "@/lib/format";
import { dayIn } from "@/lib/calendar";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
interface Valuation {
  id: string;
  valueDate: string;
  value: number;
  notes: string;
}
interface Asset {
  id: string;
  name: string;
  kind: string;
  notes: string;
  currency: string;
  archived: boolean;
  valuations: Valuation[];
}
export default function Wealth() {
  const { money, currency, timezone } = useFormat(),
    worth = useNetWorth(),
    assets = useResource<Asset[]>("/wealth/assets");
  const [range, setRange] = useState("1M"),
    history = useResource<{ series: { date: string; netWorth: number }[] }>(
      `/wealth/history?range=${range}`,
    );
  const [edit, setEdit] = useState<Asset | null | undefined>(),
    [valuation, setValuation] = useState<Asset>(),
    [remove, setRemove] = useState<Asset>(),
    [removeValue, setRemoveValue] = useState<Valuation>();
  const deletion = useAction(
      () => apiClient.delete(`/wealth/assets/${remove?.id}`),
      () => setRemove(undefined),
    ),
    valueDeletion = useAction(
      () => apiClient.delete(`/wealth/valuations/${removeValue?.id}`),
      () => setRemoveValue(undefined),
    );
  return (
    <DashboardLayout>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow">The bigger picture</p>
          <h1 className="text-3xl font-bold mt-2">Wealth & assets</h1>
        </div>
        <button className="btn" onClick={() => setEdit(null)}>
          Add asset
        </button>
      </header>
      <ErrorMessage error={assets.error || worth.error || history.error} />
      <section className="panel space-y-4">
        <p className="text-sm text-text-secondary">Current net worth</p>
        <p className="text-4xl font-semibold tracking-tight">
          {worth.isLoading
            ? "…"
            : worth.data
              ? money(worth.data.netWorth)
              : "Unavailable"}
        </p>
        <nav className="flex flex-wrap gap-2" aria-label="Net worth range">
          {["1W", "1M", "3M", "1Y", "ALL"].map((r) => (
            <button
              key={r}
              className={range === r ? "btn" : "btn-secondary"}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </nav>
        {history.isLoading ? (
          <p>Loading history…</p>
        ) : history.data?.series.length ? (
          <div className="h-64 min-w-0" aria-label="Net worth history">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.data.series} accessibilityLayer>
                <XAxis
                  dataKey="date"
                  minTickGap={45}
                  stroke="var(--text-secondary)"
                />
                <YAxis
                  width={90}
                  tickFormatter={(v) => money(Number(v))}
                  stroke="var(--text-secondary)"
                />
                <Tooltip
                  formatter={(v) => money(Number(v))}
                  contentStyle={{
                    background: "var(--surface-primary)",
                    borderColor: "var(--border-soft)",
                  }}
                />
                <Line
                  type="stepAfter"
                  dataKey="netWorth"
                  name="Net worth"
                  stroke="var(--brand-primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p>No history yet.</p>
        )}
        <p className="text-xs text-text-secondary">
          History reconstructs current account records and dated asset
          valuations in {timezone}. Editing or deleting those records changes
          the history. Opening balances begin at the account’s earliest record;
          this is not a bank statement.
        </p>
      </section>
      <p className="text-text-secondary text-sm">
        Track property, vehicles and valuables here. Record an investment in
        either an account or an asset to avoid counting it twice. Valuations do
        not create income, expenses or cash movements.
      </p>
      {assets.isLoading && <p>Loading assets…</p>}
      {assets.data?.length === 0 && (
        <p className="panel">
          Your accounts already contribute to net worth. Add non-cash assets to
          complete the picture.
        </p>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        {assets.data?.map((a) => {
          const values = [...a.valuations].sort((x, y) =>
              y.valueDate.localeCompare(x.valueDate),
            ),
            latest = values[0],
            first = values.at(-1),
            change =
              latest && first ? Number(latest.value) - Number(first.value) : 0;
          return (
            <article key={a.id} className="panel space-y-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="eyebrow">
                    {a.kind.toLowerCase()}
                    {a.archived && " · archived"}
                  </p>
                  <h2 className="text-xl font-semibold mt-1">{a.name}</h2>
                </div>
                <p className="text-2xl font-semibold">
                  {latest
                    ? money(Number(latest.value), a.currency)
                    : "No valuation"}
                </p>
              </div>
              {latest && (
                <p className="text-sm text-text-secondary">
                  As of {latest.valueDate} ·{" "}
                  <span
                    className={change < 0 ? "text-negative" : "text-positive"}
                  >
                    {money(change)} since first valuation
                  </span>
                </p>
              )}
              {a.notes && (
                <p className="text-sm whitespace-pre-wrap">{a.notes}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                <button
                  className="btn-secondary"
                  onClick={() => setValuation(a)}
                >
                  Update value
                </button>
                <button className="btn-secondary" onClick={() => setEdit(a)}>
                  Edit
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    deletion.reset();
                    setRemove(a);
                  }}
                >
                  Delete
                </button>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-brand-primary">
                  Valuation history ({values.length})
                </summary>
                <div className="divide-y divide-border-soft mt-2">
                  {values.map((v) => (
                    <div key={v.id} className="py-3 flex justify-between gap-3">
                      <div>
                        <p>
                          {v.valueDate} · {money(Number(v.value))}
                        </p>
                        <p className="text-xs text-text-secondary">{v.notes}</p>
                      </div>
                      <button
                        className="text-sm text-negative"
                        onClick={() => {
                          valueDeletion.reset();
                          setRemoveValue(v);
                        }}
                      >
                        Remove valuation
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            </article>
          );
        })}
      </div>
      {edit !== undefined && (
        <AssetForm
          asset={edit}
          currency={currency}
          today={dayIn(new Date().toISOString(), timezone)}
          onClose={() => setEdit(undefined)}
        />
      )}
      {valuation && (
        <ValueForm
          asset={valuation}
          today={dayIn(new Date().toISOString(), timezone)}
          onClose={() => setValuation(undefined)}
        />
      )}
      {remove && (
        <Confirm
          message={`Delete ${remove.name} and all its valuations? This changes net-worth history.`}
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
      {removeValue && (
        <Confirm
          message="Remove this valuation? Net-worth history will be recalculated."
          onClose={() => setRemoveValue(undefined)}
          onConfirm={() => valueDeletion.mutate(undefined)}
          busy={valueDeletion.isPending}
          error={valueDeletion.error}
        />
      )}
    </DashboardLayout>
  );
}
function AssetForm({
  asset,
  currency,
  today,
  onClose,
}: {
  asset: Asset | null;
  currency: string;
  today: string;
  onClose: () => void;
}) {
  const action = useAction(
    (body: unknown) =>
      asset
        ? apiClient.put(`/wealth/assets/${asset.id}`, body)
        : apiClient.post("/wealth/assets", body),
    onClose,
  );
  return (
    <Modal
      title={asset ? "Edit asset" : "Add asset"}
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
            kind: f.get("kind"),
            notes: f.get("notes"),
            currency,
            archived: f.get("archived") === "on",
            ...(!asset
              ? { value: Number(f.get("value")), valueDate: f.get("date") }
              : {}),
          });
        }}
      >
        <label className="label">
          Name
          <input
            className="field"
            name="name"
            defaultValue={asset?.name}
            required
            maxLength={120}
          />
        </label>
        <label className="label">
          Kind
          <select
            className="field"
            name="kind"
            defaultValue={asset?.kind ?? "PROPERTY"}
          >
            {["PROPERTY", "VEHICLE", "INVESTMENT", "VALUABLE", "OTHER"].map(
              (k) => (
                <option key={k}>{k}</option>
              ),
            )}
          </select>
        </label>
        {!asset && (
          <div className="grid grid-cols-2 gap-3">
            <label className="label">
              Value ({currency})
              <input
                className="field"
                name="value"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label className="label">
              Valuation date
              <input
                className="field"
                name="date"
                type="date"
                defaultValue={today}
                max={today}
                required
              />
            </label>
          </div>
        )}
        <label className="label">
          Notes
          <textarea
            className="field"
            name="notes"
            defaultValue={asset?.notes ?? ""}
            maxLength={2000}
          />
        </label>
        {asset && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={asset.archived}
            />
            Mark archived (value still counts)
          </label>
        )}
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save asset
        </button>
      </form>
    </Modal>
  );
}
function ValueForm({
  asset,
  today,
  onClose,
}: {
  asset: Asset;
  today: string;
  onClose: () => void;
}) {
  const action = useAction(
    (body: unknown) =>
      apiClient.put(`/wealth/assets/${asset.id}/valuations`, body),
    onClose,
  );
  return (
    <Modal
      title={`Value · ${asset.name}`}
      onClose={onClose}
      busy={action.isPending}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            value: Number(f.get("value")),
            valueDate: f.get("date"),
            notes: f.get("notes"),
          });
        }}
      >
        <p className="text-sm text-text-secondary">
          A valuation on an existing date replaces that date’s value.
        </p>
        <label className="label">
          Value ({asset.currency})
          <input
            name="value"
            type="number"
            className="field"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label className="label">
          Date
          <input
            name="date"
            type="date"
            className="field"
            defaultValue={today}
            max={today}
            required
          />
        </label>
        <label className="label">
          Notes
          <textarea name="notes" className="field" maxLength={1000} />
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save valuation
        </button>
      </form>
    </Modal>
  );
}
