"use client";
import { useState } from "react";
import { useResource, useAction } from "@/hooks/useResource";
import { Split } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { useFormat } from "@/lib/format";
import { apiClient } from "@/lib/api/client";
import { Confirm, ErrorMessage, Modal } from "@/components/ui/Controls";
import { Receipts } from "@/components/receipts/Receipts";
import { SplitBuilder } from "./SplitBuilder";
export function IndividualSplits() {
  const data = useResource<Split[]>("/splits"),
    people = useResource<{ id: string; name: string }[]>("/users/debt-people"),
    user = useAuthStore((s) => s.user),
    { money, date } = useFormat();
  const [edit, setEdit] = useState<Split>(),
    [remove, setRemove] = useState<Split>();
  const [evidence, setEvidence] = useState<Split>();
  const deletion = useAction(
    () => apiClient.delete(`/splits/${remove?.id}`),
    () => setRemove(undefined),
  );
  return (
    <section className="space-y-3">
      <h2 className="section-title">Individual splits</h2>
      <ErrorMessage error={data.error} />
      {data.isLoading && (
        <p className="text-text-secondary text-xs">Loading shared expenses…</p>
      )}
      {data.data?.length === 0 && (
        <p className="text-xs text-text-secondary">
          One-off splits with friends will appear here.
        </p>
      )}
      <div className="grouped-list">
        {data.data?.map((s) => (
          <article className="list-row flex-wrap" key={s.id}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{s.description}</p>
              <p className="text-[10px] text-text-secondary mt-1">
                {date(s.date)} ·{" "}
                {s.payers
                  .map(
                    (p) =>
                      `${p.userId === user?.id ? "You" : (people.data?.find((u) => u.id === p.userId)?.name ?? "Member")} paid ${money(p.amountPaid, s.currency)}`,
                  )
                  .join(", ")}
              </p>
            </div>
            <strong className="text-xs">
              {money(s.totalAmount, s.currency)}
            </strong>
            <button className="btn-secondary !text-[10px]" onClick={() => setEvidence(s)}>Receipts</button>
            {s.creatorId === user?.id && (
              <div className="flex gap-1">
                <button
                  className="btn-secondary !text-[10px]"
                  onClick={() => setEdit(s)}
                >
                  Edit
                </button>
                <button
                  className="btn-secondary !text-[10px]"
                  onClick={() => {
                    deletion.reset();
                    setRemove(s);
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {evidence && <Modal title={evidence.description} onClose={() => setEvidence(undefined)}><Receipts splitId={evidence.id} canManage={evidence.creatorId === user?.id} /></Modal>}
      {edit && (
        <SplitBuilder
          isOpen
          split={edit}
          initialPeople={people.data}
          onClose={() => setEdit(undefined)}
        />
      )}{" "}
      {remove && (
        <Confirm
          message="Delete this split and reverse its balance changes? Settled history cannot be changed."
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          error={deletion.error}
          busy={deletion.isPending}
        />
      )}
    </section>
  );
}
