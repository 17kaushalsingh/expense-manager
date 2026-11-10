"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Wallet,
  ChevronRight,
  CalendarDays,
  Target,
  Shapes,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource } from "@/hooks/useResource";
import { useAccounts, useNetWorth, useDebtSummary } from "@/hooks/useDashboard";
import { useGroups } from "@/hooks/useGroups";
import { useFormat } from "@/lib/format";
import { Transaction, Category } from "@/lib/types";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import {
  TransactionEditor,
  Transfer,
} from "@/components/transactions/TransactionForms";
import { IndividualSplits } from "@/components/split/IndividualSplits";
import { SplitBuilder } from "@/components/split/SplitBuilder";
import { SettlementModal } from "@/components/settlements/SettlementModal";
import { PlanningOverview } from "@/components/planning/PlanningOverview";
import { DueDrafts } from "@/components/recurring/Recurring";
import { ErrorMessage } from "@/components/ui/Controls";
export default function Home() {
  const { money, timezone } = useFormat();
  const worth = useNetWorth(),
    accounts = useAccounts(),
    debts = useDebtSummary(),
    groups = useGroups();
  const flow = useResource<{
    totalIncome: number;
    totalExpense: number;
    cashFlow: number;
  }>("/analytics/cash-flow?range=1M");
  const recent = useResource<{ items: Transaction[]; total: number }>(
    "/transactions/page?limit=30",
  );
  const categories = useResource<Category[]>("/categories");
  const [entry, setEntry] = useState(false),
    [split, setSplit] = useState(false),
    [transfer, setTransfer] = useState(false),
    [settle, setSettle] = useState(false);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date());
  const cash =
    accounts.data?.filter(
      (a) => !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(a.type),
    ) ?? [];
  return (
    <DashboardLayout>
      <header className="flex justify-between items-end gap-4">
        <div>
          <p className="eyebrow mb-1.5">{dateLabel}</p>
          <h1 className="text-[32px]">Overview</h1>
          <p className="text-text-secondary text-xs mt-1">
            Your accounts and shared expenses.
          </p>
        </div>
        <button
          className="btn hidden sm:inline-flex gap-2"
          onClick={() => setEntry(true)}
        >
          <Plus size={16} />
          Add transaction
        </button>
      </header>
      <ErrorMessage
        error={
          worth.error ||
          accounts.error ||
          flow.error ||
          recent.error ||
          groups.error
        }
      />
      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
        <section className="balance-hero space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/95 text-xs">Total balance · net worth</p>
              <p className="text-[42px] md:text-[48px] tracking-[-.06em] font-semibold tabular-nums mt-1 leading-tight">
                {worth.isLoading ? "—" : money(worth.data?.netWorth ?? 0)}
              </p>
            </div>
            <span className="grid place-items-center rounded-full bg-white/10 h-9 w-9">
              <Wallet size={17} className="text-white/95" />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-white/95 text-[10px] flex gap-1.5 items-center">
                <ArrowDownLeft size={12} />
                Income · 30 days
              </p>
              <p className="font-semibold text-lg mt-1 tabular-nums">
                {flow.isLoading ? "—" : money(flow.data?.totalIncome ?? 0)}
              </p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2.5">
              <p className="text-white/95 text-[10px] flex gap-1.5 items-center">
                <ArrowUpRight size={12} />
                Expenses · 30 days
              </p>
              <p className="font-semibold text-lg mt-1 tabular-nums">
                {flow.isLoading ? "—" : money(flow.data?.totalExpense ?? 0)}
              </p>
            </div>
          </div>
        </section>
        <section className="panel !p-0 overflow-hidden order-3 lg:order-2">
          <div className="flex justify-between items-center px-5 pt-5 pb-3">
            <h2 className="section-title">Accounts</h2>
            <Link href="/accounts" className="subtle-link">
              View all
              <ChevronRight size={13} />
            </Link>
          </div>
          {accounts.isLoading ? (
            <p className="p-5 text-text-secondary">Loading balances…</p>
          ) : cash.length ? (
            cash.slice(0, 3).map((a) => (
              <Link
                href={`/transactions?accountId=${a.id}`}
                className="list-row"
                key={a.id}
              >
                <span className="icon-tile !h-8 !w-8">
                  <Wallet size={14} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium truncate">
                    {a.name}
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    {a.type.replaceAll("_", " ").toLowerCase()}
                  </span>
                </span>
                <strong className="text-xs tabular-nums">
                  {money(a.balance, a.currency)}
                </strong>
              </Link>
            ))
          ) : (
            <Link
              className="block px-5 pb-5 text-text-secondary text-sm"
              href="/accounts"
            >
              Add your first account →
            </Link>
          )}
        </section>
        <section
          className="grid grid-cols-5 gap-2 sm:gap-5 py-1 order-2 lg:order-3 lg:col-span-2"
          aria-label="Quick actions"
        >
          {[
            {
              label: "Expense",
              Icon: Plus,
              run: () => setEntry(true),
              color: "#e9f1eb",
            },
            {
              label: "Split bill",
              Icon: Users,
              run: () => setSplit(true),
              color: "#edf0f8",
            },
            {
              label: "Transfer",
              Icon: ArrowLeftRight,
              run: () => setTransfer(true),
              color: "#f5ede2",
            },
          ].map(({ label, Icon, run, color }) => (
            <button
              className="flex flex-col items-center gap-2 py-2"
              key={label}
              onClick={run}
            >
              <span
                className="h-11 w-11 rounded-2xl grid place-items-center text-[#4b5a51]"
                style={{ background: color }}
              >
                <Icon size={19} strokeWidth={1.7} />
              </span>
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          ))}
          <Link
            className="flex flex-col items-center gap-2 py-2"
            href="/budgets"
          >
            <span className="h-11 w-11 rounded-2xl grid place-items-center bg-[#f8e9e7] text-[#a97469]">
              <Shapes size={19} strokeWidth={1.7} />
            </span>
            <span className="text-[11px] font-medium">Budgets</span>
          </Link>
          <Link className="flex flex-col items-center gap-2 py-2" href="/goals">
            <span className="h-11 w-11 rounded-2xl grid place-items-center bg-[#eeebf5] text-[#8e7aab]">
              <Target size={19} strokeWidth={1.7} />
            </span>
            <span className="text-[11px] font-medium">Savings</span>
          </Link>
        </section>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-title">Recent activity</h2>
              <Link href="/transactions" className="subtle-link">
                See all
                <ChevronRight size={13} />
              </Link>
            </div>
            <div className="grouped-list">
              {recent.isLoading ? (
                <p className="p-5 text-text-secondary">
                  Loading your transactions…
                </p>
              ) : (
                recent.data?.items
                  .filter(
                    (t) =>
                      !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(
                        t.account?.type ?? "",
                      ),
                  )
                  .slice(0, 6)
                  .map((t) => (
                    <Link
                      key={t.id}
                      href={`/transactions?accountId=${t.accountId}`}
                    >
                      <TransactionRow transaction={t} compact />
                    </Link>
                  ))
              )}
              {recent.data?.items.length === 0 && (
                <div className="px-5 py-8">
                  <p className="font-medium mb-1">A fresh start.</p>
                  <p className="text-text-secondary text-xs">
                    Your first expense is a tap away.
                  </p>
                  <button
                    className="subtle-link mt-3"
                    onClick={() => setEntry(true)}
                  >
                    Add an expense
                    <Plus size={13} />
                  </button>
                </div>
              )}
            </div>
          </section>
          <section>
            <div className="flex justify-between items-center mb-3">
              <h2 className="section-title">Shared with friends</h2>
              <Link href="/groups" className="subtle-link">
                All groups
                <ChevronRight size={13} />
              </Link>
            </div>
            <div className="grouped-list">
              {groups.data
                ?.filter((g) => !g.archived)
                .slice(0, 3)
                .map((g) => (
                  <Link
                    className="list-row"
                    key={g.id}
                    href={`/groups/${g.id}`}
                  >
                    <span className="icon-tile">
                      <Users size={17} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[13px] font-medium">
                        {g.name}
                      </span>
                      <span className="text-[11px] text-text-secondary">
                        {g.members.length} members
                      </span>
                    </span>
                    <span
                      className={`text-xs font-medium ${Number(g.myBalance) < 0 ? "text-negative" : "text-positive"}`}
                    >
                      {Number(g.myBalance) === 0
                        ? "Settled up"
                        : `${Number(g.myBalance) > 0 ? "Owed to you" : "You owe"} ${money(Math.abs(Number(g.myBalance)), g.currency)}`}
                    </span>
                  </Link>
                ))}
              {groups.data?.length === 0 && (
                <Link
                  href="/groups"
                  className="list-row text-text-secondary text-xs"
                >
                  <Users size={17} />
                  Create a group for your next shared bill
                  <ChevronRight size={14} />
                </Link>
              )}
            </div>
            <div className="flex justify-between items-center px-1 pt-3 text-[11px] text-text-secondary">
              <span>
                Owed to you{" "}
                <strong className="text-positive ml-1">
                  {money(debts.data?.totalOwedToYou ?? 0)}
                </strong>{" "}
                · You owe{" "}
                <strong className="text-negative ml-1">
                  {money(debts.data?.totalYouOwe ?? 0)}
                </strong>
              </span>
              <button className="subtle-link" onClick={() => setSettle(true)}>
                Settle up
              </button>
            </div>
          </section>
          <IndividualSplits />
        </div>
        <div className="space-y-5">
          <PlanningOverview />
          <DueDrafts />
          <Link
            href="/transactions?view=calendar"
            className="panel !py-4 flex gap-3 items-center"
          >
            <span className="icon-tile">
              <CalendarDays size={17} />
            </span>
            <span className="flex-1">
              <span className="block text-xs font-semibold">
                Your spending calendar
              </span>
              <span className="block text-[11px] text-text-secondary mt-0.5">
                Find the days that added up.
              </span>
            </span>
            <ChevronRight size={15} className="text-text-secondary" />
          </Link>
        </div>
      </div>
      {entry && (
        <TransactionEditor
          accounts={cash}
          categories={categories.data ?? []}
          onClose={() => setEntry(false)}
        />
      )}{" "}
      {transfer && (
        <Transfer accounts={cash} onClose={() => setTransfer(false)} />
      )}
      <SplitBuilder isOpen={split} onClose={() => setSplit(false)} />
      {settle && <SettlementModal onClose={() => setSettle(false)} />}
    </DashboardLayout>
  );
}
