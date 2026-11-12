import DecimalBase from "decimal.js";
const Decimal = DecimalBase.clone({ precision: 60 });
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
  n: DecimalBase,
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
  } else if (
    c.kind === "PERSONAL_ENTRY_CREATE" ||
    c.kind === "PERSONAL_ENTRY_UPDATE"
  ) {
    const parties = input.allocations as {
      accountId: string;
      amount: number;
    }[];
    const total = amount(input.totalAmount);
    if (
      !Array.isArray(parties) ||
      parties.length < 1 ||
      parties.length > 20 ||
      new Set(parties.map((p) => p.accountId)).size !== parties.length
    )
      throw Error("Choose 1–20 distinct accounts");
    if (
      !parties
        .reduce((n, p) => n.plus(amount(p.amount)), new Decimal(0))
        .eq(total) ||
      input.currency !== w.profile.displayCurrency
    )
      throw Error(
        "Account allocations must exactly equal the total in your accounting currency",
      );
    const sourceId = c.kind === "PERSONAL_ENTRY_UPDATE" ? String(id) : c.id;
    if (c.kind === "PERSONAL_ENTRY_UPDATE") {
      if (!w.tables.personal_entries?.some((e) => e.id === id && !e.deleted_at))
        throw Error("Entry source is unavailable");
      for (const t of [...w.tables.transactions].filter(
        (t) => t.source_type === "PERSONAL_ENTRY" && t.source_id === id,
      )) {
        if (
          w.tables.receipt_attachments?.some((r) => r.transaction_id === t.id)
        )
          throw Error("Remove receipts first");
        reverse(w, t.id);
      }
    }
    for (let i = 0; i < parties.length; i++)
      entry(
        w,
        c,
        account(w, parties[i].accountId),
        amount(parties[i].amount),
        String(input.type),
        "PERSONAL_ENTRY",
        `-${i}`,
        sourceId,
      );
    const saved = {
      id: sourceId,
      type: input.type,
      total_amount: total.toNumber(),
      currency: input.currency,
      date_time: input.dateTime,
      notes: input.notes,
      updated_at: now,
      deleted_at: null,
    };
    const old = w.tables.personal_entries?.find((e) => e.id === id);
    if (old) Object.assign(old, saved);
    else (w.tables.personal_entries ??= []).push(saved);
  } else if (c.kind === "PERSONAL_ENTRY_DELETE") {
    const old = w.tables.personal_entries?.find((e) => e.id === id);
    if (!old || old.deleted_at) throw Error("Entry source is unavailable");
    for (const t of [...w.tables.transactions].filter(
      (t) => t.source_type === "PERSONAL_ENTRY" && t.source_id === id,
    )) {
      if (w.tables.receipt_attachments?.some((r) => r.transaction_id === t.id))
        throw Error("Remove receipts first");
      reverse(w, t.id);
    }
    old.deleted_at = now;
  } else if (c.kind === "CONVERSION_DELETE") {
    const source = w.tables.currency_conversions?.find(
      (x) => x.id === id && !x.deleted_at,
    );
    if (!source) throw Error("Conversion is unavailable");
    if (
      w.tables.receipt_attachments?.some(
        (r) => r.transaction_id === source.transaction_id,
      )
    )
      throw Error("Remove receipts first");
    reverse(w, source.transaction_id);
    source.deleted_at = now;
    source.transaction_id = null;
  } else if (c.kind === "CONVERSION_CREATE" || c.kind === "CONVERSION_UPDATE") {
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
    const prior =
      c.kind === "CONVERSION_UPDATE"
        ? w.tables.currency_conversions?.find(
            (x) => x.id === id && !x.deleted_at,
          )
        : undefined;
    if (c.kind === "CONVERSION_UPDATE" && !prior)
      throw Error("Conversion is unavailable");
    let originalId: unknown;
    if (prior) {
      originalId = prior.transaction_id;
      reverse(w, originalId);
    }
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
    if (originalId) row.id = String(originalId);
    const conversion = {
      id: c.id,
      transaction_id: row.id,
      original_currency: original,
      original_amount: n.toNumber(),
      base_currency: base,
      base_amount: total.toNumber(),
      exchange_rate: rate.toNumber(),
      rate_date: input.rateDate,
      rate_source: input.rateSource,
      updated_at: now,
      deleted_at: null,
    };
    if (prior) Object.assign(prior, { ...conversion, id: prior.id });
    else (w.tables.currency_conversions ??= []).push(conversion);
    row.source_id = String(prior?.id ?? c.id);
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
        : kind.startsWith("PERSONAL_ENTRY_")
          ? "personal_entries"
          : kind.startsWith("CONVERSION_")
            ? "currency_conversions"
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
    net = net.plus(
      new Decimal(String(a.balance)).mul(
        ["CREDIT_CARD", "LOAN", "ACCOUNTS_PAYABLE"].includes(String(a.type))
          ? -1
          : 1,
      ),
    );
  }
  for (const asset of w.tables.personal_assets ?? []) {
    if (asset.account_id) continue;
    const latest = (w.tables.asset_valuations ?? [])
      .filter((v) => v.asset_id === asset.id)
      .sort((a, b) =>
        String(b.value_date).localeCompare(String(a.value_date)),
      )[0];
    if (latest) net = net.plus(String(latest.value));
  }
  for (const loan of w.tables.personal_loans ?? []) {
    const repaid = (w.tables.loan_payments ?? [])
      .filter((p) => p.loan_id === loan.id && !p.reversed_at)
      .reduce((n, p) => n.plus(String(p.principal)), new Decimal(0));
    net = net.plus(
      new Decimal(String(loan.principal))
        .minus(repaid)
        .mul(loan.direction === "LENT" ? 1 : -1),
    );
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
