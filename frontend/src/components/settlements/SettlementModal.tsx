"use client";
import { useState } from "react";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
import { useGroups } from "@/hooks/useGroups";
import { useResource, useAction } from "@/hooks/useResource";
import { useAccounts } from "@/hooks/useDashboard";
import { useAuthStore } from "@/store/auth";
import { DebtGraph } from "@/lib/types";
import { apiClient } from "@/lib/api/client";
import { useFormat } from "@/lib/format";
export function SettlementModal({
  groupId,
  onClose,
}: {
  groupId?: string;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user)!;
  const groups = useGroups(),
    accounts = useAccounts(),
    { money } = useFormat();
  const [context, setContext] = useState(groupId ?? ""),
    [edge, setEdge] = useState(""),
    [amount, setAmount] = useState("");
  const people =
    useResource<{ id: string; name: string }[]>("/users/debt-people");
  const graph = useResource<DebtGraph>(
    context ? `/groups/${context}/simplify-debts` : "/analytics/debts",
  );
  const debts =
    graph.data?.simplifiedTransactions.filter(
      (d) => d.fromUserId === user.id,
    ) ?? [];
  const selected = debts.find((d) => d.toUserId === edge);
  const group = groups.data?.find((g) => g.id === context);
  const action = useAction(
    (body: Record<string, unknown>) => apiClient.post("/settlements", body),
    onClose,
  );
  return (
    <Modal title="Settle up" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            groupId: context || null,
            payeeId: edge,
            amount: Number(amount),
            accountId: f.get("accountId"),
            method: f.get("method"),
            notes: String(f.get("notes") || "") || undefined,
          });
        }}
      >
        {!groupId && (
          <label className="label">
            Context
            <select
              className="field"
              value={context}
              onChange={(e) => {
                setContext(e.target.value);
                setEdge("");
                setAmount("");
              }}
            >
              <option value="">Individual expenses</option>
              {groups.data?.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <ErrorMessage error={graph.error || action.error || accounts.error} />
        {graph.isLoading && <p>Loading balances…</p>}
        {!graph.isLoading && !debts.length && (
          <p>No outstanding payments for you in this context.</p>
        )}
        <label className="label">
          Pay to
          <select
            className="field"
            required
            value={edge}
            onChange={(e) => {
              setEdge(e.target.value);
              setAmount(
                String(
                  debts.find((d) => d.toUserId === e.target.value)?.amount ??
                    "",
                ),
              );
            }}
          >
            <option value="">Choose recipient</option>
            {debts.map((d) => (
              <option key={d.toUserId} value={d.toUserId}>
                {group?.members.find((m) => m.userId === d.toUserId)?.user
                  ?.name ??
                  people.data?.find((p) => p.id === d.toUserId)?.name ??
                  "Member"}{" "}
                · {money(d.amount)}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Amount
          <input
            className="field"
            type="number"
            required
            min="0.01"
            step="0.01"
            max={selected?.amount}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="label">
          Paying account
          <select className="field" name="accountId" required>
            <option value="">Choose account</option>
            {accounts.data
              ?.filter(
                (a) =>
                  !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(a.type),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="label">
          Method
          <select className="field" name="method">
            {["CASH", "BANK_TRANSFER", "CARD", "OTHER"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Notes
          <input className="field" name="notes" />
        </label>
        <button
          className="btn"
          disabled={
            !selected ||
            Number(amount) <= 0 ||
            Number(amount) > selected.amount ||
            action.isPending
          }
        >
          Record payment
        </button>
      </form>
    </Modal>
  );
}
