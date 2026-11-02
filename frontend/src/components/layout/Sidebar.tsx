"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export const navigation = [
  ["/", "Home"],
  ["/accounts", "Accounts"],
  ["/transactions", "Transactions"],
  ["/groups", "Groups"],
  ["/analytics", "Analytics"],
  ["/budgets", "Budgets"],
  ["/goals", "Goals"],
  ["/categories", "Categories"],
  ["/settings", "Settings"],
];
export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 w-56 border-r border-border-soft bg-surface-primary hidden md:flex flex-col p-5 gap-8">
      <Link href="/" className="text-xl font-bold text-brand-primary">
        LedgerSync
      </Link>
      <nav className="space-y-2">
        {navigation.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={
              path === href || (href !== "/" && path.startsWith(href + "/"))
                ? "page"
                : undefined
            }
            className={`block rounded-lg px-3 py-2 ${path === href || (href !== "/" && path.startsWith(href + "/")) ? "bg-surface-secondary text-brand-primary" : "text-text-secondary"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
