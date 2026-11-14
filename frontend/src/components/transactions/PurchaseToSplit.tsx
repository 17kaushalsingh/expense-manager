"use client";
import { useState } from "react";
import { T } from "@/components/i18n/Language";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
import { SplitBuilder } from "@/components/split/SplitBuilder";
import { useResource } from "@/hooks/useResource";
import { useFormat } from "@/lib/format";
import { translate } from "@/lib/i18n/catalogs";
import { apiClient } from "@/lib/api/client";
import { Group, Transaction, SplitInput } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
export function PurchaseToSplit({
  purchase,
  onClose,
  onShared,
}: {
  purchase: Transaction;
  onClose: () => void;
  onShared: () => void;
}) {
  const user = useAuthStore((s) => s.user)!,
    { currency, money, locale } = useFormat();
  const groups = useResource<Group[]>("/groups"),
    receipts = useResource<{ id: string }[]>(
      `/receipts?transactionId=${purchase.id}`,
    );
  const [groupId, setGroupId] = useState(""),
    [review, setReview] = useState(false),
    [shareReceipts, setShareReceipts] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  const selected = groups.data?.find((g) => g.id === groupId),
    accountCurrency = purchase.account?.currency ?? currency;
  if (review && purchase.updatedAt) {
    const initial: SplitInput = {
      description: (
        purchase.notes || translate("Shared purchase", locale)
      ).slice(0, 200),
      totalAmount: purchase.amount,
      splitType: "EQUAL",
      date: purchase.dateTime,
      categoryId: purchase.categoryId,
      payers: [
        {
          userId: user.id,
          amountPaid: purchase.amount,
          accountId: purchase.accountId,
        },
      ],
      participants: selected?.members.map((m) => ({ userId: m.userId })) ?? [
        { userId: user.id },
      ],
    };
    return (
      <SplitBuilder
        isOpen
        onClose={onClose}
        title={translate("Share a recorded purchase", locale)}
        submitLabel={translate("Convert purchase to shared expense", locale)}
        groupId={selected?.id}
        groupMembers={selected?.members}
        initial={initial}
        fundedPurchase={{
          accountId: purchase.accountId,
          amount: purchase.amount,
        }}
        onSave={async (body) => {
          await apiClient.post(`/transactions/${purchase.id}/share`, {
            requestKey: key,
            expectedUpdatedAt: purchase.updatedAt,
            groupId: selected?.id ?? null,
            description: body.description,
            categoryId: body.categoryId ?? null,
            splitType: body.splitType,
            participants: body.participants,
            shareReceipts,
          });
          onShared();
        }}
      />
    );
  }
  const canReview =
    !!purchase.updatedAt &&
    !groups.isPending &&
    !groups.error &&
    !receipts.isPending &&
    !receipts.error &&
    (!receipts.data?.length || shareReceipts);
  return (
    <Modal
      title={translate("Share a recorded purchase", locale)}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-xl font-semibold">
          {money(purchase.amount, accountCurrency)}
        </p>
        <p className="text-sm">
          <T text="The existing cash payment, date and paying account stay fixed. Your personal spending becomes your allocated share. The original manual entry is replaced atomically." />
        </p>
        <p className="text-sm text-text-secondary">
          <T text="Paying account" />: {purchase.account?.name ?? "—"}
        </p>
        <label className="label">
          <T text="Group" />
          <select
            className="field"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">
              <T text="Choose people without a group" />
            </option>
            {groups.data?.map((g) => (
              <option
                key={g.id}
                value={g.id}
                disabled={g.currency !== accountCurrency}
              >
                {g.name} · {g.currency}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-text-secondary">
          <T text="Only groups in the purchase currency can be selected. Event-linked purchases and installment plans must be unlinked first." />
        </p>
        {receipts.isPending && (
          <p role="status">
            <T text="Checking attached receipts…" />
          </p>
        )}
        {!!receipts.data?.length && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={shareReceipts}
              onChange={(e) => setShareReceipts(e.target.checked)}
            />
            <T text="I approve moving the attached receipts to the shared expense, where the selected people can access them." />
          </label>
        )}
        {!purchase.updatedAt && (
          <p role="alert">
            <T text="Refresh this purchase before sharing it." />
          </p>
        )}
        <ErrorMessage error={groups.error || receipts.error} />
        <button
          className="btn"
          disabled={!canReview}
          onClick={() => setReview(true)}
        >
          <T text="Review allocation" />
        </button>
      </div>
    </Modal>
  );
}
