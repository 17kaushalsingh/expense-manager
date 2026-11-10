"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { navigation, navIcons } from "@/components/layout/Sidebar";
export default function More() {
  return (
    <DashboardLayout>
      <header>
        <p className="eyebrow mb-2">Make it yours</p>
        <h1 className="text-3xl">More</h1>
      </header>
      <section className="grouped-list">
        {navigation
          .filter(([href]) =>
            [
              "/accounts",
              "/shared-expenses",
              "/settlements",
              "/deleted-expenses",
              "/budgets",
              "/goals",
              "/categories",
              "/settings",
            ].includes(href),
          )
          .map(([href, label]) => {
            const Icon = navIcons[href];
            return (
              <Link key={href} href={href} className="list-row">
                <span className="icon-tile !h-9 !w-9">
                  <Icon size={17} />
                </span>
                <span className="flex-1 font-medium">{label}</span>
                <ChevronRight size={16} className="text-text-secondary" />
              </Link>
            );
          })}
      </section>
    </DashboardLayout>
  );
}
