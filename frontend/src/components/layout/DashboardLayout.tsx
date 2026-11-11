"use client";
import { T } from "@/components/i18n/Language";
import { Sidebar, mobileNavigation, navIcons } from "./Sidebar";
import { useAuthStore } from "@/store/auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { RemindersWidget } from "@/components/reminders/RemindersWidget";
import { ErrorMessage } from "@/components/ui/Controls";
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, ready, error, user } = useAuthStore(),
    router = useRouter(),
    path = usePathname();
  useEffect(() => {
    if (ready && !token && !error) router.replace("/login");
  }, [ready, token, error, router]);
  if (error && !token)
    return (
      <main className="p-8">
        <ErrorMessage error={error} />
        <Link href="/login">
          <T text="Sign in" />
        </Link>
      </main>
    );
  if (!ready || !token)
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-text-secondary text-sm" role="status">
          <T text="Opening your ledger…" />
        </p>
      </main>
    );
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="md:ml-56 app-content">
        <div className="max-w-[1120px] mx-auto px-5 md:px-10">
          <header className="h-20 flex justify-between items-center">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              LedgerSync<span className="text-brand-primary">.</span>{" "}
              <span className="hidden sm:inline text-text-secondary font-normal ml-3 text-xs">
                Personal & shared finances
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <RemindersWidget />
              <Link
                href="/settings"
                aria-label="Your profile"
                className="grid place-items-center h-8 w-8 rounded-full bg-surface-secondary text-brand-primary text-xs font-semibold"
              >
                {user?.name?.slice(0, 1).toUpperCase() ?? "Y"}
              </Link>
            </div>
          </header>
          <div className="space-y-7 pb-12">
            <ErrorMessage error={error} />
            {children}
          </div>
        </div>
      </main>
      <nav
        aria-label="Main navigation"
        className="bottom-tabs md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 pt-3 border-t border-border-soft bg-surface-primary/95 backdrop-blur-xl"
      >
        {mobileNavigation.map(([href, label]) => {
          const active =
            href === "/more"
              ? !mobileNavigation.some(
                  ([h]) =>
                    h !== "/more" &&
                    (path === h || (h !== "/" && path.startsWith(h + "/"))),
                )
              : path === href || (href !== "/" && path.startsWith(href + "/"));
          const Icon = navIcons[href];
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 text-[10px] font-medium ${active ? "text-brand-primary" : "text-text-secondary"}`}
            >
              <Icon size={21} strokeWidth={active ? 2.2 : 1.7} />
              <T text={label} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
