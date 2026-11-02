"use client";

import { DueDrafts } from "@/components/recurring/Recurring";
import Link from "next/link";
import { useResource, useAction } from "@/hooks/useResource";
import { Split } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { apiClient } from "@/lib/api/client";
import { Confirm } from "@/components/ui/Controls";
import { SettlementModal } from "@/components/settlements/SettlementModal";
import { useFormat } from "@/lib/format";
import { ErrorMessage } from "@/components/ui/Controls";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Plus, CreditCard } from "lucide-react";
import { SplitBuilder } from "@/components/split/SplitBuilder";
import { useNetWorth, useAccounts, useDebtSummary } from "@/hooks/useDashboard";

export default function Home() {
  const [isSplitBuilderOpen, setIsSplitBuilderOpen] = useState(false);

  const [settle, setSettle] = useState(false);
  const [edit, setEdit] = useState<Split>();
  const [remove, setRemove] = useState<Split>();
  const individual = useResource<Split[]>("/splits");
  const people =
    useResource<{ id: string; name: string }[]>("/users/debt-people");
  const user = useAuthStore((s) => s.user);
  const deletion = useAction(
    () => apiClient.delete(`/splits/${remove?.id}`),
    () => setRemove(undefined),
  );

  // Fetch real data
  const {
    data: netWorthData,
    isLoading: isNetWorthLoading,
    error: netWorthError,
  } = useNetWorth();
  const {
    data: accounts,
    isLoading: isAccountsLoading,
    error: accountsError,
  } = useAccounts();
  const {
    data: debtSummary,
    isLoading: isDebtLoading,
    error: debtError,
  } = useDebtSummary();

  const { money: formatCurrency } = useFormat();

  return (
    <DashboardLayout>
      <ErrorMessage error={netWorthError || accountsError || debtError} />
      {/* HERO BALANCE CARD */}
      <section className="bg-surface-primary border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">
            Total Net Worth
          </h2>
          <div className="flex items-baseline space-x-3">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
              {isNetWorthLoading
                ? "..."
                : formatCurrency(netWorthData?.netWorth || 0)}
            </h1>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border-soft pt-6">
          <BalanceMetric
            label="Assets"
            amount={
              isNetWorthLoading
                ? "..."
                : formatCurrency(netWorthData?.breakdown?.assets || 0)
            }
          />
          <BalanceMetric
            label="Liabilities"
            amount={
              isNetWorthLoading
                ? "..."
                : formatCurrency(netWorthData?.breakdown?.liabilities || 0)
            }
            negative
          />
          <BalanceMetric
            label="Group Balances"
            amount={
              isNetWorthLoading
                ? "..."
                : formatCurrency(
                    (netWorthData?.breakdown?.receivables || 0) -
                      (netWorthData?.breakdown?.payables || 0),
                  )
            }
            positive
          />
        </div>
      </section>

      <DueDrafts />
      {/* QUICK ACTIONS & ACCOUNTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ACCOUNTS VAULT */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Accounts Vault</h3>
            <Link
              href="/accounts"
              className="text-sm text-brand-primary font-medium hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {isAccountsLoading ? (
              <div className="p-4 text-center text-text-secondary animate-pulse">
                Loading accounts...
              </div>
            ) : accounts && accounts.length > 0 ? (
              accounts
                .filter(
                  (a) =>
                    !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(
                      a.type,
                    ),
                )
                .map((acc) => (
                  <AccountCard
                    key={acc.id}
                    name={acc.name}
                    type={acc.type.replace("_", " ")}
                    balance={formatCurrency(acc.balance)}
                    isLiability={["CREDIT_CARD", "LOAN"].includes(acc.type)}
                  />
                ))
            ) : (
              <div className="p-4 text-center text-text-secondary border border-border-soft rounded-xl border-dashed">
                No accounts found
              </div>
            )}
          </div>
        </section>

        {/* QUICK SPLIT & DEBT ACTION BOX */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Pending Debts</h3>
            <button
              onClick={() => setIsSplitBuilderOpen(true)}
              aria-label="Add split"
              className="p-2 bg-surface-secondary rounded-full hover:bg-border-soft transition-colors"
            >
              <Plus className="w-4 h-4 text-text-primary" />
            </button>
          </div>
          <div className="bg-surface-primary border border-border-soft rounded-2xl p-5 shadow-sm space-y-4">
            <DebtItem
              name="Receivables"
              description="Total owed to you"
              amount={
                isDebtLoading
                  ? "..."
                  : formatCurrency(debtSummary?.totalOwedToYou || 0)
              }
              type="receivable"
            />
            <DebtItem
              name="Payables"
              description="Total you owe"
              amount={
                isDebtLoading
                  ? "..."
                  : formatCurrency(debtSummary?.totalYouOwe || 0)
              }
              type="payable"
            />

            <div className="pt-4 border-t border-border-soft flex space-x-3">
              <button
                onClick={() => setIsSplitBuilderOpen(true)}
                className="flex-1 bg-brand-primary text-white font-medium py-2.5 rounded-lg hover:bg-brand-primary/90 transition-colors"
              >
                + Add Split
              </button>
              <button
                onClick={() => setSettle(true)}
                className="flex-1 bg-surface-secondary text-text-primary font-medium py-2.5 rounded-lg hover:bg-border-soft transition-colors border border-border-soft"
              >
                Settle Up
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Individual expenses</h2>
        <ErrorMessage error={individual.error} />
        {individual.data?.length === 0 && (
          <p className="panel text-text-secondary">
            No individual split expenses yet.
          </p>
        )}
        {individual.data?.map((s) => (
          <article
            className="panel flex flex-wrap gap-3 justify-between items-center"
            key={s.id}
          >
            <div>
              <h3 className="font-semibold">{s.description}</h3>
              <p className="text-sm text-text-secondary">
                {s.splitType} · {formatCurrency(s.totalAmount)}
              </p>
            </div>
            {s.creatorId === user?.id && (
              <div className="flex gap-2">
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
              </div>
            )}
          </article>
        ))}
      </section>
      {edit && (
        <SplitBuilder
          isOpen
          split={edit}
          onClose={() => setEdit(undefined)}
          groupMembers={[
            ...new Set(
              [...edit.payers, ...edit.participants].map((p) => p.userId),
            ),
          ].map((id) => ({
            userId: id,
            user: {
              id,
              name: people.data?.find((p) => p.id === id)?.name ?? "Member",
            },
          }))}
        />
      )}
      {remove && (
        <Confirm
          message="Delete this individual expense and reverse its ledger entries?"
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate()}
          error={deletion.error}
          busy={deletion.isPending}
        />
      )}
      {settle && <SettlementModal onClose={() => setSettle(false)} />}
      <SplitBuilder
        isOpen={isSplitBuilderOpen}
        onClose={() => setIsSplitBuilderOpen(false)}
      />
    </DashboardLayout>
  );
}

