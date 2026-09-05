"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ArrowUpRight, ArrowDownRight, Plus, CreditCard } from "lucide-react";
import { SplitBuilder } from "@/components/split/SplitBuilder";

export default function Home() {
  const [isSplitBuilderOpen, setIsSplitBuilderOpen] = useState(false);

  return (
    <DashboardLayout>
      {/* HERO BALANCE CARD */}
      <section className="bg-surface-primary border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Total Net Worth</h2>
          <div className="flex items-baseline space-x-3">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">$42,850.50</h1>
            <span className="text-positive font-medium flex items-center bg-positive/10 px-2 py-1 rounded-md text-sm">
              <ArrowUpRight className="w-4 h-4 mr-1" />
              4.2%
            </span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border-soft pt-6">
          <BalanceMetric label="Assets" amount="$50,000.00" />
          <BalanceMetric label="Liabilities" amount="-$10,000.00" negative />
          <BalanceMetric label="Group Balances" amount="+$2,850.50" positive />
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
            <AccountCard name="HDFC Bank" type="Checking" balance="$12,400.00" />
            <AccountCard name="AMEX Credit" type="Credit Card" balance="-$1,200.00" isLiability />
            <AccountCard name="Groww ETFs" type="Investment" balance="$31,000.00" />
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
            <DebtItem name="Alex" description="Owes you for Dinner" amount="$120.00" type="receivable" />
            <DebtItem name="Group Trip" description="You owe for Airbnb" amount="$45.00" type="payable" />
            
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
