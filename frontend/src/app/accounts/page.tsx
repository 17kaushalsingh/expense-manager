"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { CreditCard, Plus, ArrowUpRight, ArrowDownRight, Landmark, Wallet } from "lucide-react";
import { useAccounts } from "@/hooks/useDashboard";
import { useState } from "react";

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts();
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  // Group accounts by type logic
  const banks = accounts?.filter((a: any) => ['BANK_ACCOUNT', 'CASH'].includes(a.type)) || [];
  const cards = accounts?.filter((a: any) => ['CREDIT_CARD', 'DEBIT_CARD', 'PREPAID_CARD'].includes(a.type)) || [];
  const investments = accounts?.filter((a: any) => ['INVESTMENT', 'LOAN', 'OTHER'].includes(a.type)) || [];

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between pb-4 border-b border-border-soft">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts Vault</h1>
          <p className="text-sm text-text-secondary mt-1">Manage all your linked and manual accounts</p>
        </div>
        <button 
          onClick={() => setIsAddAccountOpen(true)}
          className="flex items-center bg-brand-primary text-white font-medium px-4 py-2 rounded-lg hover:bg-brand-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Account
        </button>
      </div>

      <div className="pt-6 space-y-8">
        
        {/* Section: Banks & Cash */}
        <AccountSection 
          title="Bank & Cash" 
          icon={<Landmark className="w-5 h-5" />} 
          accounts={banks} 
          isLoading={isLoading} 
          formatCurrency={formatCurrency}
        />

        {/* Section: Cards */}
        <AccountSection 
          title="Credit & Debit Cards" 
          icon={<CreditCard className="w-5 h-5" />} 
          accounts={cards} 
          isLoading={isLoading} 
          formatCurrency={formatCurrency}
        />

        {/* Section: Investments & Loans */}
        <AccountSection 
          title="Investments & Loans" 
          icon={<Wallet className="w-5 h-5" />} 
          accounts={investments} 
          isLoading={isLoading} 
          formatCurrency={formatCurrency}
        />

      </div>
    </DashboardLayout>
  );
}

function AccountSection({ title, icon, accounts, isLoading, formatCurrency }: any) {
  if (!isLoading && accounts.length === 0) return null;

  return (
    <section>
      <div className="flex items-center space-x-2 mb-4">
        <div className="text-text-secondary">{icon}</div>
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="p-6 bg-surface-primary border border-border-soft rounded-2xl animate-pulse">
            <div className="h-4 bg-surface-secondary rounded w-1/3 mb-4"></div>
            <div className="h-8 bg-surface-secondary rounded w-1/2"></div>
          </div>
        ) : (
          accounts.map((acc: any) => {
            const isLiability = ['CREDIT_CARD', 'LOAN'].includes(acc.type);
            return (
              <div key={acc.id} className="bg-surface-primary border border-border-soft rounded-2xl p-5 hover:bg-surface-secondary transition-colors cursor-pointer shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="font-semibold text-text-primary text-lg">{acc.name}</h3>
                    <p className="text-xs text-text-secondary uppercase tracking-wider font-medium mt-1">
                      {acc.type.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="p-2 bg-surface-secondary rounded-lg border border-border-soft">
                    {isLiability ? <ArrowDownRight className="w-5 h-5 text-negative" /> : <ArrowUpRight className="w-5 h-5 text-positive" />}
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-text-secondary mb-1">Current Balance</p>
                  <p className={`text-2xl font-bold tabular-nums tracking-tight ${isLiability ? 'text-negative' : 'text-text-primary'}`}>
                    {formatCurrency(acc.balance)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
