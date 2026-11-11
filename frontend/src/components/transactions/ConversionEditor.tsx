"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import Decimal from "decimal.js";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { useAccounts } from "@/hooks/useDashboard";
import { useFormat } from "@/lib/format";
import { Category, Transaction } from "@/lib/types";
import { ErrorMessage } from "@/components/ui/Controls";
interface Conversion {
  id: string;
  originalCurrency: string;
  originalAmount: number;
  exchangeRate: number;
  rateDate: string;
  rateSource: string;
  requestKey: string;
  transaction: Transaction;
}
export function ConversionEditor({
  id,
  onDone,
}: {
  id?: string;
  onDone: () => void;
}) {
  const data = useResource<Conversion>(`/exchange/entries/${id}`, !!id);
  if (id && !data.data)
    return (
      <>
        <p>Loading conversion…</p>
        <ErrorMessage error={data.error} />
      </>
    );
  return <Form key={id} existing={data.data} onDone={onDone} />;
}
function Form({
  existing,
  onDone,
}: {
  existing?: Conversion;
  onDone: () => void;
}) {
  const { currency, money } = useFormat(),
    accounts = useAccounts(),
    categories = useResource<Category[]>("/categories"),
    currencies = useResource<{ code: string; minorUnits: number }[]>(
      "/exchange/currencies",
    );
  const [key] = useState(() => existing?.requestKey ?? crypto.randomUUID());
  const [value, set] = useState({
    accountId: existing?.transaction.accountId ?? "",
    type: existing?.transaction.type ?? "EXPENSE",
    categoryId: existing?.transaction.categoryId ?? "",
    originalCurrency:
      existing?.originalCurrency ?? (currency === "EUR" ? "USD" : "EUR"),
    originalAmount: String(existing?.originalAmount ?? ""),
    exchangeRate: String(existing?.exchangeRate ?? ""),
    rateDate: existing?.rateDate ?? new Date().toISOString().slice(0, 10),
    rateSource: existing?.rateSource ?? "MANUAL",
    dateTime:
      existing?.transaction.dateTime?.slice(0, 16) ??
      new Date().toISOString().slice(0, 16),
    notes: existing?.transaction.notes ?? "",
  });
  const [error, setError] = useState<unknown>(),
    [loading, setLoading] = useState(false);
  const change = (field: string, v: string) =>
    set((s) => ({
      ...s,
      [field]: v,
      ...(["originalCurrency", "exchangeRate", "rateDate"].includes(field)
        ? { rateSource: "MANUAL" }
        : {}),
    }));
  const digits =
    currencies.data?.find((c) => c.code === currency)?.minorUnits ?? 2;
  let converted = "";
  try {
    if (value.originalAmount && value.exchangeRate)
      converted = new Decimal(value.originalAmount)
        .mul(value.exchangeRate)
        .toDecimalPlaces(digits, Decimal.ROUND_HALF_UP)
        .toFixed(digits);
  } catch {}
  const save = useAction(
    () =>
      apiClient[existing ? "put" : "post"](
        `/exchange/entries${existing ? `/${existing.id}` : ""}`,
        {
          ...value,
          categoryId: value.categoryId || null,
          originalAmount: Number(value.originalAmount),
          exchangeRate: Number(value.exchangeRate),
          dateTime: new Date(value.dateTime).toISOString(),
          requestKey: key,
        },
      ),
    onDone,
  );
  async function quote() {
    setLoading(true);
    setError(undefined);
    try {
      const q = await apiClient.get<{ rate: string; date: string }>(
        `/exchange/quote?from=${value.originalCurrency}&to=${currency}&date=${value.rateDate}`,
      );
      set((s) => ({
        ...s,
        exchangeRate: q.rate,
        rateDate: q.date,
        rateSource: "REFERENCE_SELECTED",
      }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm text-text-secondary">
        Record foreign spending or income in your {currency} ledger. The
        original amount and selected rate stay with this record. This does not
        exchange or move money.
      </p>
      <label className="label">
        <T text="Account" />
        <select
          className="field"
          required
          value={value.accountId}
          onChange={(e) => change("accountId", e.target.value)}
        >
          <option value="">
            <T text="Choose account" />
          </option>
          {accounts.data
            ?.filter(
              (a) =>
                !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(a.type),
            )
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      <label className="label">
        <T text="Type" />
        <select
          className="field"
          value={value.type}
          onChange={(e) => {
            change("type", e.target.value);
            change("categoryId", "");
          }}
        >
          <option>EXPENSE</option>
          <option>INCOME</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          <T text="Original currency" />
          <select
            className="field"
            value={value.originalCurrency}
            onChange={(e) => change("originalCurrency", e.target.value)}
          >
            {currencies.data
              ?.filter((c) => c.code !== currency)
              .map((c) => (
                <option key={c.code}>{c.code}</option>
              ))}
          </select>
        </label>
        <label className="label">
          <T text="Original amount" />
          <input
            className="field"
            type="number"
            step="any"
            min="0.0001"
            required
            value={value.originalAmount}
            onChange={(e) => change("originalAmount", e.target.value)}
          />
        </label>
      </div>
      <label className="label">
        <T text="Rate date" />
        <input
          className="field"
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          value={value.rateDate}
          onChange={(e) => change("rateDate", e.target.value)}
        />
      </label>
      <button
        className="btn-secondary"
        type="button"
        disabled={loading}
        onClick={quote}
      >
        {loading ? "Fetching…" : "Get reference rate"}
      </button>
      <label className="label">
        1 {value.originalCurrency} in {currency}
        <input
          className="field"
          type="number"
          step="any"
          min="0.0000000000000001"
          required
          value={value.exchangeRate}
          onChange={(e) => change("exchangeRate", e.target.value)}
        />
      </label>
      <p className="text-xs text-text-secondary">
        {value.rateSource === "REFERENCE_SELECTED"
          ? "Frankfurter reference rate, selected by you. Your bank’s actual rate may differ."
          : "Manual rate: enter the actual rate from your statement."}{" "}
        Rates are snapshots; historical entries never change when rates update.
      </p>
      <p className="text-xl font-semibold" aria-live="polite">
        {converted ? money(Number(converted)) : "Enter an amount and rate"}
      </p>
      <label className="label">
        <T text="Category" />
        <select
          className="field"
          value={value.categoryId}
          onChange={(e) => change("categoryId", e.target.value)}
        >
          <option value="">
            <T text="Uncategorized" />
          </option>
          {categories.data
            ?.filter((c) => c.type === value.type)
            .map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label className="label">
        <T text="Date and time (UTC)" />
        <input
          className="field"
          type="datetime-local"
          required
          value={value.dateTime}
          onChange={(e) => change("dateTime", e.target.value)}
        />
      </label>
      <label className="label">
        <T text="Notes" />
        <input
          className="field"
          maxLength={2000}
          value={value.notes}
          onChange={(e) => change("notes", e.target.value)}
        />
      </label>
      <ErrorMessage error={error ?? save.error} />
      <button className="btn" disabled={save.isPending}>
        Save reviewed conversion
      </button>
    </form>
  );
}
