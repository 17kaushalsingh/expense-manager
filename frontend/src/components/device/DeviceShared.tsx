"use client";
import { allocation, groupBalances } from "@/lib/device/splits";
import { useState } from "react";
import {
  Workspace,
  changeWorkspace as changeStoredWorkspace,
} from "@/lib/device/vault";
import { queueCommand } from "@/lib/device/ledger";
import { T, useLocale } from "@/components/i18n/Language";
type Row = Record<string, unknown>;
export function DeviceShared({
  w,
  busy,
  run,
}: {
  w: Workspace;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const changeWorkspace = (mutate: (copy: Workspace) => void) =>
    changeStoredWorkspace(mutate, w.id);
  const locale = useLocale(),
    [groupId, setGroup] = useState(String(w.tables.groups?.[0]?.id ?? "")),
    [editing, setEditing] = useState<Row>(),
    [mode, setMode] = useState("EQUAL");
  const members = (w.tables.group_members ?? [])
      .filter((m) => m.group_id === groupId)
      .sort((a, b) => String(a.user_id).localeCompare(String(b.user_id))),
    group = w.tables.groups?.find((g) => g.id === groupId);
  const name = (id: unknown) =>
    String(
      w.tables.member_identities?.find(
        (p) => p.group_id === groupId && p.user_id === id,
      )?.name ?? (id === w.ownerId ? w.profile.name : String(id).slice(0, 8)),
    );
  const money = (n: unknown) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: String(group?.currency ?? w.profile.displayCurrency),
    }).format(Number(n));
  const balance = groupBalances(w, groupId);
  const splits = (w.tables.split_expenses ?? []).filter(
    (s) => s.group_id === groupId && !s.deleted_at,
  );
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      payers = members.flatMap((m) => {
        const paid = Number(f.get(`paid:${m.user_id}`));
        return paid > 0
          ? [
              {
                userId: String(m.user_id),
                amountPaid: paid,
                ...(m.user_id === w.ownerId && f.get("accountId")
                  ? { accountId: String(f.get("accountId")) }
                  : {}),
              },
            ]
          : [];
      }),
      participants = members
        .filter((m) => f.has(`person:${m.user_id}`))
        .map((m) => ({
          userId: String(m.user_id),
          ...(mode !== "EQUAL"
            ? { shareValue: Number(f.get(`share:${m.user_id}`)) }
            : {}),
        }));
    allocation(Number(f.get("totalAmount")), mode, participants, payers);
    await changeWorkspace((copy) => {
      queueCommand(
        copy,
        editing ? "SPLIT_UPDATE" : "SPLIT_CREATE",
        {
          groupId,
          description: String(f.get("description")),
          totalAmount: Number(f.get("totalAmount")),
          splitType: mode,
          participants,
          payers,
          date: editing?.date ?? new Date().toISOString(),
        },
        editing?.id as string | undefined,
      );
    });
    setEditing(undefined);
  }
  return (
    <section className="space-y-4">
      <label className="label">
        <T text="Group" />
        <select
          className="field"
          value={groupId}
          onChange={(e) => {
            setGroup(e.target.value);
            setEditing(undefined);
          }}
        >
          {w.tables.groups?.map((g) => (
            <option key={String(g.id)} value={String(g.id)}>
              {String(g.name)} · {String(g.currency)}
            </option>
          ))}
        </select>
      </label>
      {!group && (
        <p>
          No saved groups. Join or create a group online, then refresh your
          device snapshot.
        </p>
      )}
      {group && (
        <>
          <div className="panel space-y-2">
            <h2 className="text-xl">
              <T text="Saved group balances" />
            </h2>
            <p className="text-xs text-text-secondary">
              Includes recorded settlements from the cloud snapshot. Pending
              shared changes do not affect these balances.
            </p>
            {members.map((m) => (
              <p key={String(m.user_id)} className="flex justify-between gap-3">
                <span>{name(m.user_id)}</span>
                <span className="tabular-nums">
                  {money(balance[String(m.user_id)]?.toNumber() ?? 0)}
                </span>
              </p>
            ))}
          </div>
          <form
            className="panel space-y-4"
            key={String(editing?.id ?? groupId)}
            onSubmit={(e) => void run(() => save(e))}
          >
            <h2 className="text-xl">
              <T
                text={
                  editing
                    ? "Edit shared expense offline"
                    : "Draft a shared expense"
                }
              />
            </h2>
            <p className="text-sm">
              Current membership, allocations, currency and settlement-history
              rules are checked again when syncing. Other members’ accounts stay
              private.
            </p>
            <label className="label">
              <T text="Description" />
              <input
                className="field"
                name="description"
                required
                maxLength={200}
                defaultValue={String(editing?.description ?? "")}
              />
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
                defaultValue={String(editing?.total_amount ?? "")}
              />
            </label>
            <label className="label">
              <T text="Split mode" />
              <select
                className="field"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                {["EQUAL", "EXACT", "PERCENTAGE", "SHARES", "ADJUSTMENT"].map(
                  (m) => (
                    <option key={m} value={m}>
                      <T text={m[0] + m.slice(1).toLowerCase()} />
                    </option>
                  ),
                )}
              </select>
            </label>
            {mode === "ADJUSTMENT" && (
              <p className="text-xs text-text-secondary">
                <T text="Enter each person’s extra or reduction. The remaining amount is shared equally; final shares cannot be negative." />
              </p>
            )}
            <fieldset className="space-y-3">
              <legend>
                <T text="Participants" /> & <T text="Payers" />
              </legend>
              {members.map((m) => (
                <div
                  key={String(m.user_id)}
                  className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end border-t border-border-soft pt-3"
                >
                  <label className="flex gap-2 items-center text-sm">
                    <input
                      type="checkbox"
                      name={`person:${m.user_id}`}
                      defaultChecked={
                        !editing ||
                        w.tables.split_participants?.some(
                          (p) =>
                            p.split_expense_id === editing.id &&
                            p.user_id === m.user_id,
                        )
                      }
                    />
                    {name(m.user_id)}
                  </label>
                  <label className="label text-xs">
                    <T
                      text={
                        mode === "EQUAL"
                          ? "Equal weight"
                          : mode[0] + mode.slice(1).toLowerCase()
                      }
                    />
                    <input
                      key={mode}
                      className="field"
                      type="number"
                      min={mode === "ADJUSTMENT" ? undefined : "0"}
                      step={mode === "ADJUSTMENT" ? "0.01" : "any"}
                      disabled={mode === "EQUAL"}
                      name={`share:${m.user_id}`}
                      defaultValue={Number(
                        (mode === "ADJUSTMENT" &&
                        Array.isArray(editing?.adjustments)
                          ? editing.adjustments.find(
                              (p: { userId: string }) => p.userId === m.user_id,
                            )?.shareValue
                          : undefined) ??
                          (mode === "ADJUSTMENT"
                            ? 0
                            : (w.tables.split_participants?.find(
                                (p) =>
                                  p.split_expense_id === editing?.id &&
                                  p.user_id === m.user_id,
                              )?.share_value ?? 1)),
                      )}
                    />
                  </label>
                  <label className="label text-xs">
                    <T text="Amount paid" />
                    <input
                      className="field"
                      name={`paid:${m.user_id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={Number(
                        w.tables.split_payers?.find(
                          (p) =>
                            p.split_expense_id === editing?.id &&
                            p.user_id === m.user_id,
                        )?.amount_paid ?? 0,
                      )}
                    />
                  </label>
                </div>
              ))}
            </fieldset>
            <label className="label">
              <T text="Your payer account" />
              <select className="field" name="accountId">
                <option value="">
                  <T text="Default cash account" />
                </option>
                {w.tables.accounts
                  ?.filter(
                    (a) =>
                      !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(
                        String(a.type),
                      ),
                  )
                  .map((a) => (
                    <option key={String(a.id)} value={String(a.id)}>
                      {String(a.name)}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="btn"
              disabled={busy || group.currency !== w.profile.displayCurrency}
            >
              <T text="Save for review & sync" />
            </button>
            {editing && (
              <button
                className="btn-secondary ml-3"
                type="button"
                onClick={() => setEditing(undefined)}
              >
                <T text="Cancel" />
              </button>
            )}
          </form>
          {splits.map((s) => (
            <article key={String(s.id)} className="panel space-y-3">
              <p>
                {String(s.description)} · {money(s.total_amount)}
              </p>
              {(s.creator_id === w.ownerId || group.owner_id === w.ownerId) && (
                <div className="flex gap-3">
                  <button
                    className="subtle-link"
                    onClick={() => {
                      setEditing(s);
                      setMode(String(s.split_type));
                    }}
                  >
                    <T text="Edit" />
                  </button>
                  <button
                    className="text-negative"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Queue deletion of this shared expense? Settlement history may prevent deletion when syncing.",
                        )
                      )
                        void run(() =>
                          changeWorkspace((copy) => {
                            queueCommand(
                              copy,
                              "SPLIT_DELETE",
                              {},
                              String(s.id),
                            );
                          }),
                        );
                    }}
                  >
                    <T text="Delete" />
                  </button>
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
