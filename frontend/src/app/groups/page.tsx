import DashboardLayout from "@/components/layout/DashboardLayout";
import { ArrowLeft, Users, Receipt, UserPlus, Settings } from "lucide-react";

export default function GroupDetails() {
  return (
    <DashboardLayout>
      {/* HEADER */}
      <header className="flex items-center justify-between pb-4 border-b border-border-soft">
        <div className="flex items-center space-x-4">
          <button className="p-2 hover:bg-surface-secondary rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-primary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Goa Trip 2026</h1>
            <p className="text-sm text-text-secondary flex items-center mt-1">
              <Users className="w-4 h-4 mr-1.5" /> 4 Members
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
        <button className="flex-1 py-1.5 text-sm font-medium rounded-lg bg-surface-primary text-text-primary shadow-sm">
          Group Ledger
        </button>
        <button className="flex-1 py-1.5 text-sm font-medium rounded-lg text-text-secondary hover:text-text-primary transition-colors">
          Net Balances
        </button>
      </div>

      {/* DUAL-PERSPECTIVE TRANSACTION LIST */}
      <section className="space-y-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Recent Splits</h2>
          <span className="text-sm text-text-secondary">September 2026</span>
        </div>
        
        <TransactionCard 
          description="Airbnb Booking"
          category="Housing"
          date="Sep 4, 2026"
          totalAmount="$450.00"
          impactAmount="-$112.50"
          impactType="payable"
          impactMessage="You owe Alex"
        />
        <TransactionCard 
          description="Seafood Dinner"
          category="Food & Drink"
          date="Sep 3, 2026"
          totalAmount="$180.00"
          impactAmount="+$135.00"
          impactType="receivable"
          impactMessage="You lent $135.00"
        />
        <TransactionCard 
          description="Uber to Airport"
          category="Transport"
          date="Sep 1, 2026"
          totalAmount="$45.00"
          impactAmount="$0.00"
          impactType="neutral"
          impactMessage="Not involved"
        />
      </section>

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
        <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${
          isNeutral ? 'bg-surface-secondary text-text-secondary' : 
          isReceivable ? 'bg-positive/10 text-positive' : 
          'bg-negative/10 text-negative'
        }`}>
          {impactMessage}
        </span>
      </div>
    </div>
  );
}
