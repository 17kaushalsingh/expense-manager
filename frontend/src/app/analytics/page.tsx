"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { BarChart3, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";
import { useNetWorth, useDebtSummary } from "@/hooks/useDashboard";

export default function AnalyticsPage() {
  const { data: netWorthData, isLoading: isNetWorthLoading } = useNetWorth();
  const { data: debtSummary, isLoading: isDebtLoading } = useDebtSummary();

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between pb-4 border-b border-border-soft">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics & Cash Flow</h1>
          <p className="text-sm text-text-secondary mt-1">Insights into your financial health</p>
        </div>
        <div className="flex p-1 bg-surface-secondary rounded-lg border border-border-soft">
          {['1W', '1M', '3M', '1Y', 'ALL'].map((range) => (
            <button key={range} className={`px-3 py-1 text-xs font-medium rounded-md ${range === '1M' ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Core Metrics */}
        <div className="col-span-1 space-y-4">
          <MetricCard 
            title="Total Net Worth"
            value={isNetWorthLoading ? '...' : formatCurrency(netWorthData?.netWorth || 0)}
            icon={<BarChart3 className="w-5 h-5 text-brand-primary" />}
            trend="+4.2%"
          />
          <MetricCard 
            title="Total Assets"
            value={isNetWorthLoading ? '...' : formatCurrency(netWorthData?.breakdown?.assets || 0)}
            icon={<TrendingUp className="w-5 h-5 text-positive" />}
          />
          <MetricCard 
            title="Total Liabilities"
            value={isNetWorthLoading ? '...' : formatCurrency(netWorthData?.breakdown?.liabilities || 0)}
            icon={<TrendingDown className="w-5 h-5 text-negative" />}
          />
        </div>

        {/* Chart Area (Mocked for now) */}
        <div className="col-span-1 md:col-span-2 bg-surface-primary border border-border-soft rounded-2xl p-6 shadow-sm flex flex-col">
          <h3 className="font-semibold text-lg mb-6">Cash Flow Trend</h3>
          <div className="flex-1 flex items-end space-x-2 h-48 w-full px-2 border-b border-border-soft border-dashed pb-4">
            {/* Simple mock bars representing chart */}
            {[40, 70, 45, 90, 65, 110, 80].map((height, i) => (
              <div key={i} className="flex-1 bg-brand-primary/20 rounded-t-sm hover:bg-brand-primary/40 transition-colors relative group cursor-pointer" style={{ height: `${height}%` }}>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-surface-secondary px-2 py-1 rounded text-xs font-medium shadow-lg z-10 text-text-primary">
                  {formatCurrency(height * 100)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 text-xs text-text-secondary px-2">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </div>

      </div>

      <div className="mt-8 bg-surface-primary border border-border-soft rounded-2xl p-6 shadow-sm">
        <div className="flex items-center space-x-2 mb-6">
          <RefreshCcw className="w-5 h-5 text-text-secondary" />
          <h3 className="font-semibold text-lg">Group Debt Summary</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-positive/5 border border-positive/20 rounded-xl">
            <p className="text-sm text-text-secondary font-medium">Total Owed To You</p>
            <p className="text-2xl font-bold text-positive tabular-nums mt-1">
              {isDebtLoading ? '...' : formatCurrency(debtSummary?.totalOwedToYou || 0)}
            </p>
          </div>
          <div className="p-4 bg-negative/5 border border-negative/20 rounded-xl">
            <p className="text-sm text-text-secondary font-medium">Total You Owe</p>
            <p className="text-2xl font-bold text-negative tabular-nums mt-1">
              {isDebtLoading ? '...' : formatCurrency(debtSummary?.totalYouOwe || 0)}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ title, value, icon, trend }: any) {
  return (
    <div className="bg-surface-primary border border-border-soft rounded-xl p-5 shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <div className="p-2 bg-surface-secondary rounded-lg border border-border-soft">
          {icon}
        </div>
        {trend && (
          <span className="text-xs font-medium text-positive bg-positive/10 px-2 py-1 rounded-md">
            {trend}
          </span>
        )}
      </div>
      <p className="text-sm text-text-secondary font-medium">{title}</p>
      <p className="text-2xl font-bold tracking-tight tabular-nums mt-1">{value}</p>
    </div>
  );
}