function BalanceMetric({
  label,
  amount,
  positive,
  negative,
}: {
  label: string;
  amount: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-text-secondary">{label}</p>
      <p
        className={`text-xl font-semibold tabular-nums ${positive ? "text-positive" : negative ? "text-negative" : "text-text-primary"}`}
      >
        {amount}
      </p>
    </div>
  );
}

function AccountCard({
  name,
  type,
  balance,
  isLiability,
}: {
  name: string;
  type: string;
  balance: string;
  isLiability?: boolean;
}) {
  return (
    <div className="bg-surface-primary border border-border-soft rounded-xl p-4 flex items-center justify-between hover:bg-surface-secondary transition-colors cursor-pointer shadow-sm">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center border border-border-soft">
          <CreditCard className="w-5 h-5 text-text-secondary" />
        </div>
        <div>
          <h4 className="font-medium text-text-primary">{name}</h4>
          <p className="text-xs text-text-secondary">{type}</p>
        </div>
      </div>
      <span
        className={`font-semibold tabular-nums ${isLiability ? "text-negative" : "text-text-primary"}`}
      >
        {balance}
      </span>
    </div>
  );
}

function DebtItem({
  name,
  description,
  amount,
  type,
}: {
  name: string;
  description: string;
  amount: string;
  type: "receivable" | "payable";
}) {
  const isReceivable = type === "receivable";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center font-semibold text-text-primary border border-border-soft">
          {name.charAt(0)}
        </div>
        <div>
          <h4 className="text-sm font-medium text-text-primary">{name}</h4>
          <p className="text-xs text-text-secondary">{description}</p>
        </div>
      </div>
      <div className="text-right">
        <span
          className={`text-sm font-semibold tabular-nums ${isReceivable ? "text-positive" : "text-negative"}`}
        >
          {isReceivable ? "+" : "-"}
          {amount}
        </span>
      </div>
    </div>
  );
}
