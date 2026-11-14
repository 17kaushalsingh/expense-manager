"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource } from "@/hooks/useResource";
import { useGroups } from "@/hooks/useGroups";
import { Split } from "@/lib/types";
import { useFormat } from "@/lib/format";
import { ErrorMessage, Modal } from "@/components/ui/Controls";
import { Receipts } from "@/components/receipts/Receipts";
import { ItemSummary } from "@/components/receipts/ItemSummary";
import { AdjustmentSummary } from "@/components/split/AdjustmentSummary";
import { ExpenseComments } from "@/components/collaboration/GroupCollaboration";
import { useAuthStore } from "@/store/auth";
export default function SharedExpenseSearch() {
  const [filters, setFilters] = useState("");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Split>();
  const [comments, setComments] = useState<Split>();
  const groups = useGroups(),
    user = useAuthStore((s) => s.user),
    { money, date } = useFormat();
  const results = useResource<{ items: Split[]; total: number }>(
    `/splits/search?${filters}&offset=${offset}&limit=25`,
  );
  const groupOf = (s: Split) => groups.data?.find((g) => g.id === s.groupId);
  const memberName = (s: Split, id: string) =>
    id === user?.id
      ? "You"
      : (groupOf(s)?.members.find((m) => m.userId === id)?.user?.name ??
        "Member");
  return (
    <DashboardLayout>
      <header>
        <p className="eyebrow">
          <T text="Shared expenses" />
        </p>
        <h1 className="text-3xl">
          <T text="Find a bill" />
        </h1>
        <p className="text-sm text-text-secondary mt-2">
          Search across your groups and individual splits.
        </p>
      </header>
      <form
        className="panel grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams();
          new FormData(e.currentTarget).forEach((value, key) => {
            if (String(value)) params.set(key, String(value));
          });
          setFilters(params.toString());
          setOffset(0);
        }}
      >
        <label className="label sm:col-span-2">
          <T text="Description" />
          <input
            name="q"
            className="field"
            type="search"
            maxLength={200}
            placeholder="Dinner, rent, holiday…"
          />
        </label>
        <label className="label">
          Group
          <select name="groupId" className="field">
            <option value="">All groups and individual splits</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          From
          <input name="fromDate" className="field" type="date" />
        </label>
        <label className="label">
          Through
          <input name="toDate" className="field" type="date" />
        </label>
        <label className="label">
          Split method
          <select name="splitType" className="field">
            <option value="">Any method</option>
            {["EQUAL", "EXACT", "PERCENTAGE", "SHARES", "ADJUSTMENT"].map(
              (m) => (
                <option key={m}>{m}</option>
              ),
            )}
          </select>
        </label>
        <label className="label">
          Minimum total
          <input
            name="minAmount"
            className="field"
            type="number"
            min="0"
            step="0.01"
          />
        </label>
        <label className="label">
          Maximum total
          <input
            name="maxAmount"
            className="field"
            type="number"
            min="0"
            step="0.01"
          />
        </label>
        <label className="label">
          Sort
          <select name="sort" className="field">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="highest">Highest total</option>
            <option value="lowest">Lowest total</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Search expenses
        </button>
      </form>
      <ErrorMessage error={results.error || groups.error} />
      {results.isLoading && <p role="status">Finding expenses…</p>}
      {results.data && (
        <p className="text-sm text-text-secondary">
          {results.data.total} matching expenses
        </p>
      )}
      {results.data?.items.length === 0 && (
        <p className="panel">
          No matching expenses. Try a different description or date range.
        </p>
      )}
      <section className="grouped-list">
        {results.data?.items.map((s) => (
          <article className="list-row flex-wrap" key={s.id}>
            <div className="flex-1 min-w-40">
              <h2 className="font-semibold">{s.description}</h2>
              <p className="text-xs text-text-secondary">
                {date(s.date)} · {s.splitType}
              </p>
              {s.groupId ? (
                <Link
                  className="text-sm text-brand-primary"
                  href={`/groups/${s.groupId}`}
                >
                  {groupOf(s)?.name ?? "View group"}
                </Link>
              ) : (
                <p className="text-xs">Individual split</p>
              )}
            </div>
            <strong>{money(s.totalAmount, s.currency)}</strong>
            <button className="btn-secondary" onClick={() => setDetail(s)}>
              Details & receipts
            </button>
            <button className="btn-secondary" onClick={() => setComments(s)}>
              Comments
            </button>
          </article>
        ))}
      </section>
      {results.data && results.data.total > 25 && (
        <nav
          aria-label="Search pages"
          className="flex items-center justify-between gap-2"
        >
          <button
            className="btn-secondary"
            disabled={offset === 0 || results.isFetching}
            onClick={() => setOffset((n) => Math.max(0, n - 25))}
          >
            <T text="Previous" />
          </button>
          <span className="text-sm">Page {Math.floor(offset / 25) + 1}</span>
          <button
            className="btn-secondary"
            disabled={offset + 25 >= results.data.total || results.isFetching}
            onClick={() => setOffset((n) => n + 25)}
          >
            <T text="Next" />
          </button>
        </nav>
      )}
      {detail && (
        <Modal title={detail.description} onClose={() => setDetail(undefined)}>
          <p>
            {money(detail.totalAmount, detail.currency)} · {date(detail.date)}
          </p>
          <h3 className="font-semibold">Paid by</h3>
          {detail.payers.map((p) => (
            <p key={p.userId}>
              {memberName(detail, p.userId)} ·{" "}
              {money(p.amountPaid, detail.currency)}
            </p>
          ))}
          <h3 className="font-semibold">
            <T text="Shares" />
          </h3>
          {detail.participants.map((p) => (
            <p key={p.userId}>
              {memberName(detail, p.userId)} ·{" "}
              {money(p.amountOwed, detail.currency)}
            </p>
          ))}
          <ItemSummary
            value={detail.itemization}
            memberName={(id) => memberName(detail, id)}
          />
          <AdjustmentSummary
            split={detail}
            memberName={(id) => memberName(detail, id)}
          />
          <Receipts
            splitId={detail.id}
            canManage={
              detail.creatorId === user?.id ||
              groupOf(detail)?.ownerId === user?.id
            }
          />
        </Modal>
      )}
      {comments && (
        <ExpenseComments
          splitId={comments.id}
          description={comments.description}
          owner={groupOf(comments)?.ownerId === user?.id}
          onClose={() => setComments(undefined)}
        />
      )}
    </DashboardLayout>
  );
}
