import Decimal from "decimal.js";
import { z } from "zod";
export const importFields = [
  "date",
  "amount",
  "type",
  "notes",
  "category",
  "currency",
  "source",
  "account",
] as const;
export type ImportField = (typeof importFields)[number];
export interface ImportRow {
  rowNumber: number;
  amount: number;
  type: "INCOME" | "EXPENSE";
  localDate?: string;
  dateTime?: string;
  notes: string;
  currency: string;
  categoryId: string | null;
}
export function parseCsv(text: string, delimiter = ",") {
  if (Buffer.byteLength(text, "utf8") > 200_000)
    throw new Error("CSV files must be at most 200 KB.");
  if (![",", ";", "\t"].includes(delimiter))
    throw new Error("Unsupported delimiter.");
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  function cell() {
    row.push(field);
    field = "";
    closed = false;
    if (row.length > 40) throw new Error("Use at most 40 columns.");
  }
  function record() {
    cell();
    if (row.some((v) => v.trim())) records.push(row);
    row = [];
    if (records.length > 501)
      throw new Error("Import at most 500 rows at a time.");
  }
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += ch;
    } else if (ch === delimiter) cell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record();
    } else if (ch === '"' && !field && !closed) quoted = true;
    else if (closed && /\s/.test(ch)) continue;
    else if (ch === '"' || closed) throw new Error("Malformed CSV quoting.");
    else field += ch;
  }
  if (quoted) throw new Error("A quoted CSV field was not closed.");
  if (field || row.length || closed) record();
  if (records.length < 2)
    throw new Error("Include a header and at least one data row.");
  const headers = records.shift()!.map((v) => v.trim());
  if (
    headers.some((h) => !h || h.length > 200) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Column headers must be nonempty and unique.");
  return { headers, records };
}
const aliases: Record<ImportField, string[]> = {
  date: ["dateutc", "datetime", "date", "transactiondate", "posteddate"],
  amount: ["amount", "value"],
  type: ["type", "transactiontype"],
  notes: ["notes", "description", "memo", "payee"],
  category: ["category"],
  currency: ["currency"],
  source: ["source"],
  account: ["account"],
};
export function suggestMapping(headers: string[]) {
  return Object.fromEntries(
    importFields.map((field) => [
      field,
      aliases[field]
        .map((alias) =>
          headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === alias),
        )
        .find(Boolean) ?? "",
    ]),
  ) as Record<ImportField, string>;
}
function validDate(value: string) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function parseImportDate(value: string, format: "ISO" | "DMY" | "MDY") {
  if (validDate(value)) return { localDate: value };
  if (z.iso.datetime({ offset: true }).safeParse(value).success)
    // Preserve sub-millisecond precision for exported PostgreSQL timestamps.
    // Converting through Date would silently change duplicate identity.
    return { dateTime: value };
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-]([1-9]\d{3})$/);
  if (format !== "ISO" && match) {
    const date = `${match[3]}-${(format === "DMY" ? match[2] : match[1]).padStart(2, "0")}-${(format === "DMY" ? match[1] : match[2]).padStart(2, "0")}`;
    if (validDate(date)) return { localDate: date };
  }
  throw new Error(
    "Use a valid date matching the chosen format, or an ISO timestamp with timezone.",
  );
}
export function prepareImport(
  csv: string,
  options: {
    delimiter: string;
    dateFormat: "ISO" | "DMY" | "MDY";
    decimalSeparator: "." | ",";
    defaultType: "SIGNED" | "INCOME" | "EXPENSE";
    mapping?: Partial<Record<ImportField, string>>;
    account: { name: string; currency: string };
    categories: { id: string; name: string; type: string }[];
  },
) {
  const { headers, records } = parseCsv(csv, options.delimiter);
  const mapping = { ...suggestMapping(headers), ...options.mapping };
  for (const name of Object.values(mapping))
    if (name && !headers.includes(name))
      throw new Error(
        "A mapped column no longer exists. Preview the file again.",
      );
  if (!mapping.date || !mapping.amount)
    throw new Error("Map both the date and amount columns.");
  return {
    headers,
    mapping,
    rows: records.map((record, index) => {
      const rowNumber = index + 2;
      const get = (key: ImportField) =>
        mapping[key]
          ? (record[headers.indexOf(mapping[key])] ?? "").trim()
          : "";
      try {
        if (record.length !== headers.length)
          throw new Error("Column count does not match the header.");
        const rawAmount = get("amount");
        if (
          !(
            options.decimalSeparator === ","
              ? /^[+-]?\d+(,\d{1,2})?$/
              : /^[+-]?\d+(\.\d{1,2})?$/
          ).test(rawAmount)
        )
          throw new Error(
            "Use a plain amount without thousands separators, with at most two decimal places.",
          );
        const amount = new Decimal(rawAmount.replace(",", "."));
        if (!amount.isFinite() || amount.isZero() || amount.abs().gte(1e12))
          throw new Error("Amount must be nonzero and less than 1 trillion.");
        const source = get("source").toUpperCase();
        if (["SPLIT", "SETTLEMENT", "TRANSFER"].includes(source))
          throw new Error(
            "Generated split, settlement and transfer entries cannot be imported as manual transactions.",
          );
        const kind = get("type").toUpperCase();
        const type = kind
          ? (
              {
                INCOME: "INCOME",
                EXPENSE: "EXPENSE",
                CREDIT: "INCOME",
                DEBIT: "EXPENSE",
              } as const
            )[kind as "INCOME"]
          : options.defaultType === "SIGNED"
            ? amount.isNegative()
              ? "EXPENSE"
              : "INCOME"
            : options.defaultType;
        if (!type)
          throw new Error(
            "Type must be INCOME/EXPENSE or CREDIT/DEBIT; transfers need the transfer workflow.",
          );
        const currency =
          get("currency").toUpperCase() || options.account.currency;
        if (currency !== options.account.currency)
          throw new Error(
            "Currency differs from the selected account. Currency conversion is not supported.",
          );
        if (get("account") && get("account") !== options.account.name)
          throw new Error(
            "This row belongs to another account. Import one account at a time or explicitly ignore the account column.",
          );
        const matching = options.categories.filter(
          (c) =>
            c.name.toLowerCase() === get("category").toLowerCase() &&
            c.type === type,
        );
        if (get("category") && matching.length !== 1)
          throw new Error(
            "Category is missing, incompatible or ambiguous. Create it first, or ignore the category column.",
          );
        const notes = get("notes");
        if (notes.length > 500)
          throw new Error("Notes must be at most 500 characters.");
        const data: ImportRow = {
          rowNumber,
          amount: amount.abs().toNumber(),
          type,
          ...parseImportDate(get("date"), options.dateFormat),
          currency,
          notes,
          categoryId: matching[0]?.id ?? null,
        };
        return { rowNumber, data };
      } catch (error) {
        return {
          rowNumber,
          error: error instanceof Error ? error.message : "Invalid CSV row",
        };
      }
    }),
  };
}
