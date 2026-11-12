"use client";
import { resolveReferences, acknowledge } from "@/lib/device/syncState";
import { DeviceReports } from "./DeviceReports";
import { DeviceShared } from "./DeviceShared";
import {
  prepareReceipt,
  attachReceipt,
  removeReceipt,
  syncReceipt,
} from "@/lib/device/receipts";
import { DeviceFinance } from "./DeviceFinance";
import { T } from "@/components/i18n/Language";
import Link from "next/link";
import { useState, useSyncExternalStore, useEffect } from "react";
import {
  workspace,
  subscribe,
  changeWorkspace as changeStoredWorkspace,
  Workspace,
} from "@/lib/device/vault";
import { queueCommand, ledgerSummary } from "@/lib/device/ledger";
import { LanguageSettings, useLocale } from "@/components/i18n/Language";
import { DeviceSecurity } from "./DeviceSecurity";
import { ErrorMessage } from "@/components/ui/Controls";
import { apiClient } from "@/lib/api/client";
import { unbase64 } from "@/lib/device/crypto";
const ordinary = (rows: Record<string, unknown>[] | undefined) =>
  (rows ?? []).filter(
    (a) =>
      !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(String(a.type)),
  );
export function DeviceWorkspace() {
  const locale = useLocale();
  const w = useSyncExternalStore(subscribe, workspace, () => null),
    [tab, setTab] = useState("Activity"),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [multi, setMulti] = useState(false);
  const [online, setOnline] = useState(true),
    [edit, setEdit] = useState<Record<string, unknown>>();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!w)
    return (
      <main className="max-w-xl mx-auto p-6 space-y-6">
        <Link href="/">LedgerSync</Link>
        <h1 className="text-3xl">
          <T text="Your private device ledger" />
        </h1>
        <p>
          Create an encrypted ledger to record finances without an internet
          connection, or protect your signed-in account from Settings.
        </p>
        <LanguageSettings />
        <DeviceSecurity />
      </main>
    );
  const changeWorkspace = (mutate: (copy: Workspace) => void) =>
    changeStoredWorkspace(mutate, w.id);
  const current = w,
    money = (n: unknown) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: w.profile.displayCurrency,
      }).format(Number(n)),
    summary = ledgerSummary(w);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function command(
    kind: string,
    input: Record<string, unknown>,
    id?: string,
  ) {
    await changeWorkspace((copy) => {
      queueCommand(copy, kind, input, id);
    });
    setEdit(undefined);
    setNotice(
      current.mode === "LOCAL"
        ? "Saved on this device."
        : "Saved on this device. Review Pending to sync with your cloud ledger.",
    );
  }
  async function sync() {
    if (!online) throw Error("Reconnect before syncing");
    for (const queued of [...(workspace()?.commands ?? [])]) {
      const cmd = workspace()?.commands.find((c) => c.id === queued.id);
      if (!cmd) continue;
      if (cmd.status === "CONFLICT") break;
      const active = workspace();
      if (!active || active.ownerId !== current.ownerId)
        throw Error("Workspace changed");
      const mapping =
        (active as Workspace & { resolvedIds?: Record<string, string> })
          .resolvedIds ?? {};
      try {
        if (cmd.kind.startsWith("RECEIPT_")) {
          await syncReceipt(active, cmd, mapping);
          await changeWorkspace((copy) => {
            copy.commands = copy.commands.filter((c) => c.id !== cmd.id);
          });
          continue;
        }
        const result = await apiClient.post<{
          id?: string;
          updatedAt?: string;
          rowVersion?: string;
        }>("/portability/commands", {
          id: cmd.id,
          ownerId: current.ownerId,
          kind: cmd.kind,
          payload: resolveReferences(cmd.payload, mapping),
          expectedUpdatedAt: cmd.expectedUpdatedAt,
        });
        await changeWorkspace((copy) => acknowledge(copy, cmd, result));
      } catch (e) {
        await changeWorkspace((copy) => {
          const c = copy.commands.find((c) => c.id === cmd.id);
          if (c) {
            c.status = "CONFLICT";
            c.error = e instanceof Error ? e.message : "Sync failed";
          }
        });
        throw e;
      }
    }
    if (workspace()?.commands.length === 0) {
      const snap = await apiClient.get<{
        ownerId: string;
        tables: Workspace["tables"];
        attachments: Workspace["attachments"];
      }>("/portability/export");
      if (snap.ownerId !== current.ownerId)
        throw Error("Account changed; snapshot was not applied");
      await changeWorkspace((copy) => {
        copy.tables = snap.tables;
        copy.attachments = snap.attachments;
      });
      setNotice("All pending operations synced. Cloud snapshot refreshed.");
    }
  }
  const tabs = [
    "Activity",
    "Accounts",
    "Categories",
    "Reports",
    "Plans",
    "Assets",
    "Valuations",
    "Goals",
    "Loans",
    "Bills",
    "Events",
    "Event costs",
    "Cards",
    "Reminders",
    ...(w.mode === "CLOUD" ? ["Shared", "Snapshot", "Pending"] : []),
    "Security",
  ];
  return (
    <main className="mx-auto max-w-5xl px-5 py-6 space-y-6 pb-24">
      <header className="flex justify-between items-center gap-3">
        <div>
          <p className="eyebrow">
            {w.mode === "LOCAL"
              ? "Private device ledger"
              : "Encrypted device workspace"}
          </p>
          <h1 className="text-3xl mt-2">{w.profile.name}</h1>
        </div>
        {w.mode === "CLOUD" && (
          <Link className="btn-secondary" href="/">
            <T text="Cloud app" />
          </Link>
        )}
      </header>
      <p className="text-sm text-text-secondary">
        <T text={online ? "Online" : "Offline"} /> · {w.profile.displayCurrency} ·{" "}
        {w.profile.timezone}
        {w.mode === "CLOUD"
          ? ` · ${w.commands.length} pending operations. Device totals include unsynced personal changes; shared drafts affect no balances.`
          : " · Data stays on this device. Create backups regularly."}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Net worth", summary.net],
          ["Income", summary.income],
          ["Expenses", summary.expense],
        ].map(([label, value]) => (
          <div key={label} className="panel !p-3">
            <p className="text-xs text-text-secondary"><T text={String(label)} /></p>
            <p className="text-lg font-semibold tabular-nums break-all">
              {money(value)}
            </p>
          </div>
        ))}
      </div>
      <nav aria-label="Device workspace" className="flex gap-2 overflow-auto">
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "btn" : "btn-secondary"}
            onClick={() => {
              setTab(t);
              setEdit(undefined);
            }}
          >
            <T text={t} />
          </button>
        ))}
      </nav>
      <ErrorMessage error={error} />
      {notice && (
        <p role="status" className="text-positive">
          {notice}
        </p>
      )}
      {tab === "Activity" && (
        <>
          <form
            key={String(edit?.id ?? "new")}
            className="panel space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void run(() =>
                command(
                  edit?.source_type === "CONVERSION"
                    ? "CONVERSION_UPDATE"
                    : edit
                      ? "TX_UPDATE"
                      : f.kind === "TRANSFER"
                        ? "TRANSFER"
                        : f.kind === "CONVERSION"
                          ? "CONVERSION_CREATE"
                          : "TX_CREATE",
                  {
                    accountId: f.accountId,
                    sourceAccountId: f.accountId,
                    targetAccountId: f.targetAccountId,
                    type: f.type,
                    amount: Number(f.amount),
                    originalAmount: String(f.amount),
                    originalCurrency: f.originalCurrency,
                    exchangeRate: String(f.exchangeRate),
                    rateDate: f.rateDate,
                    rateSource: "MANUAL",
                    categoryId: f.categoryId || null,
                    dateTime:
                      edit?.date_time &&
                      String(f.dateTime) === String(edit.date_time).slice(0, 16)
                        ? String(edit.date_time)
                        : new Date(String(f.dateTime) + "Z").toISOString(),
                    notes: f.notes,
                    tags: String(f.tags ?? "")
                      .split(",")
                      .map((t) => t.trim().toLowerCase())
                      .filter(Boolean),
                  },
                  (edit?.source_type === "CONVERSION"
                    ? edit.source_id
                    : edit?.id) as string | undefined,
                ),
              );
            }}
          >
            <h2 className="text-xl">{edit ? "Edit entry" : "New entry"}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="label">
                <T text="Entry" />
                <select
                  className="field"
                  name="kind"
                  disabled={!!edit}
                  defaultValue={
                    edit?.source_type === "CONVERSION" ? "CONVERSION" : "MANUAL"
                  }
                >
                  <option value="MANUAL">
                    <T text="Income / expense" />
                  </option>
                  <option value="TRANSFER">
                    <T text="Account transfer" />
                  </option>
                  <option value="CONVERSION">
                    <T text="Foreign currency" />
                  </option>
                </select>
              </label>
              <label className="label">
                <T text="Type" />
                <select
                  className="field"
                  name="type"
                  defaultValue={String(edit?.type ?? "EXPENSE")}
                >
                  <option>EXPENSE</option>
                  <option>INCOME</option>
                </select>
              </label>
              <label className="label">
                <T text="Account" />
                <select
                  className="field"
                  name="accountId"
                  required
                  defaultValue={String(edit?.account_id ?? "")}
                >
                  <option value="">
                    <T text="Choose account" />
                  </option>
                  {ordinary(w.tables.accounts).map((a) => (
                    <option key={String(a.id)} value={String(a.id)}>
                      {String(a.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                <T text="Transfer destination" />
                <select className="field" name="targetAccountId">
                  <option value="">
                    <T text="Only for transfers" />
                  </option>
                  {ordinary(w.tables.accounts).map((a) => (
                    <option key={String(a.id)} value={String(a.id)}>
                      {String(a.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                <T text="Amount" />
                <input
                  name="amount"
                  type="number"
                  min="0.0001"
                  step="any"
                  className="field"
                  required
                  defaultValue={String(
                    edit?.original_amount ?? edit?.amount ?? "",
                  )}
                />
              </label>
              <label className="label">
                <T text="Date and time (UTC)" />
                <input
                  name="dateTime"
                  type="datetime-local"
                  className="field"
                  required
                  defaultValue={String(
                    edit?.date_time ?? new Date().toISOString(),
                  ).slice(0, 16)}
                />
              </label>
              <label className="label">
                <T text="Category" />
                <select
                  className="field"
                  name="categoryId"
                  defaultValue={String(edit?.category_id ?? "")}
                >
                  <option value="">
                    <T text="Uncategorized" />
                  </option>
                  {w.tables.categories?.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {String(c.name)} · {String(c.type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                <T text="Labels, comma separated" />
                <input
                  className="field"
                  name="tags"
                  defaultValue={
                    Array.isArray(edit?.tags) ? edit.tags.join(", ") : ""
                  }
                />
              </label>
            </div>
            <details>
              <summary className="cursor-pointer text-sm">
                <T text="Foreign currency details" />
              </summary>
              <p className="text-xs mt-2">
                For foreign entries, amount above is the original amount; enter
                the statement rate into {w.profile.displayCurrency}. Rates are
                never downloaded without a connection.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mt-3">
                <label className="label">
                  <T text="Original currency" />
                  <select
                    className="field"
                    name="originalCurrency"
                    defaultValue={String(
                      edit?.original_currency ??
                        (w.profile.displayCurrency === "EUR" ? "USD" : "EUR"),
                    )}
                  >
                    {Intl.supportedValuesOf("currency")
                      .filter((c) => c !== w.profile.displayCurrency)
                      .map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                  </select>
                </label>
                <label className="label">
                  <T text="Exchange rate" />
                  <input
                    className="field"
                    name="exchangeRate"
                    type="number"
                    step="any"
                  />
                </label>
                <label className="label">
                  <T text="Rate date" />
                  <input
                    className="field"
                    name="rateDate"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    defaultValue={String(
                      edit?.rate_date ?? new Date().toISOString().slice(0, 10),
                    )}
                  />
                </label>
              </div>
            </details>
            <label className="label">
              <T text="Notes" />
              <input
                className="field"
                name="notes"
                maxLength={2000}
                defaultValue={String(edit?.notes ?? "")}
              />
            </label>
            <div className="flex gap-3">
              <button className="btn" disabled={busy}>
                <T text="Save on device" />
              </button>
              {edit && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEdit(undefined)}
                >
                  <T text="Cancel edit" />
                </button>
              )}
            </div>
          </form>
          <button className="btn-secondary" onClick={() => setMulti(!multi)}><T text="Split an entry across accounts" /></button>
          {multi && (
            <form
              className="panel space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  await command("PERSONAL_ENTRY_CREATE", {
                    type: f.get("type"),
                    totalAmount: Number(f.get("totalAmount")),
                    currency: w.profile.displayCurrency,
                    dateTime: new Date().toISOString(),
                    notes: f.get("notes"),
                    allocations: ordinary(w.tables.accounts).flatMap((a) =>
                      Number(f.get(`allocation:${a.id}`)) > 0
                        ? [
                            {
                              accountId: a.id,
                              amount: Number(f.get(`allocation:${a.id}`)),
                            },
                          ]
                        : [],
                    ),
                  });
                  setMulti(false);
                });
              }}
            >
              <h2 className="text-xl"><T text="One expense or income, multiple accounts" /></h2>
              <label className="label">
                <T text="Type" />
                <select className="field" name="type">
                  <option>EXPENSE</option>
                  <option>INCOME</option>
                </select>
              </label>
              <label className="label">
                <T text="Total" />
                <input
                  className="field"
                  name="totalAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                />
              </label>
              {ordinary(w.tables.accounts).map((a) => (
                <label className="label" key={String(a.id)}>
                  {String(a.name)}
                  <input
                    className="field"
                    name={`allocation:${a.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </label>
              ))}
              <label className="label">
                <T text="Notes" />
                <input className="field" name="notes" maxLength={2000} />
              </label>
              <p className="text-xs">
                Allocations must exactly equal the total. The total is counted
                once in analytics.
              </p>
              <button className="btn" disabled={busy}>
                <T text="Save on device" />
              </button>
            </form>
          )}
          <div className="panel divide-y divide-border-soft">
            {!w.tables.transactions?.length && (
              <p>
                <T text="No entries yet. Add an account, then record your first expense." />
              </p>
            )}
            {[...(w.tables.transactions ?? [])]
              .sort((a, b) =>
                String(b.date_time).localeCompare(String(a.date_time)),
              )
              .map((t) => (
                <article key={String(t.id)} className="py-4 space-y-2">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p>
                        {String(t.notes || t.type)}{" "}
                        {!!t.pending && (
                          <span className="text-xs">· Pending</span>
                        )}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeZone: w.profile.timezone,
                        }).format(new Date(String(t.date_time)))}{" "}
                        ·{" "}
                        {String(
                          w.tables.accounts?.find((a) => a.id === t.account_id)
                            ?.name ?? "Account",
                        )}{" "}
                        · {String(t.source_type)}
                      </p>
                    </div>
                    <p className="font-semibold">{money(t.amount)}</p>
                  </div>
                  {t.source_type === "MANUAL" && (
                    <div className="flex gap-3 text-sm">
                      <button
                        className="subtle-link"
                        onClick={() => setEdit(t)}
                      >
                        <T text="Edit" />
                      </button>
                      <button
                        className="text-negative"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Delete this entry and reverse its balance effect?",
                            )
                          )
                            void run(() =>
                              command("TX_DELETE", {}, String(t.id)),
                            );
                        }}
                      >
                        <T text="Delete" />
                      </button>
                    </div>
                  )}
                  {t.source_type === "CONVERSION" && (
                    <div className="flex gap-3 text-sm">
                      <button
                        className="subtle-link"
                        onClick={() => {
                          const source = w.tables.currency_conversions?.find(
                            (c) => c.id === t.source_id,
                          );
                          setEdit({
                            ...t,
                            ...source,
                            id: t.id,
                            source_id: t.source_id,
                          });
                        }}
                      ><T text="Review conversion" /></button>
                      <button
                        className="text-negative"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              "Delete this conversion and reverse its account effect?",
                            )
                          )
                            void run(() =>
                              command(
                                "CONVERSION_DELETE",
                                {},
                                String(t.source_id),
                              ),
                            );
                        }}
                      ><T text="Delete conversion" /></button>
                    </div>
                  )}
                  {t.source_type === "PERSONAL_ENTRY" && (
                    <button
                      className="text-negative text-sm"
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            "Delete every component of this multi-account entry?",
                          )
                        )
                          void run(() =>
                            command(
                              "PERSONAL_ENTRY_DELETE",
                              {},
                              String(t.source_id),
                            ),
                          );
                      }}
                    ><T text="Delete multi-account entry" /></button>
                  )}
                  <label className="text-xs subtle-link cursor-pointer">
                    <T text="Attach receipt" />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void run(async () => {
                            const attachment = await prepareReceipt(file);
                            await changeWorkspace((copy) =>
                              attachReceipt(copy, String(t.id), attachment),
                            );
                            setNotice(
                              "Receipt stored securely on this device. Cloud uploads are included in Pending sync.",
                            );
                          });
                      }}
                    />
                  </label>
                  {w.tables.receipt_attachments
                    ?.filter((r) => r.transaction_id === t.id)
                    .map((r) => (
                      <button
                        key={String(r.id)}
                        className="subtle-link text-xs ml-3"
                        onClick={() =>
                          void run(async () => {
                            const a = workspace()?.attachments.find(
                              (a) => a.id === r.id,
                            );
                            if (!a)
                              throw Error(
                                "Refresh your cloud snapshot to download this receipt",
                              );
                            const url = URL.createObjectURL(
                                new Blob(
                                  [
                                    unbase64(a.bytes).slice()
                                      .buffer as ArrayBuffer,
                                  ],
                                  { type: a.mime },
                                ),
                              ),
                              link = document.createElement("a");
                            link.href = url;
                            link.download = a.name;
                            link.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          })
                        }
                      >
                        {String(r.file_name)}
                      </button>
                    ))}
                  {w.tables.receipt_attachments
                    ?.filter((r) => r.transaction_id === t.id)
                    .map((r) => (
                      <button
                        key={`remove:${r.id}`}
                        className="text-negative text-xs ml-3"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              "Remove this receipt? This also queues removal of its cloud file when applicable.",
                            )
                          )
                            void run(() =>
                              changeWorkspace((copy) =>
                                removeReceipt(copy, String(r.id)),
                              ),
                            );
                        }}
                      ><T text="Remove" />{String(r.file_name)}
                      </button>
                    ))}
                </article>
              ))}
          </div>
        </>
      )}
      {tab === "Reports" && <DeviceReports w={w} />}
      {tab === "Accounts" && (
        <>
          <form
            className="panel space-y-3"
            key={String(edit?.id ?? "new")}
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void run(() =>
                command(
                  edit ? "ACCOUNT_UPDATE" : "ACCOUNT_CREATE",
                  edit
                    ? { name: f.name }
                    : { ...f, balance: Number(f.balance) },
                  edit?.id as string | undefined,
                ),
              );
            }}
          >
            <h2 className="text-xl">
              {edit ? "Rename account" : "Add account"}
            </h2>
            <label className="label">
              <T text="Name" />
              <input
                name="name"
                className="field"
                required
                maxLength={120}
                defaultValue={String(edit?.name ?? "")}
              />
            </label>
            {!edit && (
              <>
                <label className="label">
                  <T text="Type" />
                  <select name="type" className="field">
                    {[
                      "CASH",
                      "BANK_ACCOUNT",
                      "PREPAID_CARD",
                      "INVESTMENT",
                      "CREDIT_CARD",
                      "LOAN",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="label">
                  <T text="Opening balance" />
                  <input
                    name="balance"
                    type="number"
                    step="0.01"
                    className="field"
                    defaultValue="0"
                    required
                  />
                </label>
              </>
            )}
            <button className="btn" disabled={busy}>
              <T text="Save account" />
            </button>
          </form>
          {ordinary(w.tables.accounts).map((a) => (
            <div
              key={String(a.id)}
              className="panel flex flex-wrap justify-between gap-3"
            >
              <p>
                {String(a.name)} · {money(a.balance)}
              </p>
              {!a.is_default && (
                <div className="flex gap-3">
                  <button className="subtle-link" onClick={() => setEdit(a)}>
                    <T text="Rename" />
                  </button>
                  <button
                    className="text-negative"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Delete this account? Accounts with history cannot be deleted.",
                        )
                      )
                        void run(() =>
                          command("ACCOUNT_DELETE", {}, String(a.id)),
                        );
                    }}
                  >
                    <T text="Delete" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {tab === "Categories" && (
        <>
          <form
            className="panel space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                command(
                  "CATEGORY_CREATE",
                  Object.fromEntries(new FormData(e.currentTarget)),
                ),
              );
            }}
          >
            <h2 className="text-xl">
              <T text="Add category" />
            </h2>
            <label className="label">
              <T text="Name" />
              <input className="field" name="name" required maxLength={120} />
            </label>
            <label className="label">
              <T text="Type" />
              <select name="type" className="field">
                <option>EXPENSE</option>
                <option>INCOME</option>
              </select>
            </label>
            <button className="btn" disabled={busy}>
              <T text="Save category" />
            </button>
          </form>
          {w.tables.categories?.map((c) => (
            <div
              className="panel flex justify-between gap-3"
              key={String(c.id)}
            >
              <span>
                {String(c.name)} · {String(c.type)}
              </span>
              {c.user_id !== null && (
                <button
                  className="text-negative"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Delete this category? Historical references will be cleared.",
                      )
                    )
                      void run(() =>
                        command("CATEGORY_DELETE", {}, String(c.id)),
                      );
                  }}
                >
                  <T text="Delete" />
                </button>
              )}
            </div>
          ))}
        </>
      )}
      {tab === "Pending" && (
        <section className="panel space-y-4">
          <h2 className="text-xl">
            <T text="Review pending operations" />
          </h2>
          <p className="text-sm">
            Sync rechecks current ownership, currency and ledger rules. A
            rejected operation stops the queue; it never silently overwrites a
            newer cloud record.
          </p>
          <button
            className="btn"
            disabled={busy || !online || !w.commands.length}
            onClick={() => void run(sync)}
          >
            <T text="Sync reviewed operations" />
          </button>
          {w.commands.length > 0 && (
            <button
              className="btn-secondary"
              disabled={busy || !online}
              onClick={() => {
                if (
                  confirm(
                    "Discard ALL unsynced changes and local receipt files, and refresh from the cloud? Export a backup first if you need them.",
                  )
                )
                  void run(async () => {
                    const snap = await apiClient.get<{
                      ownerId: string;
                      tables: Workspace["tables"];
                      attachments: Workspace["attachments"];
                    }>("/portability/export");
                    if (snap.ownerId !== current.ownerId)
                      throw Error("Account changed");
                    await changeWorkspace((copy) => {
                      copy.tables = snap.tables;
                      copy.attachments = snap.attachments;
                      copy.commands = [];
                    });
                  });
              }}
            ><T text="Discard unsynced changes & refresh" /></button>
          )}
          {w.commands.map((c) => (
            <article className="border-t border-border-soft pt-3" key={c.id}>
              <p>
                {c.kind.replaceAll("_", " ")} · {c.status}
              </p>
              <p className="text-sm">
                {String(
                  (c.payload.input as Record<string, unknown>)?.description ??
                    (c.payload.input as Record<string, unknown>)?.notes ??
                    (c.payload.input as Record<string, unknown>)?.name ??
                    "",
                )}
              </p>
              <p className="text-sm text-negative">{c.error}</p>
              {c.status === "CONFLICT" && (
                <button
                  className="subtle-link"
                  onClick={() =>
                    void run(async () => {
                      await changeWorkspace((copy) => {
                        const cmd = copy.commands.find((x) => x.id === c.id)!;
                        cmd.status = "PENDING";
                        delete cmd.error;
                      });
                    })
                  }
                >
                  <T text="Retry unchanged operation" />
                </button>
              )}
            </article>
          ))}
          {!w.commands.length && (
            <p>
              <T text="No pending operations." />
            </p>
          )}
        </section>
      )}
      {tab === "Shared" && <DeviceShared w={w} busy={busy} run={run} />}
      {tab === "Snapshot" && (
        <section className="panel space-y-3">
          <h2 className="text-xl">
            <T text="Saved cloud records" />
          </h2>
          <p className="text-sm">
            All authorized records from your last full snapshot are retained,
            including group history. Only the personal editors above make
            offline ledger changes. Shared balances remain the last
            server-validated snapshot.
          </p>
          {Object.entries(w.tables).map(([name, rows]) => (
            <details key={name}>
              <summary>
                {name.replaceAll("_", " ")} · {rows.length}
              </summary>
              <ul className="text-sm space-y-2 py-2">
                {rows.map((r, i) => (
                  <li key={String(r.id ?? i)}>
                    {String(
                      r.name ??
                        r.description ??
                        r.title ??
                        r.notes ??
                        r.action ??
                        r.id ??
                        i,
                    )}
                    {r.amount !== undefined ? ` · ${money(r.amount)}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
      {[
        "Plans",
        "Assets",
        "Valuations",
        "Goals",
        "Loans",
        "Bills",
        "Events",
        "Event costs",
        "Cards",
        "Reminders",
      ].includes(tab) && (
        <DeviceFinance key={tab} w={w} tab={tab} busy={busy} run={run} />
      )}
      {tab === "Security" && (
        <>
          <LanguageSettings />
          <DeviceSecurity />
        </>
      )}
    </main>
  );
}
