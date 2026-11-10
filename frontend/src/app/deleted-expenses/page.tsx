"use client";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { useFormat } from "@/lib/format";
import { ErrorMessage, Modal } from "@/components/ui/Controls";
interface DeletedExpense {
  id: string;
  groupId: string | null;
  description: string;
  currency: string;
  totalAmount: number;
  deletedAt: string;
}
export default function DeletedExpenses() {
  const [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<DeletedExpense>();
  const data = useResource<{ items: DeletedExpense[]; total: number }>(
    `/splits/deleted?offset=${offset}&limit=25`,
  );
  const { money, date } = useFormat();
  const restore = useAction(
    (id: string) => apiClient.post(`/splits/${id}/restore`, {}),
    () => setSelected(undefined),
  );
  return (
    <DashboardLayout>
      <header>
        <p className="eyebrow">Expense recovery</p>
        <h1 className="text-3xl">Deleted expenses</h1>
        <p className="text-sm text-text-secondary mt-2">
          Restore eligible shared bills with their original accounts,
          allocations and comments.
        </p>
      </header>
      <ErrorMessage error={data.error} />
      {data.isLoading && <p role="status">Loading deleted expenses…</p>}
      {data.data?.items.length === 0 && (
        <p className="panel">No deleted expenses available to restore.</p>
      )}
      <section className="grouped-list">
        {data.data?.items.map((e) => (
          <article key={e.id} className="list-row flex-wrap">
            <div className="flex-1 min-w-40">
              <h2 className="font-semibold">{e.description}</h2>
              <p className="text-xs text-text-secondary">
                Deleted {date(e.deletedAt)} ·{" "}
                {e.groupId ? "Group expense" : "Individual split"}
              </p>
            </div>
            <strong>{money(e.totalAmount, e.currency)}</strong>
            <button
              className="btn-secondary"
              onClick={() => {
                restore.reset();
                setSelected(e);
              }}
            >
              Restore
            </button>
          </article>
        ))}
      </section>
      {data.data && data.data.total > 25 && (
        <nav
          className="flex justify-between gap-2"
          aria-label="Deleted expense pages"
        >
          <button
            className="btn-secondary"
            disabled={offset === 0 || data.isFetching}
            onClick={() => setOffset((n) => Math.max(0, n - 25))}
          >
            Previous
          </button>
          <button
            className="btn-secondary"
            disabled={offset + 25 >= data.data.total || data.isFetching}
            onClick={() => setOffset((n) => n + 25)}
          >
            Next
          </button>
        </nav>
      )}
      {selected && (
        <Modal
          title="Restore expense"
          busy={restore.isPending}
          onClose={() => {
            if (!restore.isPending) setSelected(undefined);
          }}
        >
          <p>
            Restore {selected.description} (
            {money(selected.totalAmount, selected.currency)}) and its original
            accounting effects?
          </p>
          <p className="text-sm text-text-secondary">
            Current membership, original accounts and currency must still be
            valid. Settlement history can prevent recovery. Receipts removed
            before deletion cannot be recovered here.
          </p>
          <ErrorMessage error={restore.error} />
          <button
            className="btn"
            disabled={restore.isPending}
            onClick={() => restore.mutate(selected.id)}
          >
            {restore.isPending ? "Restoring…" : "Restore expense"}
          </button>
        </Modal>
      )}
    </DashboardLayout>
  );
}
