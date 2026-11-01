"use client";
import { Sidebar, navigation } from "./Sidebar";
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
  const { token, ready, error } = useAuthStore();
  const router = useRouter(),
    path = usePathname();
  useEffect(() => {
    if (ready && !token && !error) router.replace("/login");
  }, [ready, token, error, router]);
  if (error && !token)
    return (
      <main className="p-8">
        <ErrorMessage error={error} />
        <Link href="/login">Sign in</Link>
      </main>
    );
  if (!ready || !token)
    return (
      <p className="p-8" role="status">
        Loading your session…
      </p>
    );
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="md:ml-56 p-4 md:p-8 pb-28">
        <div className="flex justify-end mb-5">
          <RemindersWidget />
        </div>
        <div className="max-w-5xl mx-auto space-y-6">
          <ErrorMessage error={error} />
          {children}
        </div>
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex gap-3 overflow-x-auto bg-surface-primary border-t border-border-soft p-3">
        {navigation.map(([href, label]) => (
          <Link
            className={`text-xs whitespace-nowrap px-2 py-2 ${path === href ? "text-brand-primary" : "text-text-secondary"}`}
            aria-current={path === href ? "page" : undefined}
            key={href}
            href={href}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
