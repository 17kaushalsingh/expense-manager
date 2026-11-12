import Decimal from "decimal.js";
import type { Workspace } from "./vault";
import { recurrenceDate } from "./recurrence";
type Row = Record<string, unknown>;
function local(w: Workspace) {
  if (!["LOCAL", "CLOUD"].includes(w.mode))
    throw Error("Unlock a device workspace");
}
function enqueue(
  w: Workspace,
  kind: string,
  input: Row = {},
  id?: string,
  localId?: string,
  extra: Row = {},
) {
  if (w.mode !== "CLOUD") return;
  w.commands.push({
    id: crypto.randomUUID(),
    kind,
    payload: {
      input,
      ...(id ? { id } : {}),
      ...(localId ? { localId } : {}),
      ...extra,
    },
    createdAt: new Date().toISOString(),
    status: "PENDING",
  });
}
function loanBody(l: Row) {
  return {
    name: l.name,
    counterparty: l.counterparty,
    firstDueDate: l.first_due_date ?? null,
    frequency: l.frequency ?? "MONTHLY",
    installmentCount: l.installment_count ?? 1,
    notes: l.notes ?? "",
    archived: !!l.archived,
  };
}
function billBody(s: Row) {
  return {
    name: s.name,
    type: s.type,
    amount: s.amount,
    currency: s.currency,
    categoryId: s.category_id ?? null,
    accountId: s.account_id ?? null,
    frequency: s.frequency,
    startDate: s.start_date,
    endDate: s.end_date ?? null,
    timezone: s.timezone,
    status: s.status,
    notes: s.notes ?? "",
  };
}
function num(v: unknown, zero = false) {
  const n = new Decimal(String(v));
  if (
    !n.isFinite() ||
    n.lt(zero ? 0 : 0.01) ||
    n.gte(1e12) ||
    n.decimalPlaces() > 2
  )
    throw Error("Enter a valid amount with at most two decimals");
  return n;
}
function day(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw Error("Choose a valid calendar date");
  return value;
}
export function deviceDay(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function localNoon(date: string, zone: string) {
  day(date);
  const target = Date.parse(`${date}T12:00:00Z`);
  let at = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const get = (key: string) =>
      Number(parts.find((p) => p.type === key)!.value);
    const rendered = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    const delta = rendered - target;
    if (!delta) {
      if (deviceDay(new Date(at), zone) !== date) break;
      return new Date(at).toISOString();
    }
    at -= delta;
  }
  throw Error("This calendar day is not available in the selected timezone");
}
function post(
  w: Workspace,
  accountId: unknown,
  n: Decimal,
  type: string,
  source: string,
  sourceId: string,
  date: string,
  notes: unknown,
  categoryId?: unknown,
) {
  const a = w.tables.accounts?.find((a) => a.id === accountId);
  if (
    !a ||
    ["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(String(a.type))
  )
    throw Error("Choose a personal account");
  if (a.currency !== w.profile.displayCurrency)
    throw Error("Currency mismatch");
  if (
    categoryId &&
    !w.tables.categories?.some((c) => c.id === categoryId && c.type === type)
  )
    throw Error("Choose a compatible category");
  let delta = type === "EXPENSE" ? n.neg() : n;
  if (["CREDIT_CARD", "LOAN"].includes(String(a.type))) delta = delta.neg();
  a.balance = new Decimal(String(a.balance)).plus(delta).toNumber();
  const id = crypto.randomUUID();
  (w.tables.transactions ??= []).push({
    id,
    user_id: w.ownerId ?? w.id,
    account_id: a.id,
    type,
    amount: n.toNumber(),
    balance_delta: delta.toNumber(),
    analytics_amount: type === "TRANSFER" ? 0 : n.toNumber(),
    source_type: source,
    source_id: sourceId,
    date_time: date,
    notes,
    category_id: categoryId ?? null,
    tags: [],
    updated_at: new Date().toISOString(),
  });
  return id;
}
function cash(
  w: Workspace,
  account: unknown,
  n: Decimal,
  incoming: boolean,
  source: string,
  id: string,
  date: string,
  note: unknown,
) {
  if(!w.tables.accounts?.some(a=>a.id===account&&["CASH","BANK_ACCOUNT","PREPAID_CARD","INVESTMENT"].includes(String(a.type))))throw Error("Choose an owned cash or asset account");
  const tx = post(
    w,
    account,
    n,
    incoming ? "INCOME" : "EXPENSE",
    source,
    id,
    date,
    note,
  );
  const row = w.tables.transactions.find((t) => t.id === tx)!;
  row.type = "TRANSFER";
  row.analytics_amount = 0;
  return tx;
}
function undo(w: Workspace, ids: string[]) {
  for (const id of ids) {
    const tx = w.tables.transactions?.find((t) => t.id === id);
    if (!tx) throw Error("Original financial entry is missing");
    if (
      w.tables.receipt_attachments?.some((r) => r.transaction_id === id) ||
      w.tables.event_transactions?.some((r) => r.transaction_id === id)
    )
      throw Error("Remove receipt or event references first");
    const a = w.tables.accounts?.find((a) => a.id === tx.account_id);
    if (!a) throw Error("Account is unavailable");
    a.balance = new Decimal(String(a.balance))
      .minus(String(tx.balance_delta))
      .toNumber();
  }
  w.tables.transactions = w.tables.transactions.filter(
    (t) => !ids.includes(String(t.id)),
  );
}
export function createLocalLoan(w: Workspace, p: Row) {
  local(w);
  const principal = num(p.principal),
    id = crypto.randomUUID(),
    date = day(p.startDate);
  if (
    !String(p.name ?? "").trim() ||
    !String(p.counterparty ?? "").trim() ||
    !["LENT", "BORROWED"].includes(String(p.direction))
  )
    throw Error("Enter a name, counterparty and direction");
  const tx = p.accountId
    ? cash(
        w,
        p.accountId,
        principal,
        p.direction === "BORROWED",
        "PERSONAL_LOAN",
        id,
        localNoon(date, w.profile.timezone),
        p.name,
      )
    : null;
  const loan = {
    id,
    name: p.name,
    counterparty: p.counterparty,
    direction: p.direction,
    principal: principal.toNumber(),
    start_date: date,
    currency: w.profile.displayCurrency,
    initial_transaction_id: tx,
    archived: false,
  };
  (w.tables.personal_loans ??= []).push(loan);
  enqueue(
    w,
    "LOAN_CREATE",
    {
      ...loanBody(loan),
      direction: loan.direction,
      principal: loan.principal,
      currency: loan.currency,
      startDate: date,
      accountId: p.accountId || null,
    },
    undefined,
    id,
  );
  return id;
}
export function loanOutstanding(w: Workspace, id: unknown) {
  const loan = w.tables.personal_loans?.find((l) => l.id === id);
  if (!loan) throw Error("Loan is unavailable");
  return new Decimal(String(loan.principal)).minus(
    (w.tables.loan_payments ?? [])
      .filter((p) => p.loan_id === id && !p.reversed_at)
      .reduce((n, p) => n.plus(String(p.principal)), new Decimal(0)),
  );
}
export function payLocalLoan(w: Workspace, id: string, p: Row) {
  local(w);
  const l = w.tables.personal_loans?.find((l) => l.id === id);
  if (!l) throw Error("Loan is unavailable");
  if (
    !w.tables.accounts?.some(
      (a) =>
        a.id === p.accountId &&
        ["CASH", "BANK_ACCOUNT", "PREPAID_CARD", "INVESTMENT"].includes(
          String(a.type),
        ),
    )
  )
    throw Error("Choose an owned cash or asset account");
  const principal = num(p.principal, true),
    interest = num(p.interest ?? 0, true),
    total = principal.plus(interest);
  if (total.lte(0) || principal.gt(loanOutstanding(w, id)))
    throw Error("Payment must be positive and cannot overpay principal");
  const date = day(p.date),
    pid = crypto.randomUUID(),
    ids: string[] = [];
  if (principal.gt(0))
    ids.push(
      cash(
        w,
        p.accountId,
        principal,
        l.direction === "LENT",
        "PERSONAL_LOAN",
        pid,
        localNoon(date, w.profile.timezone),
        l.name,
      ),
    );
  if (interest.gt(0))
    ids.push(
      post(
        w,
        p.accountId,
        interest,
        l.direction === "LENT" ? "INCOME" : "EXPENSE",
        "PERSONAL_LOAN",
        pid,
        localNoon(date, w.profile.timezone),
        `${l.name} · interest`,
        p.categoryId,
      ),
    );
  (w.tables.loan_payments ??= []).push({
    id: pid,
    loan_id: id,
    principal: principal.toNumber(),
    interest: interest.toNumber(),
    date_time: localNoon(date, w.profile.timezone),
    transaction_ids: ids,
    reversed_at: null,
  });
  enqueue(
    w,
    "LOAN_PAY",
    {
      principal: principal.toNumber(),
      interest: interest.toNumber(),
      accountId: p.accountId,
      dateTime: localNoon(date, w.profile.timezone),
      notes: p.notes ?? "",
    },
    id,
    pid,
  );
  return pid;
}
export function reverseLocalLoanPayment(w: Workspace, id: string) {
  local(w);
  const p = w.tables.loan_payments?.find((p) => p.id === id);
  if (!p) throw Error("Payment is unavailable");
  if (p.reversed_at) return;
  undo(
    w,
    Array.isArray(p.transaction_ids)
      ? (p.transaction_ids as string[])
      : (w.tables.transactions ?? [])
          .filter(
            (t) => t.source_type === "PERSONAL_LOAN" && t.source_id === id,
          )
          .map((t) => String(t.id)),
  );
  p.reversed_at = new Date().toISOString();
  const l = w.tables.personal_loans.find((l) => l.id === p.loan_id)!;
  l.archived = false;
  enqueue(w, "LOAN_REVERSE", {}, id, id);
}
export function archiveLocalLoan(w: Workspace, id: string) {
  local(w);
  if (!loanOutstanding(w, id).eq(0))
    throw Error("Repay the full principal before archiving");
  const l = w.tables.personal_loans.find((l) => l.id === id)!;
  l.archived = true;
  enqueue(w, "LOAN_ARCHIVE", loanBody(l), id, id, {
    expectedVersion: l.row_version,
  });
}
export function saveLocalBill(w: Workspace, p: Row, id?: string) {
  local(w);
  const existing = id
    ? w.tables.personal_bills?.find((b) => b.id === id)
    : undefined;
  if (id && !existing) throw Error("Bill is unavailable");
  if (
    !String(p.name ?? "").trim() ||
    !["INCOME", "EXPENSE"].includes(String(p.type))
  )
    throw Error("Enter a name and type");
  const start = day(p.startDate),
    end = p.endDate ? day(p.endDate) : null;
  if (end && end < start) throw Error("End must follow start");
  new Intl.DateTimeFormat("en", { timeZone: String(p.timezone) });
  recurrenceDate(start, String(p.frequency), 0);
  const amount = num(p.amount).toNumber();
  if (
    existing &&
    (existing.start_date !== start ||
      existing.frequency !== p.frequency ||
      existing.timezone !== p.timezone)
  )
    throw Error(
      "Archive this bill and create a new schedule to change its recurrence",
    );
  const row = {
    id: id ?? crypto.randomUUID(),
    name: p.name,
    type: p.type,
    amount,
    currency: w.profile.displayCurrency,
    account_id: p.accountId || null,
    category_id: p.categoryId || null,
    start_date: start,
    end_date: end,
    frequency: p.frequency,
    timezone: p.timezone,
    status: p.status ?? "ACTIVE",
    next_index: existing?.next_index ?? 0,
    notes: p.notes ?? "",
  };
  if (existing) Object.assign(existing, row);
  else (w.tables.personal_bills ??= []).push(row);
  enqueue(
    w,
    id ? "BILL_UPDATE" : "BILL_CREATE",
    billBody(row),
    id,
    String(row.id),
    { expectedVersion: existing?.row_version },
  );
  return row.id;
}
export function generateLocalBills(w: Workspace, now = new Date()) {
  local(w);
  let generated = 0;
  for (const s of w.tables.personal_bills ?? []) {
    if (s.status !== "ACTIVE") continue;
    const today = deviceDay(now, String(s.timezone));
    for (let n = 0; n < (w.mode === "CLOUD" ? 100 : 1000); n++) {
      const index = Number(s.next_index ?? 0),
        due = recurrenceDate(String(s.start_date), String(s.frequency), index);
      if (!due || (s.end_date && due > String(s.end_date))) {
        s.next_due_date = null;
        break;
      }
      if (due > today) break;
      if (
        !w.tables.bill_occurrences?.some(
          (d) => d.bill_id === s.id && d.occurrence_index === index,
        )
      ) {
        (w.tables.bill_occurrences ??= []).push({
          id: crypto.randomUUID(),
          bill_id: s.id,
          occurrence_index: index,
          due_date: due,
          review_date: due,
          timezone: s.timezone,
          status: "DUE",
          payload: structuredClone(s),
          transaction_id: null,
        });
        generated++;
      }
      s.next_index = index + 1;
    }
  }
  enqueue(w, "BILL_REFRESH");
  return generated;
}
export function setLocalBillStatus(
  w: Workspace,
  id: string,
  status: string,
  now = new Date(),
) {
  local(w);
  const s = w.tables.personal_bills?.find((b) => b.id === id);
  if (!s || !["ACTIVE", "PAUSED", "ARCHIVED"].includes(status))
    throw Error("Bill is unavailable");
  if (s.status === "ARCHIVED")
    throw Error("Archived schedules cannot be reactivated");
  if (s.status === "PAUSED" && status === "ACTIVE") {
    const today = deviceDay(now, String(s.timezone));
    for (let n = 0; n < 100000; n++) {
      const due = recurrenceDate(
        String(s.start_date),
        String(s.frequency),
        Number(s.next_index),
      );
      if (!due || due >= today) break;
      s.next_index = Number(s.next_index) + 1;
    }
  }
  s.status = status;
  if (status === "ARCHIVED")
    for (const d of w.tables.bill_occurrences ?? [])
      if (d.bill_id === id && d.status === "DUE") d.status = "SKIPPED";
  enqueue(w, "BILL_UPDATE", billBody(s), id, id, {
    expectedVersion: s.row_version,
  });
}
export function reviewLocalBill(
  w: Workspace,
  id: string,
  action: string,
  p: Row = {},
) {
  local(w);
  const d = w.tables.bill_occurrences?.find((d) => d.id === id);
  if (!d) throw Error("Occurrence is unavailable");
  const extra = { billId: d.bill_id, occurrenceIndex: d.occurrence_index };
  if (action === "REVERSE") {
    if (d.status === "REVERSED") return;
    if (d.status !== "RECORDED")
      throw Error("Only recorded bills can be reversed");
    undo(w, [String(d.transaction_id)]);
    d.status = "REVERSED";
    enqueue(w, "BILL_REVERSE", {}, undefined, id, extra);
    return;
  }
  if (d.status !== "DUE") {
    if (action === "RECORD" && d.status === "RECORDED") return;
    throw Error("This occurrence has already been reviewed");
  }
  if (action === "SKIP") {
    d.status = "SKIPPED";
    enqueue(w, "BILL_SKIP", {}, undefined, id, extra);
    return;
  }
  if (action === "POSTPONE") {
    const date = day(p.date),
      today = deviceDay(
        new Date(),
        String(d.timezone ?? (d.payload as Row).timezone ?? w.profile.timezone),
      );
    if (date < today) throw Error("Choose today or a later date");
    d.due_date = date;
    d.review_date = date;
    enqueue(w, "BILL_POSTPONE", { reviewDate: date }, undefined, id, extra);
    return;
  }
  if (action !== "RECORD") throw Error("Invalid review action");
  const body = d.payload as Row,
    amount = num(p.amount ?? body.amount);
  const dateTime = new Date().toISOString();
  d.transaction_id = post(
    w,
    p.accountId ?? body.account_id ?? body.accountId,
    amount,
    String(body.type),
    "PERSONAL_BILL",
    id,
    dateTime,
    body.name,
    p.categoryId ?? body.category_id ?? body.categoryId,
  );
  d.status = "RECORDED";
  enqueue(
    w,
    "BILL_RECORD",
    {
      accountId: p.accountId ?? body.account_id ?? body.accountId,
      amount: amount.toNumber(),
      dateTime,
      categoryId: p.categoryId ?? body.category_id ?? body.categoryId ?? null,
    },
    undefined,
    id,
    extra,
  );
}
export const localTables = [
  "budget_plans",
  "monthly_plans",
  "personal_assets",
  "asset_valuations",
  "savings_goals",
  "finance_events",
  "event_planned_costs",
  "reminders",
  "card_settings",
  "card_installments",
  "budget_overrides",
  "finance_preferences",
  "event_transactions",
] as const;
export function saveLocalRecord(
  w: Workspace,
  table: (typeof localTables)[number],
  p: Row,
  id?: string,
) {
  local(w);
  if (!localTables.includes(table)) throw Error("Unsupported resource");
  const name = table === "reminders" ? p.title : p.name;
  if (
    [
      "budget_plans",
      "personal_assets",
      "savings_goals",
      "finance_events",
      "event_planned_costs",
      "reminders",
    ].includes(table) &&
    (!String(name ?? "").trim() || String(name).length > 200)
  )
    throw Error("Enter a name of up to 200 characters");
  if (table === "budget_plans") {
    num(p.amount);
    const start = day(p.start_date),
      end = p.end_date ? day(p.end_date) : null;
    if (end && end < start) throw Error("End must follow start");
    if (
      ![
        "DAILY",
        "WEEKLY",
        "BIWEEKLY",
        "MONTHLY",
        "QUARTERLY",
        "YEARLY",
        "CUSTOM",
      ].includes(String(p.frequency)) ||
      (p.frequency === "CUSTOM" && !end)
    )
      throw Error("Choose a valid recurrence and end date for custom budgets");
    if (
      p.category_id &&
      !w.tables.categories?.some(
        (c) => c.id === p.category_id && c.type === "EXPENSE",
      )
    )
      throw Error("Budget category must be an expense category");
  }
  if (table === "savings_goals") {
    const a = w.tables.accounts?.find((a) => a.id === p.account_id);
    if (
      !a ||
      [
        "CREDIT_CARD",
        "LOAN",
        "ACCOUNTS_RECEIVABLE",
        "ACCOUNTS_PAYABLE",
      ].includes(String(a.type))
    )
      throw Error("Choose a personal asset account for this goal");
    if (
      w.tables.savings_goals?.some(
        (g) => g.id !== id && g.account_id === p.account_id,
      )
    )
      throw Error("This account is already linked to a goal");
  }
  if (table === "finance_events") {
    if (day(p.end_date) < day(p.start_date))
      throw Error("End must follow start");
  }
  if (table === "card_settings") {
    if (
      !w.tables.accounts?.some(
        (a) => a.id === p.account_id && a.type === "CREDIT_CARD",
      )
    )
      throw Error("Choose a credit-card account");
    num(p.credit_limit, true);
    for (const d of [p.statement_day, p.due_day])
      if (!Number.isInteger(Number(d)) || Number(d) < 1 || Number(d) > 31)
        throw Error("Card days must be whole numbers from 1 to 31");
    const same = w.tables.card_settings?.find(
      (c) => c.account_id === p.account_id,
    );
    if (same && same.id !== id) {
      Object.assign(same, p);
      enqueue(w, "RESOURCE_SAVE", p, String(same.id), String(same.id), {
        table,
        expectedVersion: same.row_version,
      });
      return String(same.id);
    }
  }
  if (p.amount !== undefined) num(p.amount, true);
  if (p.value !== undefined) num(p.value, true);
  if (p.target_amount !== undefined) num(p.target_amount);
  if (p.account_id && !w.tables.accounts?.some((a) => a.id === p.account_id))
    throw Error("Account is unavailable");
  if (
    p.category_id &&
    !w.tables.categories?.some((c) => c.id === p.category_id)
  )
    throw Error("Category is unavailable");
  if (p.asset_id && !w.tables.personal_assets?.some((a) => a.id === p.asset_id))
    throw Error("Asset is unavailable");
  if (p.event_id && !w.tables.finance_events?.some((a) => a.id === p.event_id))
    throw Error("Event is unavailable");
  if (p.value_date) {
    day(p.value_date);
    if (String(p.value_date) > deviceDay(new Date(), w.profile.timezone))
      throw Error("Valuation date cannot be in the future");
  }
  if (p.due_date) day(String(p.due_date).slice(0, 10));
  if (p.target_date) day(p.target_date);
  const rows = (w.tables[table] ??= []),
    old = id ? rows.find((r) => r.id === id) : undefined;
  if (id && !old) throw Error("Record is unavailable");
  if (table === "asset_valuations") {
    const same = rows.find(
      (r) => r.asset_id === p.asset_id && r.value_date === p.value_date,
    );
    if (same) {
      Object.assign(same, p);
      enqueue(w, "RESOURCE_SAVE", p, String(same.id), String(same.id), {
        table,
        expectedVersion: same.row_version,
      });
      return String(same.id);
    }
  }
  const row = {
    id: id ?? crypto.randomUUID(),
    ...p,
    updated_at: new Date().toISOString(),
  };
  if (old) Object.assign(old, row);
  else rows.push(row);
  enqueue(w, "RESOURCE_SAVE", p, id, String(row.id), {
    table,
    expectedVersion: old?.row_version,
  });
  return String(row.id);
}
export function deleteLocalRecord(
  w: Workspace,
  table: (typeof localTables)[number],
  id: string,
) {
  local(w);
  if (!localTables.includes(table)) throw Error("Unsupported resource");
  const existing = w.tables[table]?.find((r) => r.id === id);
  if (!existing) throw Error("Record is unavailable");
  enqueue(w, "RESOURCE_DELETE", {}, id, id, {
    table,
    expectedVersion: existing.row_version,
  });
  if (table === "personal_assets")
    w.tables.asset_valuations = (w.tables.asset_valuations ?? []).filter(
      (v) => v.asset_id !== id,
    );
  if (table === "finance_events") {
    w.tables.event_planned_costs = (w.tables.event_planned_costs ?? []).filter(
      (v) => v.event_id !== id,
    );
    w.tables.event_transactions = (w.tables.event_transactions ?? []).filter(
      (v) => v.event_id !== id,
    );
  }
  w.tables[table] = (w.tables[table] ?? []).filter((r) => r.id !== id);
}
