"use client";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ShoppingBag,
  Utensils,
  Coffee,
  Car,
  Home,
  Heart,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { Transaction } from "@/lib/types";
import { useFormat } from "@/lib/format";
export function categoryVisual(name: string, type = "EXPENSE") {
  const n = name.toLowerCase();
  if (type === "INCOME")
    return { Icon: ArrowDownLeft, color: "#438364", background: "#e5f2e9" };
  if (type === "TRANSFER")
    return { Icon: ArrowLeftRight, color: "#818b91", background: "#edf0f2" };
  if (/food|dining|restaurant/.test(n))
    return { Icon: Utensils, color: "#ca9546", background: "#fff1d8" };
  if (/coffee|cafe/.test(n))
    return { Icon: Coffee, color: "#a17a5b", background: "#f4ebe1" };
  if (/travel|transport|car/.test(n))
    return { Icon: Car, color: "#597aa3", background: "#e9f0f8" };
  if (/home|rent|bill/.test(n))
    return { Icon: Home, color: "#a07bb9", background: "#f1eaf8" };
  if (/health/.test(n))
    return { Icon: Heart, color: "#d37888", background: "#fdebf0" };
  if (/shop/.test(n))
    return { Icon: ShoppingBag, color: "#be8a64", background: "#f6ece0" };
  return { Icon: Wallet, color: "#748c7f", background: "#edf3ee" };
}
export function TransactionRow({
  transaction: t,
  onClick,
  compact = false,
}: {
  transaction: Transaction;
  onClick?: () => void;
  compact?: boolean;
}) {
  const { money, date } = useFormat();
  const { Icon, color, background } = categoryVisual(
    t.category?.name ?? t.notes ?? "",
    t.type,
  );
  const content = (
    <>
      <span
        className="icon-tile !h-9 !w-9 !rounded-[11px]"
        style={{ color, background }}
      >
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium truncate">
          {t.notes ||
            t.category?.name ||
            (t.type === "INCOME"
              ? "Income"
              : t.type === "TRANSFER"
                ? "Transfer"
                : "Expense")}
        </span>
        <span className="block text-[11px] text-text-secondary truncate mt-0.5">
          {t.category?.name ??
            (t.type === "TRANSFER" ? "Transfer" : "Uncategorized")}{" "}
          <span className="mx-1">·</span>
          {t.account?.name}
          {!compact && <span className="ml-1"> · {date(t.dateTime)}</span>}
        </span>
      </span>
      <span
        className={`text-[13px] tabular-nums font-semibold shrink-0 ${t.type === "INCOME" ? "text-positive" : t.type === "EXPENSE" ? "text-negative" : "text-text-secondary"}`}
      >
        {t.type === "INCOME" ? "+" : t.type === "EXPENSE" ? "−" : ""}
        {money(t.amount, t.account?.currency)}
      </span>
      {onClick && <ChevronRight size={13} className="text-text-secondary/50" />}
    </>
  );
  return onClick ? (
    <button
      className="list-row w-full text-left hover:bg-surface-secondary/40"
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className="list-row">{content}</div>
  );
}
