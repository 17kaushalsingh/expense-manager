import type { Workspace } from "./vault";
import { ledgerSummary } from "./ledger";
export interface WidgetSnapshot {
  version: 1;
  updatedAt: string;
  expiresAt: string;
  currency: string;
  locale: string;
  showAmounts: boolean;
  net: string;
  income: string;
  expense: string;
  pending: number;
}
export function widgetSnapshot(w: Workspace, now = new Date()): WidgetSnapshot {
  const summary = ledgerSummary(w),
    show = w.widgetAmounts === true;
  const format = (value: number) =>
    show
      ? new Intl.NumberFormat(w.locale || "en", {
          style: "currency",
          currency: w.profile.displayCurrency,
        }).format(value)
      : "••••";
  return {
    version: 1,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 300000).toISOString(),
    currency: w.profile.displayCurrency,
    locale: w.locale || "en",
    showAmounts: show,
    net: format(summary.net),
    income: format(summary.income),
    expense: format(summary.expense),
    pending: show ? w.commands.length : 0,
  };
}
