import Decimal from "decimal.js";
import { Workspace, PendingCommand } from "./vault";
type Row = Record<string, unknown>;
function amount(value: unknown, digits = 2) {
  const n = new Decimal(String(value));
  if (!n.isFinite() || n.lte(0) || n.gte(1e12) || n.decimalPlaces() > digits)
    throw Error(
      `Enter a positive amount with at most ${digits} decimal places`,
    );
  return n;
}
const liability = (a: Row) => ["CREDIT_CARD", "LOAN"].includes(String(a.type));
function account(w: Workspace, id: unknown) {
  const a = w.tables.accounts?.find((a) => a.id === id);
  if (
    !a ||
    ["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(String(a.type))
  )
    throw Error("Choose an available personal account");
  if (a.currency !== w.profile.displayCurrency)
    throw Error("Account currency mismatch");
  return a;
}
function category(w: Workspace, id: unknown, type: unknown) {
  if (id && !w.tables.categories?.some((c) => c.id === id && c.type === type))
    throw Error("Choose a compatible category");
}
function entry(
  w: Workspace,
  c: PendingCommand,
  a: Row,
  n: Decimal,
  type: string,
  source = "MANUAL",
  suffix = "",
  sourceId?: string,
) {
  if (!["INCOME", "EXPENSE", "TRANSFER"].includes(type))
    throw Error("Invalid entry type");
  const d =
    type === "TRANSFER"
      ? n
      : (type === "INCOME") !== liability(a)
        ? n
        : n.neg();
  const input = c.payload.input as Row;
  category(w, input.categoryId, type);
  const row = {
    id: c.id + suffix,
    user_id: w.ownerId ?? w.id,
    account_id: a.id,
    category_id: input.categoryId ?? null,
    type,
    amount: n.abs().toNumber(),
    balance_delta: d.toNumber(),
    analytics_amount: type === "TRANSFER" ? 0 : n.abs().toNumber(),
    source_type: source,
    source_id: sourceId ?? null,
    date_time: input.dateTime,
    notes: input.notes ?? "",
    tags: input.tags ?? [],
    updated_at: c.createdAt,
    created_at: c.createdAt,
    pending: w.mode === "CLOUD",
  };
  if (!row.date_time || !Number.isFinite(Date.parse(String(row.date_time))))
    throw Error("Choose a valid date");
  a.balance = new Decimal(String(a.balance)).plus(d).toNumber();
  (w.tables.transactions ??= []).push(row);
  return row;
}
function reverse(w: Workspace, id: unknown) {
  const row = w.tables.transactions?.find((t) => t.id === id);
  if (!row) throw Error("Entry not found");
  const a = account(w, row.account_id);
  a.balance = new Decimal(String(a.balance))
    .minus(String(row.balance_delta))
    .toNumber();
  w.tables.transactions = w.tables.transactions.filter((t) => t.id !== id);
  return row;
}
export function applyCommand(w: Workspace, c: PendingCommand) {
  const input = (c.payload.input ?? {}) as Row,
    id = c.payload.id,
    now = c.createdAt;
  if (c.kind === "TX_CREATE" || c.kind === "TX_UPDATE") {
    if (c.kind === "TX_UPDATE") {
      const old = w.tables.transactions?.find((t) => t.id === id);
      if (!old || old.source_type !== "MANUAL")
        throw Error("Edit generated entries from their source");
      reverse(w, id);
    }
    entry(
      w,
      c,
      account(w, input.accountId),
      amount(input.amount),
      String(input.type),
    );
    if (c.kind === "TX_UPDATE")
      w.tables.transactions[w.tables.transactions.length - 1].id = String(id);
  } else if (c.kind === "TX_DELETE") {
    const old = w.tables.transactions?.find((t) => t.id === id);
    if (old?.source_type !== "MANUAL")
      throw Error("Delete generated entries from their source");
    if (w.tables.receipt_attachments?.some((r) => r.transaction_id === id))
      throw Error("Remove receipts first");
    reverse(w, id);
  } else if (c.kind === "TRANSFER") {
    if (input.sourceAccountId === input.targetAccountId)
      throw Error("Choose different accounts");
    const from = account(w, input.sourceAccountId),
      to = account(w, input.targetAccountId),
      n = amount(input.amount);
    entry(
      w,
      c,
      from,
      liability(from) ? n : n.neg(),
      "TRANSFER",
      "TRANSFER",
      "-from",
      c.id,
    );
    entry(
      w,
      c,
      to,
      liability(to) ? n.neg() : n,
      "TRANSFER",
      "TRANSFER",
      "-to",
      c.id,
    );
  } else if (c.kind === "CONVERSION_CREATE") {
    const original = String(input.originalCurrency),
      base = w.profile.displayCurrency;
    if (
      original === base ||
      !Intl.supportedValuesOf("currency").includes(original)
    )
      throw Error("Choose distinct supported currencies");
    const units = new Intl.NumberFormat("en", {
      style: "currency",
      currency: original,
    }).resolvedOptions().maximumFractionDigits!;
    const n = amount(input.originalAmount, units),
      rate = new Decimal(String(input.exchangeRate)),
      digits = new Intl.NumberFormat("en", {
        style: "currency",
        currency: base,
      }).resolvedOptions().maximumFractionDigits!;
    if (!rate.isFinite() || rate.lte(0) || rate.gte(1e12))
      throw Error("Invalid exchange rate");
    const total = n.mul(rate).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP);
    if (total.lte(0) || total.gte(1e12))
      throw Error("Converted amount out of range");
    if (
      typeof input.rateDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.rateDate) ||
      input.rateDate > now.slice(0, 10)
    )
      throw Error("Invalid rate date");
    const row = entry(
      w,
      c,
      account(w, input.accountId),
      total,
      String(input.type),
      "CONVERSION",
      "",
      c.id,
    );
    (w.tables.currency_conversions ??= []).push({
      id: c.id,
      transaction_id: row.id,
      original_currency: original,
      original_amount: n.toNumber(),
      base_currency: base,
      base_amount: total.toNumber(),
      exchange_rate: rate.toNumber(),
      rate_date: input.rateDate,
      rate_source: input.rateSource,
    });
  } else if (c.kind === "ACCOUNT_CREATE") {
    if (
      !String(input.name ?? "").trim() ||
      ![
        "CASH",
        "BANK_ACCOUNT",
        "PREPAID_CARD",
        "INVESTMENT",
        "CREDIT_CARD",
        "LOAN",
      ].includes(String(input.type))
    )
      throw Error("Enter an account name and type");
    const n = new Decimal(String(input.balance ?? 0));
    if (!n.isFinite() || n.abs().gte(1e12) || n.decimalPlaces() > 2)
      throw Error("Invalid opening balance");
    (w.tables.accounts ??= []).push({
      id: c.id,
      user_id: w.ownerId ?? w.id,
      name: String(input.name).trim(),
      type: input.type,
      currency: w.profile.displayCurrency,
      balance: n.toNumber(),
      updated_at: now,
      is_default: false,
    });
  } else if (c.kind === "ACCOUNT_UPDATE") {
    const a = account(w, id);
    if (a.is_default) throw Error("System account cannot be modified");
    if (input.name !== undefined) {
      if (!String(input.name).trim()) throw Error("Enter an account name");
      a.name = String(input.name).trim();
    }
    a.updated_at = now;
  } else if (c.kind === "ACCOUNT_DELETE") {
    const a = account(w, id);
    if (
      a.is_default ||
      w.tables.transactions?.some((t) => t.account_id === id) ||
      w.tables.savings_goals?.some((t) => t.account_id === id)
    )
      throw Error("Account has financial references");
    w.tables.accounts = w.tables.accounts.filter((a) => a.id !== id);
  } else if (c.kind === "CATEGORY_CREATE" || c.kind === "CATEGORY_UPDATE") {
    if (
      !String(input.name ?? "").trim() ||
      !["INCOME", "EXPENSE", "TRANSFER"].includes(String(input.type))
    )
      throw Error("Enter a category name and type");
    if (
      input.parentId &&
      !w.tables.categories?.some(
        (c) =>
          c.id === input.parentId &&
          c.type === input.type &&
          !c.parent_id &&
          c.id !== id,
      )
    )
      throw Error("Choose a compatible top-level category");
    if (c.kind === "CATEGORY_UPDATE") {
      const old = w.tables.categories?.find((t) => t.id === id);
      if (!old || old.user_id === null)
        throw Error("System categories cannot be edited");
      Object.assign(old, {
        name: input.name,
        type: input.type,
        parent_id: input.parentId ?? null,
        updated_at: now,
      });
    } else
      (w.tables.categories ??= []).push({
        id: c.id,
        user_id: w.ownerId ?? w.id,
        name: input.name,
        type: input.type,
        parent_id: input.parentId ?? null,
        updated_at: now,
      });
  } else if (c.kind === "CATEGORY_DELETE") {
    const old = w.tables.categories?.find((t) => t.id === id);
    if (!old || old.user_id === null)
      throw Error("System categories cannot be removed");
    w.tables.categories = w.tables.categories.filter((c) => c.id !== id);
    for (const rows of Object.values(w.tables))
      for (const r of rows) {
        if (r.category_id === id) r.category_id = null;
        if (r.parent_id === id) r.parent_id = null;
      }
  } else if (c.kind.startsWith("SPLIT_") || c.kind === "SETTLEMENT") {
    if (w.mode !== "CLOUD")
      throw Error(
        "Shared operations require a cloud identity",
      ); /* No local ledger effect: server must validate current debts and membership. */
  } else throw Error("This operation is not available in the device editor");
}
export function queueCommand(
  w: Workspace,
  kind: string,
  input: Row,
  id?: string,
) {
  const table = kind.startsWith("TX_")
    ? "transactions"
    : kind.startsWith("ACCOUNT_")
      ? "accounts"
      : kind.startsWith("CATEGORY_")
        ? "categories"
        : kind.startsWith("SPLIT_")
          ? "split_expenses"
          : undefined;
  const prior =
    table && id ? w.tables[table]?.find((r) => r.id === id) : undefined;
  const command: PendingCommand = {
    id: crypto.randomUUID(),
    kind,
    payload: { input, ...(id ? { id } : {}) },
    expectedUpdatedAt: prior?.updated_at as string | undefined,
    createdAt: new Date().toISOString(),
    status: "PENDING",
  };
  applyCommand(w, command);
  if (w.mode === "CLOUD") w.commands.push(command);
  return command;
}
export function ledgerSummary(w: Workspace) {
  let net = new Decimal(0),
    income = new Decimal(0),
    expense = new Decimal(0);
  for (const a of w.tables.accounts ?? []) {
    if (["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(String(a.type)))
      continue;
    net = net.plus(new Decimal(String(a.balance)).mul(liability(a) ? -1 : 1));
  }
  for (const t of w.tables.transactions ?? []) {
    if (t.type === "INCOME") income = income.plus(String(t.analytics_amount));
    if (t.type === "EXPENSE")
      expense = expense.plus(String(t.analytics_amount));
  }
  return {
    net: net.toNumber(),
    income: income.toNumber(),
    expense: expense.toNumber(),
  };
}
