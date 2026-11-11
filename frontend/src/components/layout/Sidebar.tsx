"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Search,
  Receipt,
  ArchiveRestore,
  ArrowLeftRight,
  Users,
  ChartNoAxesCombined,
  Wallet,
  Target,
  Shapes,
  Settings,
  Ellipsis,
  CalendarDays,
  LucideIcon,
} from "lucide-react";
export const navigation = [
  ["/", "Overview"],
  ["/transactions", "Transactions"],
  ["/groups", "Shared expenses"],
  ["/shared-expenses", "Find a bill"],
  ["/settlements", "Payments"],
  ["/deleted-expenses", "Deleted expenses"],
  ["/accounts", "Accounts"],
  ["/cards", "Credit cards"],
  ["/analytics", "Insights"],
  ["/budgets", "Budgets"],
  ["/planner", "Financial plan"],
  ["/goals", "Savings goals"],
  ["/wealth", "Wealth & assets"],
  ["/events", "Trips & events"],
  ["/loans", "Borrowing & lending"],
  ["/bills", "Bills & subscriptions"],
  ["/categories", "Categories"],
  ["/settings", "Settings"],
];
export const navIcons: Record<string, LucideIcon> = {
  "/": House,
  "/transactions": ArrowLeftRight,
  "/groups": Users,
  "/shared-expenses": Search,
  "/settlements": Receipt,
  "/deleted-expenses": ArchiveRestore,
  "/accounts": Wallet,
  "/cards": Wallet,
  "/analytics": ChartNoAxesCombined,
  "/budgets": CalendarDays,
  "/planner": CalendarDays,
  "/goals": Target,
  "/wealth": ChartNoAxesCombined,
  "/events": CalendarDays,
  "/loans": ArrowLeftRight,
  "/bills": CalendarDays,
  "/categories": Shapes,
  "/settings": Settings,
  "/more": Ellipsis,
};
export const mobileNavigation = [
  ["/", "Home"],
  ["/transactions", "Activity"],
  ["/groups", "Shared"],
  ["/analytics", "Insights"],
  ["/more", "More"],
];
export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 w-56 overflow-y-auto bg-surface-primary hidden md:flex flex-col px-5 py-7 border-r border-border-soft">
      <Link href="/" className="flex items-center gap-2.5 mb-12 px-2">
        <span className="icon-tile !h-8 !w-8 !rounded-[10px]">
          <Wallet size={17} strokeWidth={1.8} />
        </span>
        <span className="text-[19px] font-bold tracking-tight">
          LedgerSync<span className="text-brand-primary">.</span>
        </span>
      </Link>
      <p className="eyebrow px-3 mb-3">Your money</p>
      <nav className="space-y-1">
        {navigation.map(([href, label]) => {
          const Icon = navIcons[href],
            active =
              path === href || (href !== "/" && path.startsWith(href + "/"));
          return (
            <div key={href}>
              {href === "/budgets" && (
                <p className="eyebrow px-3 pt-8 pb-3">Planning & tools</p>
              )}
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] ${active ? "bg-surface-secondary text-brand-primary font-semibold" : "text-text-secondary hover:text-text-primary"}`}
              >
                <Icon size={17} strokeWidth={active ? 2 : 1.65} />
                {label}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto pt-8 px-3">
        <div className="flex gap-2 items-center text-[11px] text-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-positive" />
          Personal & shared, together
        </div>
      </div>
    </aside>
  );
}
