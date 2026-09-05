"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { ArrowLeft, Users, Receipt, UserPlus, Settings } from "lucide-react";
import { useGroupSplits, useGroupSimplification, useGroups } from "@/hooks/useGroups";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/store/auth";

export default function GroupDetails() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.id as string;
  const { user } = useAuthStore();
  
  const [viewMode, setViewMode] = useState<'LEDGER' | 'BALANCES'>('LEDGER');

  const { data: groups } = useGroups();
  const group = groups?.find((g: any) => g.id === groupId);

  const { data: splits, isLoading: isSplitsLoading } = useGroupSplits(groupId);
  const { data: simplified, isLoading: isSimplifiedLoading } = useGroupSimplification(groupId);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <DashboardLayout>
      {/* HEADER */}
      <header className="flex items-center justify-between pb-4 border-b border-border-soft">
        <div className="flex items-center space-x-4">
          <button onClick={() => router.push('/groups')} className="p-2 hover:bg-surface-secondary rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-primary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{group?.name || 'Group Details'}</h1>
            <p className="text-sm text-text-secondary flex items-center mt-1">
              <Users className="w-4 h-4 mr-1.5" /> {group?.members?.length || 0} Members
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <button className="p-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-border-soft transition-colors border border-border-soft">
            <UserPlus className="w-4 h-4" />
          </button>
          <button className="p-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-border-soft transition-colors border border-border-soft">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* PILL-BASED SEGMENTED CONTROLS */}
      <div className="flex p-1 bg-surface-secondary rounded-xl w-full max-w-sm mx-auto my-6 border border-border-soft">
        <button 
          onClick={() => setViewMode('LEDGER')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${viewMode === 'LEDGER' ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
        >
          Group Ledger
        </button>
        <button 
          onClick={() => setViewMode('BALANCES')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${viewMode === 'BALANCES' ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
        >
          Net Balances
        </button>
      </div>

      {viewMode === 'LEDGER' ? (
        <section className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Recent Splits</h2>
          </div>
          
          {isSplitsLoading ? (
            <div className="text-text-secondary p-4 animate-pulse">Loading splits...</div>
          ) : splits && splits.length > 0 ? (
            splits.map((split: any) => {
              // Calculate user's specific impact
              const myPaid = split.payers?.find((p: any) => p.userId === user?.id)?.amountPaid || 0;
              const myOwed = split.participants?.find((p: any) => p.userId === user?.id)?.amountOwed || 0;
              const netImpact = myPaid - myOwed;
              
              let impactType: 'payable' | 'receivable' | 'neutral' = 'neutral';
              let impactMessage = 'Not involved';
              let impactAmountStr = formatCurrency(0);

              if (netImpact > 0.01) {
                impactType = 'receivable';
                impactMessage = 'You lent';
                impactAmountStr = `+${formatCurrency(netImpact)}`;
              } else if (netImpact < -0.01) {
                impactType = 'payable';
                impactMessage = 'You owe';
                impactAmountStr = formatCurrency(netImpact);
              } else if (myPaid > 0 || myOwed > 0) {
                impactMessage = 'Settled';
              }

              return (
                <TransactionCard 
                  key={split.id}
                  description={split.description}
                  category={split.splitType}
                  date={new Date(split.date).toLocaleDateString()}
                  totalAmount={formatCurrency(split.totalAmount)}
                  impactAmount={impactAmountStr}
                  impactType={impactType}
                  impactMessage={impactMessage}
                />
              );
            })
          ) : (
            <div className="text-text-secondary text-center p-8 border border-dashed border-border-soft rounded-2xl">No expenses recorded yet.</div>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Simplified Debt Graph</h2>
          </div>
          
          {isSimplifiedLoading ? (
            <div className="text-text-secondary p-4 animate-pulse">Running Min-Cash-Flow algorithm...</div>
          ) : simplified?.simplifiedTransactions?.length > 0 ? (
            simplified.simplifiedTransactions.map((tx: any, idx: number) => (
              <div key={idx} className="bg-surface-primary border border-border-soft rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center font-semibold text-text-primary">
                    {tx.fromUserId.charAt(0)}
                  </div>
                  <span className="text-text-secondary mx-2">owes</span>
                  <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center font-semibold text-text-primary">
                    {tx.toUserId.charAt(0)}
                  </div>
                </div>
                <span className="font-bold text-lg tabular-nums text-text-primary">
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            ))
          ) : (
            <div className="text-text-secondary text-center p-8 border border-dashed border-border-soft rounded-2xl">All debts are settled!</div>
          )}
        </section>
      )}

      {/* FLOATING ACTION BUTTON */}
      <div className="fixed bottom-20 md:bottom-10 right-4 md:right-10">
        <button className="bg-brand-primary text-white shadow-lg rounded-full p-4 hover:bg-brand-primary/90 hover:scale-105 active:scale-95 transition-all">
          <Receipt className="w-6 h-6" />
        </button>
      </div>
    </DashboardLayout>
  );
}

function TransactionCard({ 
  description, category, date, totalAmount, impactAmount, impactType, impactMessage 
}: { 
  description: string, category: string, date: string, totalAmount: string, impactAmount: string, impactType: 'payable' | 'receivable' | 'neutral', impactMessage: string 
}) {
  const isNeutral = impactType === 'neutral';
  const isReceivable = impactType === 'receivable';
  
  return (
    <div className="bg-surface-primary border border-border-soft rounded-2xl p-4 flex items-center justify-between hover:bg-surface-secondary/50 transition-colors cursor-pointer">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center border border-border-soft">
          <Receipt className="w-6 h-6 text-text-secondary" />
        </div>
        <div>
          <h4 className="font-medium text-text-primary text-base">{description}</h4>
          <p className="text-xs text-text-secondary mt-0.5">{category} • {date}</p>
        </div>
      </div>
      
      <div className="text-right">
        <p className="text-sm text-text-primary font-medium tabular-nums">{totalAmount}</p>
        <div className="flex items-center justify-end mt-1 space-x-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${
            isNeutral ? 'bg-surface-secondary text-text-secondary' : 
            isReceivable ? 'bg-positive/10 text-positive' : 
            'bg-negative/10 text-negative'
          }`}>
            {impactMessage}
          </span>
          {!isNeutral && (
             <span className={`text-xs font-bold tabular-nums ${isReceivable ? 'text-positive' : 'text-negative'}`}>
               {impactAmount}
             </span>
          )}
        </div>
      </div>
    </div>
  );
}
