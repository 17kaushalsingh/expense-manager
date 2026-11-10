"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { SettlementHistory } from "@/components/settlements/SettlementHistory";
export default function PaymentsPage() {
  return (
    <DashboardLayout>
      <header>
        <p className="eyebrow">Shared money</p>
        <h1 className="text-3xl">Payment history</h1>
        <p className="text-sm text-text-secondary mt-2">
          Review and reverse recorded group or individual settlements.
        </p>
      </header>
      <SettlementHistory />
    </DashboardLayout>
  );
}
