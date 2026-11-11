"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import { Account } from "@/lib/types";
import { apiClient } from "@/lib/api/client";
import { useAction } from "@/hooks/useResource";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
import { useFormat } from "@/lib/format";
const fields = [
  "date",
  "amount",
  "type",
  "notes",
  "category",
  "currency",
  "source",
  "account",
] as const;
type Field = (typeof fields)[number];
interface Row {
  rowNumber: number;
  amount: number;
  type: "INCOME" | "EXPENSE";
  dateTime: string;
  notes: string;
  categoryId: string | null;
  duplicate: boolean;
}
interface Preview {
  batchId: string;
  accountId: string;
  timezone: string;
  currency: string;
  rows: { rowNumber: number; error?: string; data?: Row }[];
}
interface Result {
  id: string;
  created: number;
  skipped: number;
}
export function CsvImport({
  accounts,
  onClose,
}: {
  accounts: Account[];
  onClose: () => void;
}) {
  const { money, date } = useFormat();
  const [csv, setCsv] = useState(""),
    [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Partial<Record<Field, string>>>({});
  const [accountId, setAccount] = useState(""),
    [delimiter, setDelimiter] = useState(","),
    [decimalSeparator, setDecimal] = useState(".");
  const [dateFormat, setDateFormat] = useState("ISO"),
    [defaultType, setDefaultType] = useState("SIGNED");
  const [preview, setPreview] = useState<Preview>(),
    [selected, setSelected] = useState<number[]>([]);
  const [allowDuplicates, setAllowDuplicates] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const [result, setResult] = useState<Result>();
  const action = useAction(async () => {
    if (!preview) throw new Error("Preview the import first.");
    const rows = preview.rows.flatMap((row) =>
      row.data && selected.includes(row.rowNumber) ? [row.data] : [],
    );
    const response = await apiClient.post<Result>("/imports", {
      batchId: preview.batchId,
      accountId: preview.accountId,
      timezone: preview.timezone,
      allowDuplicates,
      rows,
    });
    setResult(response);
    return response;
  });
  function revise() {
    setPreview(undefined);
    setSelected([]);
    action.reset();
  }
  async function columns(text: string, separator: string) {
    setBusy(true);
    setError(undefined);
    revise();
    setHeaders([]);
    setMapping({});
    try {
      const data = await apiClient.post<{
        headers: string[];
        mapping: Record<Field, string>;
      }>("/imports/columns", { csv: text, delimiter: separator });
      setCsv(text);
      setHeaders(data.headers);
      setMapping(data.mapping);
    } catch (error) {
      setCsv("");
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function load(file: File) {
    if (file.size > 200_000 || file.size === 0) {
      setError(new Error("Choose a nonempty CSV up to 200 KB."));
      return;
    }
    setFileName(file.name);
    try {
      await columns(await file.text(), delimiter);
    } catch (error) {
      setError(error);
    }
  }
  async function review() {
    setBusy(true);
    setError(undefined);
    action.reset();
    try {
      const data = await apiClient.post<Preview>("/imports/preview", {
        csv,
        accountId,
        mapping,
        delimiter,
        dateFormat,
        decimalSeparator,
        defaultType,
      });
      setPreview(data);
      setAllowDuplicates(false);
      setSelected(
        data.rows
          .filter((row) => row.data && !row.data.duplicate)
          .map((row) => row.rowNumber),
      );
    } catch (error) {
      setError(error);
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || action.isPending;
  return (
    <Modal
      title="Import transactions from CSV"
      busy={action.isPending}
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-4">
          <p role="status">
            Imported {result.created} transactions. Skipped {result.skipped}{" "}
            matching rows.
          </p>
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            Import one account at a time, up to 500 rows. Nothing is posted
            until you review and confirm. Transfers and generated shared-expense
            entries use their own workflows.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="label">
              Destination account
              <select
                className="field"
                value={accountId}
                disabled={disabled}
                onChange={(e) => {
                  setAccount(e.target.value);
                  revise();
                }}
              >
                <option value="">
                  <T text="Choose account" />
                </option>
                {accounts
                  .filter(
                    (a) =>
                      !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(
                        a.type,
                      ),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </select>
            </label>
            <label className="label">
              Column separator
              <select
                className="field"
                value={delimiter}
                disabled={disabled}
                onChange={(e) => {
                  const value = e.target.value;
                  setDelimiter(value);
                  if (csv) void columns(csv, value);
                }}
              >
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value={"\t"}>Tab</option>
              </select>
            </label>
          </div>
          <label className="label">
            CSV file
            <input
              className="w-full min-w-0 max-w-full text-sm"
              type="file"
              accept=".csv,text/csv,text/plain"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (file) void load(file);
              }}
            />
          </label>
          {fileName && (
            <p className="text-xs text-text-secondary break-all">{fileName}</p>
          )}
          {headers.length > 0 && (
            <>
              <fieldset className="min-w-0 grid grid-cols-2 gap-3">
                <legend className="font-semibold mb-2">
                  Match your columns
                </legend>
                {fields.map((key) => (
                  <label className="label capitalize" key={key}>
                    {key}
                    {["date", "amount"].includes(key) ? " *" : ""}
                    <select
                      className="field normal-case"
                      disabled={disabled}
                      value={mapping[key] ?? ""}
                      onChange={(e) => {
                        setMapping({ ...mapping, [key]: e.target.value });
                        revise();
                      }}
                    >
                      <option value="">
                        {key === "date" || key === "amount"
                          ? "Choose column"
                          : "Ignore / default"}
                      </option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="label">
                  Date format
                  <select
                    className="field"
                    disabled={disabled}
                    value={dateFormat}
                    onChange={(e) => {
                      setDateFormat(e.target.value);
                      revise();
                    }}
                  >
                    <option value="ISO">YYYY-MM-DD / ISO</option>
                    <option value="DMY">Day / month / year</option>
                    <option value="MDY">Month / day / year</option>
                  </select>
                </label>
                <label className="label">
                  Decimal separator
                  <select
                    className="field"
                    disabled={disabled}
                    value={decimalSeparator}
                    onChange={(e) => {
                      setDecimal(e.target.value);
                      revise();
                    }}
                  >
                    <option value=".">Point (12.50)</option>
                    <option value=",">Comma (12,50)</option>
                  </select>
                </label>
                <label className="label">
                  Without type column
                  <select
                    className="field"
                    disabled={disabled}
                    value={defaultType}
                    onChange={(e) => {
                      setDefaultType(e.target.value);
                      revise();
                    }}
                  >
                    <option value="SIGNED">
                      Negative expense, positive income
                    </option>
                    <option value="EXPENSE">All expenses</option>
                    <option value="INCOME">All income</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-text-secondary">
                Amounts must have no thousands separators. Date-only rows are
                recorded at noon in your saved timezone; timestamps must include
                an offset. Unknown categories must be created first or
                explicitly ignored.
              </p>
              <button
                className="btn-secondary w-full"
                disabled={
                  disabled || !accountId || !mapping.date || !mapping.amount
                }
                onClick={() => void review()}
              >
                {busy ? "Checking file…" : "Preview import"}
              </button>
            </>
          )}
          {preview && (
            <section className="space-y-3">
              <h3 className="font-semibold">
                Review {preview.rows.length} rows · {preview.currency}
              </h3>
              <p className="text-xs text-text-secondary">
                Timezone: {preview.timezone}. Invalid rows are excluded.
                Matching rows are unchecked by default. Existing matches are
                checked again atomically when posting.
              </p>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={allowDuplicates}
                  onChange={(e) => {
                    setAllowDuplicates(e.target.checked);
                    if (!e.target.checked)
                      setSelected(
                        selected.filter(
                          (n) =>
                            !preview.rows.find((r) => r.rowNumber === n)?.data
                              ?.duplicate,
                        ),
                      );
                  }}
                />
                Allow selected matching rows as new transactions
              </label>
              <div className="max-h-72 overflow-y-auto space-y-2 border border-border-soft rounded-xl p-3">
                {preview.rows.map((row) => (
                  <label
                    key={row.rowNumber}
                    className="flex gap-3 border-b border-border-soft pb-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      disabled={
                        disabled ||
                        !row.data ||
                        (row.data.duplicate && !allowDuplicates)
                      }
                      checked={selected.includes(row.rowNumber)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, row.rowNumber]
                            : selected.filter((n) => n !== row.rowNumber),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="font-medium">Row {row.rowNumber}</span>
                      {row.error ? (
                        <span className="block text-negative">{row.error}</span>
                      ) : (
                        row.data && (
                          <>
                            <span className="block">
                              {date(row.data.dateTime)} · {row.data.type} ·{" "}
                              {money(row.data.amount, preview.currency)}
                            </span>
                            <span className="block break-words text-text-secondary">
                              {row.data.notes || "No notes"}
                            </span>
                            {row.data.duplicate && (
                              <span className="block text-text-secondary">
                                Matches an existing or earlier CSV row
                              </span>
                            )}
                          </>
                        )
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <button
                className="btn w-full"
                disabled={disabled || selected.length === 0}
                onClick={() => action.mutate(undefined)}
              >
                {action.isPending
                  ? "Importing…"
                  : `Import ${selected.length} selected transactions`}
              </button>
              <p className="text-xs text-text-secondary">
                If a request times out, retry this same import. Starting a new
                preview creates a new batch; check history before intentionally
                including matching rows again.
              </p>
            </section>
          )}
          <ErrorMessage error={error || action.error} />
        </>
      )}
    </Modal>
  );
}
