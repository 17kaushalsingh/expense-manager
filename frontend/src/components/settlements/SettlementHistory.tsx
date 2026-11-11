"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import Link from "next/link";
import { useGroups } from "@/hooks/useGroups";
import { Group } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { useFormat } from "@/lib/format";
import { ErrorMessage, Modal } from "@/components/ui/Controls";
interface Payment {
  id: string;
  groupId: string | null;
  payerId: string;
  payeeId: string;
  amount: number;
  currency: string;
  method: string;
  date: string;
}
export function SettlementHistory({ group }: { group?: Group }) {
  const [context, setContext] = useState("all"),
    [offset, setOffset] = useState(0);
  const groups = useGroups(),
    people = useResource<{ id: string; name: string }[]>(
      "/users/debt-people",
      !group,
    );
  const filter = group
    ? `groupId=${group.id}`
    : context === "individual"
      ? "context=individual"
      : context === "all"
        ? ""
        : `groupId=${context}`;
  const data = useResource<{ items: Payment[]; total: number }>(
      `/settlements/page?${filter}&offset=${offset}&limit=25`,
    ),
    user = useAuthStore((s) => s.user),
    { money, date } = useFormat();
  const [selected, setSelected] = useState<Payment>();
  const reverse = useAction(
    (id: string) => apiClient.post(`/settlements/${id}/reverse`, {}),
    () => setSelected(undefined),
  );
  const payments = data.data?.items;
  const name = (id: string) =>
    id === user?.id
      ? "You"
      : (group?.members.find((m) => m.userId === id)?.user?.name ??
        groups.data?.flatMap((g) => g.members).find((m) => m.userId === id)
          ?.user?.name ??
        people.data?.find((p) => p.id === id)?.name ??
        "Former member");
  return (
    <section className="panel space-y-3">
      <h2 className="section-title">Recorded payments</h2>
      {!group && (
        <label className="label">
          Context
          <select
            className="field"
            value={context}
            onChange={(e) => {
              setContext(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">All recorded payments</option>
            <option value="individual">Individual settlements</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ErrorMessage error={data.error || groups.error || people.error} />
      {data.isLoading && <p>Loading payments…</p>}
      {payments?.length === 0 && (
        <p className="text-sm text-text-secondary">No payments recorded yet.</p>
      )}
      {payments?.map((p) => (
        <article
          className="border-t border-border-soft pt-3 flex flex-wrap items-center gap-3"
          key={p.id}
        >
          <div className="flex-1">
            <p>
              {name(p.payerId)} paid {name(p.payeeId)}
            </p>
            <p className="text-xs text-text-secondary">
              {date(p.date)} · {p.method}
            </p>
            {!group && p.groupId && (
              <Link
                className="text-xs text-brand-primary"
                href={`/groups/${p.groupId}`}
              >
                {groups.data?.find((g) => g.id === p.groupId)?.name ??
                  "View group"}
              </Link>
            )}
          </div>
          <strong>{money(p.amount, p.currency)}</strong>
          {[
            p.payerId,
            p.payeeId,
            group?.ownerId ??
              groups.data?.find((g) => g.id === p.groupId)?.ownerId,
          ].includes(user?.id ?? "") && (
            <button
              className="btn-secondary"
              onClick={() => {
                reverse.reset();
                setSelected(p);
              }}
            >
              Reverse record
            </button>
          )}
        </article>
      ))}
      {data.data && data.data.total > 25 && (
        <nav
          className="flex justify-between items-center gap-2"
          aria-label="Payment pages"
        >
          <button
            className="btn-secondary"
            disabled={offset === 0 || data.isFetching}
            onClick={() => setOffset((n) => Math.max(0, n - 25))}
          >
            <T text="Previous" />
          </button>
          <span className="text-sm">Page {Math.floor(offset / 25) + 1}</span>
          <button
            className="btn-secondary"
            disabled={offset + 25 >= data.data.total || data.isFetching}
            onClick={() => setOffset((n) => n + 25)}
          >
            <T text="Next" />
          </button>
        </nav>
      )}
      {selected && (
        <Modal
          title="Reverse payment record"
          onClose={() => {
            if (!reverse.isPending) setSelected(undefined);
          }}
          busy={reverse.isPending}
        >
          <p>
            Reverse this {money(selected.amount, selected.currency)} payment
            record and restore the corresponding cash and debt balances?
          </p>
          <p className="text-sm text-text-secondary">
            This only changes the accounting record. It does not cancel or
            refund any payment made outside this app.
          </p>
          <ErrorMessage error={reverse.error} />
          <button
            className="btn"
            disabled={reverse.isPending}
            onClick={() => reverse.mutate(selected.id)}
          >
            {reverse.isPending ? "Reversing…" : "Reverse record"}
          </button>
        </Modal>
      )}
    </section>
  );
}
