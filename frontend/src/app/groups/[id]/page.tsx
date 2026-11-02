"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useGroupSplits, useGroupSimplification } from "@/hooks/useGroups";
import { useResource, useAction } from "@/hooks/useResource";
import { Group, Split } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { apiClient } from "@/lib/api/client";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
import { MemberPicker, Person } from "@/components/groups/MemberPicker";
import { SplitBuilder } from "@/components/split/SplitBuilder";
import { SettlementModal } from "@/components/settlements/SettlementModal";
import { Recurring, DueDrafts } from "@/components/recurring/Recurring";
import { Templates } from "@/components/groups/Templates";
import { Invitations } from "@/components/groups/Invitations";
import { useFormat } from "@/lib/format";
export default function GroupDetails() {
  const id = useParams().id as string,
    router = useRouter(),
    user = useAuthStore((s) => s.user),
    { money, date } = useFormat();
  const group = useResource<Group>(`/groups/${id}`),
    splits = useGroupSplits(id),
    graph = useGroupSimplification(id);
  const [edit, setEdit] = useState<Split | null | undefined>(),
    [remove, setRemove] = useState<Split>(),
    [manage, setManage] = useState(false),
    [settle, setSettle] = useState(false),
    [members, setMembers] = useState<Person[]>([]),
    [deleteGroup, setDeleteGroup] = useState(false);
  const owner = group.data?.ownerId === user?.id;
  const action = useAction(
    (request: {
      method: "put" | "post" | "delete";
      path: string;
      body?: unknown;
    }) =>
      request.method === "delete"
        ? apiClient.delete(request.path)
        : apiClient[request.method](request.path, request.body),
  );
  const deletion = useAction(
    () => apiClient.delete(`/splits/${remove?.id}`),
    () => setRemove(undefined),
  );
  const groupDeletion = useAction(
    () => apiClient.delete(`/groups/${id}`),
    () => router.push("/groups"),
  );
  const memberName = (uid: string) =>
    group.data?.members.find((m) => m.userId === uid)?.user?.name ??
    "Former member";
  return (
    <DashboardLayout>
      <Link href="/groups" className="text-brand-primary">
        ← Your groups
      </Link>
      <header className="flex justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{group.data?.name ?? "Group"}</h1>
          <p className="text-text-secondary text-sm">
            {group.data?.members.length ?? 0} members · {group.data?.currency}
          </p>
        </div>
        <div className="flex gap-2">
          {owner && (
            <button className="btn-secondary" onClick={() => setManage(true)}>
              Manage group
            </button>
          )}
          <button className="btn-secondary" onClick={() => setSettle(true)}>
            Settle up
          </button>
          <button className="btn" onClick={() => setEdit(null)}>
            Add split
          </button>
        </div>
      </header>
      <ErrorMessage error={group.error || splits.error || graph.error} />
      {owner && <Invitations groupId={id} />}
      {group.data && (
        <>
          <Templates group={group.data} />
          <Recurring group={group.data} />
          <DueDrafts groupId={id} />
        </>
      )}
      <section className="panel space-y-4">
        <h2 className="font-semibold text-lg">Simplified balances</h2>
        {graph.isLoading && <p>Loading balances…</p>}
        {graph.data?.simplifiedTransactions.length === 0 && (
          <p className="text-positive">All debts are settled.</p>
        )}
        {graph.data?.simplifiedTransactions.map((d) => (
          <div
            key={`${d.fromUserId}-${d.toUserId}`}
            className="flex justify-between gap-4 border-t border-border-soft pt-3"
          >
            <p>
              {memberName(d.fromUserId)}{" "}
              <span className="text-text-secondary">owes</span>{" "}
              {memberName(d.toUserId)}
            </p>
            <strong>{money(d.amount, group.data?.currency)}</strong>
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Expense history</h2>
        {splits.isLoading && <p>Loading expenses…</p>}
        {splits.data?.length === 0 && (
          <p className="panel">No expenses yet. Add a split to get started.</p>
        )}
        {splits.data?.map((s) => (
          <article
            className="panel flex flex-wrap justify-between gap-3"
            key={s.id}
          >
            <div>
              <h3 className="font-semibold">{s.description}</h3>
              <p className="text-xs text-text-secondary">
                {date(s.date)} · {s.splitType}
              </p>
              <p className="text-sm mt-2">
                {s.payers
                  .map(
                    (p) =>
                      `${memberName(p.userId)} paid ${money(p.amountPaid)}`,
                  )
                  .join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <strong>{money(s.totalAmount, s.currency)}</strong>
              {(owner || s.creatorId === user?.id) && (
                <>
                  <button className="btn-secondary" onClick={() => setEdit(s)}>
                    Edit
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      deletion.reset();
                      setRemove(s);
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </section>
      {edit !== undefined && (
        <SplitBuilder
          isOpen
          onClose={() => setEdit(undefined)}
          groupId={id}
          groupMembers={group.data?.members ?? []}
          split={edit ?? undefined}
        />
      )}{" "}
      {settle && (
        <SettlementModal groupId={id} onClose={() => setSettle(false)} />
      )}{" "}
      {remove && (
        <Confirm
          message="Delete this expense and reverse all its accounting entries? Changes are blocked after settlements."
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate()}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}{" "}
      {manage && group.data && (
        <Modal title="Manage group" onClose={() => setManage(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate({
                method: "put",
                path: `/groups/${id}`,
                body: { name: new FormData(e.currentTarget).get("name") },
              });
            }}
          >
            <label className="label">
              Name
              <input
                className="field"
                name="name"
                required
                defaultValue={group.data.name}
              />
            </label>
            <button className="btn" disabled={action.isPending}>
              Save name
            </button>
          </form>
          <h3 className="font-semibold">Members</h3>
          {group.data.members.map((m) => (
            <div className="flex justify-between items-center" key={m.userId}>
              <span>
                {m.user?.name}
                {m.userId === group.data?.ownerId ? " · Owner" : ""}
              </span>
              {m.userId !== group.data?.ownerId && (
                <button
                  className="btn-secondary"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      method: "delete",
                      path: `/groups/${id}/members/${m.userId}`,
                    })
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <MemberPicker selected={members} onChange={setMembers} />
          <button
            className="btn-secondary"
            disabled={members.length !== 1 || action.isPending}
            onClick={() =>
              action.mutate(
                {
                  method: "post",
                  path: `/groups/${id}/members`,
                  body: { userId: members[0].id },
                },
                { onSuccess: () => setMembers([]) },
              )
            }
          >
            Add selected member
          </button>
          <p className="text-xs text-text-secondary">
            Add one registered member at a time. Settle debts before removal.
          </p>
          <ErrorMessage error={action.error} />
          <button
            className="btn-secondary text-negative"
            onClick={() => setDeleteGroup(true)}
          >
            Delete empty group
          </button>
        </Modal>
      )}{" "}
      {deleteGroup && (
        <Confirm
          message="Delete this group? Groups with financial history cannot be deleted."
          onClose={() => setDeleteGroup(false)}
          onConfirm={() => groupDeletion.mutate()}
          busy={groupDeletion.isPending}
          error={groupDeletion.error}
        />
      )}
    </DashboardLayout>
  );
}
