"use client";
import { T } from "@/components/i18n/Language";
import { apiClient } from "@/lib/api/client";
import { useAction } from "@/hooks/useResource";
import { Account } from "@/lib/types";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
import { useFormat } from "@/lib/format";
export function AddAccountModal({
  isOpen,
  onClose,
  account,
}: {
  isOpen: boolean;
  onClose: () => void;
  account?: Account;
}) {
  const { currency } = useFormat();
  const action = useAction(
    (body: Record<string, unknown>) =>
      account
        ? apiClient.put(`/accounts/${account.id}`, body)
        : apiClient.post("/accounts", body),
    onClose,
  );
  if (!isOpen) return null;
  return (
    <Modal
      title={account ? "Edit account" : "New account"}
      onClose={onClose}
      busy={action.isPending}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            name: f.get("name"),
            ...(!account
              ? {
                  type: f.get("type"),
                  balance: Number(f.get("balance")),
                  currency,
                }
              : {}),
          });
        }}
      >
        <label className="label">
          <T text="Name" />
          <input
            className="field"
            name="name"
            required
            defaultValue={account?.name}
          />
        </label>
        {!account && (
          <>
            <label className="label">
              <T text="Type" />
              <select className="field" name="type">
                {[
                  "CASH",
                  "BANK_ACCOUNT",
                  "PREPAID_CARD",
                  "CREDIT_CARD",
                  "INVESTMENT",
                  "LOAN",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="label">
              Opening balance ({currency})
              <input
                className="field"
                name="balance"
                type="number"
                step="0.01"
                defaultValue="0"
                required
              />
            </label>
          </>
        )}
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          <T text="Save account" />
        </button>
      </form>
    </Modal>
  );
}
