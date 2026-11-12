"use client";
import { budgetProgress } from "@/lib/device/reports";
import { useState } from "react";
import { T, useLocale } from "@/components/i18n/Language";
import { Workspace, changeWorkspace as changeStoredWorkspace } from "@/lib/device/vault";
import {
  createLocalLoan,
  payLocalLoan,
  loanOutstanding,
  reverseLocalLoanPayment,
  archiveLocalLoan,
  saveLocalBill,
  generateLocalBills,
  setLocalBillStatus,
  reviewLocalBill,
  saveLocalRecord,
  deleteLocalRecord,
  localTables,
  deviceDay,
  localNoon,
} from "@/lib/device/personal";
type Row = Record<string, unknown>;
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  ref?: string;
  optional?: boolean;
  value?: string;
};
const schema: Record<
  string,
  { table: (typeof localTables)[number]; fields: Field[] }
> = {
  Plans: {
    table: "budget_plans",
    fields: [
      { key: "name", label: "Name" },
      { key: "amount", label: "Amount", type: "number" },
      {
        key: "frequency",
        label: "Recurrence",
        options: [
          "DAILY",
          "WEEKLY",
          "BIWEEKLY",
          "MONTHLY",
          "QUARTERLY",
          "YEARLY",
          "CUSTOM",
        ],
      },
      { key: "start_date", label: "Start date", type: "date" },
      { key: "end_date", label: "End date", type: "date", optional: true },
      {
        key: "category_id",
        label: "Category",
        ref: "categories",
        optional: true,
      },
    ],
  },
  Assets: {
    table: "personal_assets",
    fields: [
      { key: "name", label: "Name" },
      {
        key: "kind",
        label: "Asset type",
        options: ["PROPERTY", "VEHICLE", "INVESTMENT", "VALUABLE", "OTHER"],
      },
    ],
  },
  Valuations: {
    table: "asset_valuations",
    fields: [
      { key: "asset_id", label: "Asset", ref: "personal_assets" },
      { key: "value_date", label: "Date", type: "date" },
      { key: "value", label: "Current value", type: "number" },
    ],
  },
  Goals: {
    table: "savings_goals",
    fields: [
      { key: "name", label: "Name" },
      { key: "account_id", label: "Account", ref: "accounts" },
      { key: "target_amount", label: "Target amount", type: "number" },
      {
        key: "target_date",
        label: "Target date",
        type: "date",
        optional: true,
      },
    ],
  },
  Events: {
    table: "finance_events",
    fields: [
      { key: "name", label: "Name" },
      {
        key: "kind",
        label: "Event type",
        options: ["TRIP", "WEDDING", "PROJECT", "OTHER"],
      },
      { key: "amount", label: "Budget", type: "number" },
      { key: "start_date", label: "Start date", type: "date" },
      { key: "end_date", label: "End date", type: "date" },
    ],
  },
  "Event costs": {
    table: "event_planned_costs",
    fields: [
      { key: "event_id", label: "Event", ref: "finance_events" },
      { key: "name", label: "Name" },
      { key: "amount", label: "Amount", type: "number" },
      {
        key: "category_id",
        label: "Category",
        ref: "categories",
        optional: true,
      },
    ],
  },
  Reminders: {
    table: "reminders",
    fields: [
      { key: "title", label: "Title" },
      { key: "description", label: "Description", optional: true },
      { key: "due_date", label: "Due date", type: "date" },
    ],
  },
  Cards: {
    table: "card_settings",
    fields: [
      { key: "account_id", label: "Credit card", ref: "accounts" },
      { key: "credit_limit", label: "Credit limit", type: "number" },
      {
        key: "statement_day",
        label: "Statement day",
        type: "number",
        value: "1",
      },
      { key: "due_day", label: "Due day", type: "number", value: "15" },
    ],
  },
};
export function DeviceFinance({
  w,
  tab,
  run,
  busy,
}: {
  w: Workspace;
  tab: string;
  run: (fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
}) {
  const changeWorkspace = (mutate: (copy: Workspace) => void) => changeStoredWorkspace(mutate, w.id);
  const locale = useLocale(),
    [edit, setEdit] = useState<Row>(),
    [selection, setSelection] = useState("");
  const money = (n: unknown) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: w.profile.displayCurrency,
    }).format(Number(n));
  const accounts = (w.tables.accounts ?? []).filter(
    (a) =>
      tab === "Loans"
        ? ["CASH", "BANK_ACCOUNT", "PREPAID_CARD", "INVESTMENT"].includes(String(a.type))
        : !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(String(a.type)),
  );
  const accountSelect = (name = "accountId", optional = false) => (
    <label className="label">
      <T text="Account" />
      <select name={name} className="field" required={!optional}>
        <option value="">
          {optional ? "Already recorded elsewhere" : "Choose account"}
        </option>
        {accounts.map((a) => (
          <option key={String(a.id)} value={String(a.id)}>
            {String(a.name)}
          </option>
        ))}
      </select>
    </label>
  );
  const dateInput = (name = "date", label = "Date") => (
    <label className="label">
      <T text={label} />
      <input
        className="field"
        type="date"
        name={name}
        defaultValue={deviceDay(new Date(), w.profile.timezone)}
        required
      />
    </label>
  );
  const formData = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget));
  };
  if (tab === "Loans")
    return (
      <section className="space-y-4">
        <form
          className="panel space-y-3"
          onSubmit={(e) => {
            const p = formData(e);
            void run(() =>
              changeWorkspace((copy) => {
                createLocalLoan(copy, p);
              }),
            );
          }}
        >
          <h2 className="text-xl"><T text="Borrowing & lending" /></h2>
          <label className="label">
            <T text="Name" />
            <input className="field" name="name" required maxLength={120} />
          </label>
          <label className="label"><T text="Counterparty" /><input
              className="field"
              name="counterparty"
              required
              maxLength={120}
            />
          </label>
          <label className="label"><T text="Direction" /><select name="direction" className="field">
              <option value="LENT"><T text="Lent · principal to receive" /></option>
              <option value="BORROWED"><T text="Borrowed · principal to repay" /></option>
            </select>
          </label>
          <label className="label"><T text="Principal" /><input
              name="principal"
              className="field"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </label>
          {dateInput("startDate", "Start date")}
          {accountSelect("accountId", true)}
          <button className="btn" disabled={busy}><T text="Save loan" /></button>
        </form>
        {(w.tables.personal_loans ?? []).map((l) => (
          <article key={String(l.id)} className="panel space-y-3">
            <h3 className="text-lg">
              {String(l.name)} · {String(l.counterparty)}
            </h3>
            <p>
              {String(l.direction)} ·{" "}
              {money(loanOutstanding(w, l.id).toNumber())} outstanding
              {l.archived ? " · Archived" : ""}
            </p>
            {!l.archived && (
              <>
                <button
                  className="subtle-link"
                  onClick={() =>
                    setSelection(selection === l.id ? "" : String(l.id))
                  }
                ><T text="Record repayment" /></button>
                {selection === l.id && (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      const p = formData(e);
                      void run(async () => {
                        await changeWorkspace((copy) => {
                          payLocalLoan(copy, String(l.id), p);
                        });
                        setSelection("");
                      });
                    }}
                  >
                    <label className="label"><T text="Principal paid" /><input
                        name="principal"
                        className="field"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                      />
                    </label>
                    <label className="label"><T text="Interest" /><input
                        name="interest"
                        className="field"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue="0"
                        required
                      />
                    </label>
                    {accountSelect()}
                    {dateInput()}
                    <button className="btn" disabled={busy}><T text="Record reviewed payment" /></button>
                  </form>
                )}
                <button
                  className="btn-secondary ml-3"
                  disabled={busy || !loanOutstanding(w, l.id).eq(0)}
                  onClick={() =>
                    void run(() =>
                      changeWorkspace((copy) =>
                        archiveLocalLoan(copy, String(l.id)),
                      ),
                    )
                  }
                ><T text="Archive" /></button>
              </>
            )}
            {w.tables.loan_payments
              ?.filter((p) => p.loan_id === l.id)
              .map((p) => (
                <div
                  className="flex justify-between gap-3 text-sm"
                  key={String(p.id)}
                >
                  <p>
                    {money(p.principal)} principal + {money(p.interest)}{" "}
                    interest · {String(p.date_time).slice(0, 10)}
                    {p.reversed_at ? " · Reversed" : ""}
                  </p>
                  {!p.reversed_at && (
                    <button
                      className="text-negative"
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            "Reverse this repayment and its original account effects?",
                          )
                        )
                          void run(() =>
                            changeWorkspace((copy) =>
                              reverseLocalLoanPayment(copy, String(p.id)),
                            ),
                          );
                      }}
                    ><T text="Reverse" /></button>
                  )}
                </div>
              ))}
          </article>
        ))}
      </section>
    );
  if (tab === "Bills")
    return (
      <section className="space-y-4">
        <form
          className="panel space-y-3"
          onSubmit={(e) => {
            const p = formData(e);
            void run(() =>
              changeWorkspace((copy) => {
                saveLocalBill(copy, { ...p, timezone: w.profile.timezone });
                generateLocalBills(copy);
              }),
            );
          }}
        >
          <h2 className="text-xl"><T text="Bills & recurring income" /></h2>
          <label className="label">
            <T text="Name" />
            <input name="name" className="field" required maxLength={120} />
          </label>
          <label className="label">
            <T text="Amount" />
            <input
              name="amount"
              className="field"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </label>
          <label className="label">
            <T text="Type" />
            <select name="type" className="field">
              <option>EXPENSE</option>
              <option>INCOME</option>
            </select>
          </label>
          <label className="label">
            Recurrence
            <select name="frequency" className="field">
              {[
                "ONCE",
                "DAILY",
                "WEEKLY",
                "BIWEEKLY",
                "MONTHLY",
                "QUARTERLY",
                "YEARLY",
              ].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          {dateInput("startDate", "Start date")}
          <label className="label"><T text="End date (optional)" /><input type="date" name="endDate" className="field" />
          </label>
          {accountSelect()}
          <p className="text-xs text-text-secondary">
            Uses {w.profile.timezone}. Due drafts never change balances.
            Generate due drafts after opening the app; recording always requires
            review.
          </p>
          <button className="btn" disabled={busy}><T text="Create schedule" /></button>
        </form>
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={() =>
            void run(() =>
              changeWorkspace((copy) => {
                generateLocalBills(copy);
              }),
            )
          }
        ><T text="Generate due drafts" /></button>
        {(w.tables.personal_bills ?? []).map((b) => (
          <article className="panel space-y-3" key={String(b.id)}>
            <p>
              {String(b.name)} · {money(b.amount)} · {String(b.frequency)} ·{" "}
              {String(b.status)}
            </p>
            {b.status !== "ARCHIVED" && (
              <div className="flex gap-3">
                <button
                  className="subtle-link"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      changeWorkspace((copy) =>
                        setLocalBillStatus(
                          copy,
                          String(b.id),
                          b.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                        ),
                      ),
                    )
                  }
                >
                  {b.status === "ACTIVE" ? "Pause" : "Resume"}
                </button>
                <button
                  className="text-negative"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Archive this schedule and skip its pending drafts?",
                      )
                    )
                      void run(() =>
                        changeWorkspace((copy) =>
                          setLocalBillStatus(copy, String(b.id), "ARCHIVED"),
                        ),
                      );
                  }}
                ><T text="Archive" /></button>
              </div>
            )}
          </article>
        ))}
        {(w.tables.bill_occurrences ?? []).map((d) => (
          <article className="panel space-y-3" key={String(d.id)}>
            <p>
              {String((d.payload as Row).name)} · {String(d.due_date)} ·{" "}
              {String(d.status)}
            </p>
            {d.status === "DUE" && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  const p = formData(e);
                  void run(() =>
                    changeWorkspace((copy) =>
                      reviewLocalBill(copy, String(d.id), "RECORD", p),
                    ),
                  );
                }}
              >
                <label className="label"><T text="Actual amount" /><input
                    className="field"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={Number((d.payload as Row).amount)}
                    required
                  />
                </label>
                {accountSelect()}
                <div className="flex gap-3">
                  <button className="btn" disabled={busy}><T text="Record payment" /></button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        changeWorkspace((copy) =>
                          reviewLocalBill(copy, String(d.id), "SKIP"),
                        ),
                      )
                    }
                  ><T text="Skip" /></button>
                </div>
              </form>
            )}
            {d.status === "RECORDED" && (
              <button
                className="text-negative"
                disabled={busy}
                onClick={() => {
                  if (confirm("Reverse this bill's original financial entry?"))
                    void run(() =>
                      changeWorkspace((copy) =>
                        reviewLocalBill(copy, String(d.id), "REVERSE"),
                      ),
                    );
                }}
              ><T text="Reverse" /></button>
            )}
          </article>
        ))}
      </section>
    );
  const config = schema[tab];
  if (!config) return null;
  const rows = w.tables[config.table] ?? [];
  return (
    <section className="panel space-y-4">
      <h2 className="text-xl">
        <T text={tab} />
      </h2>
      <form
        key={String(edit?.id ?? tab)}
        className="grid sm:grid-cols-2 gap-4"
        onSubmit={(e) => {
          const p: Row = formData(e);
          for (const field of config.fields)
            if (field.type === "number") p[field.key] = Number(p[field.key]);
          for (const [k, v] of Object.entries(p)) if (v === "") p[k] = null;
          void run(async () => {
            await changeWorkspace((copy) => {
              const base =
                edit &&
                copy.tables[config.table]?.find((r) => r.id === edit.id);
              if (
                base &&
                ((edit?.row_version && base.row_version !== edit.row_version) ||
                  (!edit?.row_version && base.updated_at !== edit?.updated_at))
              )
                throw Error(
                  "This record changed while you were editing. Reopen it before saving.",
                );
              saveLocalRecord(
                copy,
                config.table,
                {
                  ...p,
                  ...([
                    "budget_plans",
                    "personal_assets",
                    "savings_goals",
                    "finance_events",
                    "monthly_plans",
                  ].includes(config.table)
                    ? { currency: w.profile.displayCurrency }
                    : {}),
                  ...(config.table === "reminders"
                    ? {
                        type: edit?.type ?? "PERSONAL",
                        due_date: localNoon(
                          String(p.due_date),
                          w.profile.timezone,
                        ),
                      }
                    : {}),
                },
                edit?.id as string | undefined,
              );
            });
            setEdit(undefined);
          });
        }}
      >
        {config.fields.map((field) => (
          <label key={field.key} className="label">
            <T text={field.label} />
            {field.options || field.ref ? (
              <select
                className="field"
                name={field.key}
                required={!field.optional}
                defaultValue={String(edit?.[field.key] ?? field.value ?? "")}
              >
                {(field.optional || field.ref) && (
                  <option value=""><T text="Choose" /></option>
                )}
                {field.options?.map((v) => (
                  <option key={v}>{v}</option>
                ))}
                {field.ref &&
                  (w.tables[field.ref] ?? [])
                    .filter(
                      (r) =>
                        field.ref !== "accounts" ||
                        !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(
                          String(r.type),
                        ),
                    )
                    .map((r) => (
                      <option key={String(r.id)} value={String(r.id)}>
                        {String(r.name ?? r.title ?? r.id)}
                      </option>
                    ))}
              </select>
            ) : (
              <input
                className="field"
                name={field.key}
                type={field.type ?? "text"}
                required={!field.optional}
                maxLength={field.type ? undefined : 200}
                min={field.type === "number" ? 0 : undefined}
                step={field.type === "number" ? "0.01" : undefined}
                defaultValue={String(
                  edit?.[field.key] ??
                    field.value ??
                    (field.type === "date"
                      ? deviceDay(new Date(), w.profile.timezone)
                      : ""),
                )}
              />
            )}
          </label>
        ))}
        <div className="flex gap-3 sm:col-span-2">
          <button className="btn" disabled={busy}>
            <T text="Save on device" />
          </button>
          {edit && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEdit(undefined)}
            >
              <T text="Cancel" />
            </button>
          )}
        </div>
      </form>
      {rows.map((r) => (
        <article
          className="border-t border-border-soft py-3 space-y-2"
          key={String(r.id)}
        >
          <p>
            {String(
              r.name ??
                r.title ??
                w.tables.accounts?.find((a) => a.id === r.account_id)?.name ??
                w.tables.personal_assets?.find((a) => a.id === r.asset_id)
                  ?.name ??
                "Record",
            )}
          </p>
          <p className="text-sm text-text-secondary">
            {r.amount !== undefined
              ? money(r.amount)
              : r.value !== undefined
                ? money(r.value)
                : r.target_amount !== undefined
                  ? money(r.target_amount)
                  : r.credit_limit !== undefined
                    ? money(r.credit_limit)
                    : ""}
            {r.due_date ? ` · ${r.due_date}` : ""}
            {r.frequency ? ` · ${r.frequency}` : ""}
            {r.value_date ? ` · ${r.value_date}` : ""}
          </p>
          {config.table === "budget_plans" &&
            (() => {
              const progress = budgetProgress(w, r);
              return progress ? (
                <div className="text-sm space-y-2">
                  <p>
                    {progress.start} — {progress.end}
                  </p>
                  <p>
                    {money(progress.spent)} spent · {money(progress.remaining)}{" "}
                    remaining · {progress.percent.toFixed(1)}% used
                  </p>
                  <p>{money(progress.dailyAllowance)} daily allowance</p>
                  {progress.percent >= 80 && (
                    <p
                      role="status"
                      className={
                        progress.percent >= 100
                          ? "text-negative"
                          : "text-text-secondary"
                      }
                    >
                      {progress.percent >= 100
                        ? "Budget reached or exceeded"
                        : "80% of this budget has been used"}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm"><T text="This budget is outside its active dates." /></p>
              );
            })()}
          {config.table === "savings_goals" && (
            <p className="text-sm">
              {money(
                w.tables.accounts?.find((a) => a.id === r.account_id)
                  ?.balance ?? 0,
              )}{" "}
              / {money(r.target_amount)}
            </p>
          )}
          <div className="flex gap-3">
            <button className="subtle-link" onClick={() => setEdit(r)}>
              <T text="Edit" />
            </button>
            <button
              className="text-negative text-sm"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Remove this device record? Financial history stays unchanged.",
                  )
                )
                  void run(() =>
                    changeWorkspace((copy) =>
                      deleteLocalRecord(copy, config.table, String(r.id)),
                    ),
                  );
              }}
            >
              <T text="Remove" />
            </button>
            {config.table === "reminders" && (
              <button
                className="subtle-link"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    changeWorkspace((copy) => {
                      saveLocalRecord(
                        copy,
                        "reminders",
                        { title: r.title, is_completed: !r.is_completed },
                        String(r.id),
                      );
                    }),
                  )
                }
              >
                <T text={r.is_completed ? "Reopen" : "Complete"} />
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
