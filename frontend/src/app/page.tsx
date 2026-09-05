"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ArrowUpRight, ArrowDownRight, Plus, CreditCard } from "lucide-react";
import { SplitBuilder } from "@/components/split/SplitBuilder";
import { useNetWorth, useAccounts, useDebtSummary } from "@/hooks/useDashboard";
import { useAuthStore } from "@/store/auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [isSplitBuilderOpen, setIsSplitBuilderOpen] = useState(false);
  
  // For demo/testing without login page yet
  const { token, setAuth } = useAuthStore();
  
  // Fetch real data
  const { data: netWorthData, isLoading: isNetWorthLoading } = useNetWorth();
  const { data: accounts, isLoading: isAccountsLoading } = useAccounts();
  const { data: debtSummary, isLoading: isDebtLoading } = useDebtSummary();

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <DashboardLayout>
      {/* HERO BALANCE CARD */}
      <section className="bg-surface-primary border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Total Net Worth</h2>
          <div className="flex items-baseline space-x-3">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
              {isNetWorthLoading ? "..." : formatCurrency(netWorthData?.netWorth || 0)}
            </h1>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border-soft pt-6">
          <BalanceMetric label="Assets" amount={isNetWorthLoading ? "..." : formatCurrency(netWorthData?.breakdown?.assets || 0)} />
          <BalanceMetric label="Liabilities" amount={isNetWorthLoading ? "..." : formatCurrency(netWorthData?.breakdown?.liabilities || 0)} negative />
          <BalanceMetric label="Group Balances" amount={isNetWorthLoading ? "..." : formatCurrency((netWorthData?.breakdown?.receivables || 0) - (netWorthData?.breakdown?.payables || 0))} positive />
        </div>
      </section>

      {/* QUICK ACTIONS & ACCOUNTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ACCOUNTS VAULT */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Accounts Vault</h3>
            <button className="text-sm text-brand-primary font-medium hover:underline">View All</button>
          </div>
          <div className="space-y-3">
            {isAccountsLoading ? (
               <div className="p-4 text-center text-text-secondary animate-pulse">Loading accounts...</div>
            ) : accounts && accounts.length > 0 ? (
               accounts.filter((a: any) => !['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE'].includes(a.type)).map((acc: any) => (
                 <AccountCard 
                   key={acc.id} 
                   name={acc.name} 
                   type={acc.type.replace('_', ' ')} 
                   balance={formatCurrency(acc.balance)} 
                   isLiability={['CREDIT_CARD', 'LOAN'].includes(acc.type)} 
                 />
               ))
            ) : (
               <div className="p-4 text-center text-text-secondary border border-border-soft rounded-xl border-dashed">No accounts found</div>
            )}
          </div>
        </section>

        {/* QUICK SPLIT & DEBT ACTION BOX */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Pending Debts</h3>
            <button className="p-2 bg-surface-secondary rounded-full hover:bg-border-soft transition-colors">
              <Plus className="w-4 h-4 text-text-primary" />
            </button>
          </div>
          <div className="bg-surface-primary border border-border-soft rounded-2xl p-5 shadow-sm space-y-4">
            
            <DebtItem name="Receivables" description="Total owed to you" amount={isDebtLoading ? "..." : formatCurrency(debtSummary?.totalOwedToYou || 0)} type="receivable" />
            <DebtItem name="Payables" description="Total you owe" amount={isDebtLoading ? "..." : formatCurrency(debtSummary?.totalYouOwe || 0)} type="payable" />

            
            <div className="pt-4 border-t border-border-soft flex space-x-3">
              <button 
                onClick={() => setIsSplitBuilderOpen(true)}
                className="flex-1 bg-brand-primary text-white font-medium py-2.5 rounded-lg hover:bg-brand-primary/90 transition-colors"
              >
                + Add Split
              </button>
              <button className="flex-1 bg-surface-secondary text-text-primary font-medium py-2.5 rounded-lg hover:bg-border-soft transition-colors border border-border-soft">
                Settle Up
              </button>
            </div>
          </div>
        </section>
      </div>

      <SplitBuilder isOpen={isSplitBuilderOpen} onClose={() => setIsSplitBuilderOpen(false)} />
    </DashboardLayout>
  );
}

function BalanceMetric({ label, amount, positive, negative }: { label: string, amount: string, positive?: boolean, negative?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${positive ? 'text-positive' : negative ? 'text-negative' : 'text-text-primary'}`}>
        {amount}
      </p>
    </div>
  );
}

function AccountCard({ name, type, balance, isLiability }: { name: string, type: string, balance: string, isLiability?: boolean }) {
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
      <span className={`font-semibold tabular-nums ${isLiability ? 'text-negative' : 'text-text-primary'}`}>
        {balance}
      </span>
    </div>
  );
}

function DebtItem({ name, description, amount, type }: { name: string, description: string, amount: string, type: 'receivable' | 'payable' }) {
  const isReceivable = type === 'receivable';
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
        <span className={`text-sm font-semibold tabular-nums ${isReceivable ? 'text-positive' : 'text-negative'}`}>
          {isReceivable ? '+' : '-'}{amount}
        </span>
      </div>
    </div>
  );
}
