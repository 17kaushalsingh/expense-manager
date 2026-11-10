"use client";
import { useState } from "react";
import Link from "next/link";
import { Users, Plus, ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ErrorMessage } from "@/components/ui/Controls";
import { useGroups } from "@/hooks/useGroups";
import { useFormat } from "@/lib/format";
import { CreateGroupModal } from "@/components/groups/CreateGroupModal";
export default function GroupsPage() {
  const { data: groups, isLoading, error } = useGroups(),
    { money } = useFormat();
  const [create, setCreate] = useState(false);
  const [search, setSearch] = useState(""),
    [balanceFilter, setBalanceFilter] = useState("all");
  const visibleGroups = groups?.filter((g) => {
    const matches =
      g.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ||
      g.members.some((m) =>
        m.user?.name
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      );
    const balance = Number(g.myBalance ?? 0);
    return (
      matches &&
      (balanceFilter === "all" ||
        (balanceFilter === "owe" && balance < 0) ||
        (balanceFilter === "owed" && balance > 0) ||
        (balanceFilter === "settled" && balance === 0) ||
        (balanceFilter === "outstanding" && balance !== 0))
    );
  });
  return (
    <DashboardLayout>
      <header className="flex justify-between items-end gap-3">
        <div>
          <p className="eyebrow mb-1.5">A clearer way to split</p>
          <h1 className="text-3xl">Shared expenses</h1>
          <p className="text-xs text-text-secondary mt-1.5">
            The people, the bills, and where you stand.
          </p>
        </div>
        <button className="btn gap-2" onClick={() => setCreate(true)}>
          <Plus size={16} />
          <span className="hidden sm:inline">New group</span>
          <span className="sm:hidden">New</span>
        </button>
      </header>
      <Link href="/shared-expenses" className="btn-secondary self-start">
        Search all shared expenses
      </Link>
      <Link href="/settlements" className="text-sm text-brand-primary">
        Payment history & reversals →
      </Link>
      <Link href="/deleted-expenses" className="text-sm text-brand-primary">
        Recover deleted expenses →
      </Link>
      <section
        className="panel grid sm:grid-cols-2 gap-3"
        aria-label="Group filters"
      >
        <label className="label">
          Find a group or member
          <input
            className="field"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={200}
          />
        </label>
        <label className="label">
          Your balance
          <select
            className="field"
            value={balanceFilter}
            onChange={(e) => setBalanceFilter(e.target.value)}
          >
            <option value="all">All groups</option>
            <option value="outstanding">
              Hide groups where you are settled
            </option>
            <option value="owe">You owe</option>
            <option value="owed">You are owed</option>
            <option value="settled">You are settled</option>
          </select>
        </label>
      </section>
      {groups && groups.length > 0 && (
        <p className="text-xs text-text-secondary" role="status">
          {visibleGroups?.length} of {groups.length} groups
        </p>
      )}
      {groups && groups.length > 0 && visibleGroups?.length === 0 && (
        <p className="panel">
          No groups match these filters.{" "}
          <button
            className="text-brand-primary"
            onClick={() => {
              setSearch("");
              setBalanceFilter("all");
            }}
          >
            Clear filters
          </button>
        </p>
      )}
      <ErrorMessage error={error} />
      {isLoading && (
        <p className="text-sm text-text-secondary">Loading your groups…</p>
      )}
      {groups?.length === 0 && (
        <section className="panel py-10 text-center">
          <span className="icon-tile !h-14 !w-14 mx-auto mb-4">
            <Users size={24} strokeWidth={1.6} />
          </span>
          <h2 className="section-title">Start with your people</h2>
          <p className="text-text-secondary text-sm mt-2 max-w-xs mx-auto">
            A flat, a holiday, or dinner with friends. Keep the expenses and
            balances in one place.
          </p>
          <button className="btn mt-5" onClick={() => setCreate(true)}>
            Create your first group
          </button>
        </section>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {visibleGroups?.map((g, i) => {
          const balance = Number(g.myBalance ?? 0);
          return (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className="panel !p-0 overflow-hidden hover:ring-1 hover:ring-brand-primary/20 transition-shadow"
            >
              <div className="px-5 pt-5 pb-4 flex gap-3 items-center">
                <span
                  className="icon-tile !h-12 !w-12 !rounded-2xl"
                  style={{
                    background: ["#e7f0eb", "#eeeaf4", "#f7eee1"][i % 3],
                    color: ["#527b63", "#8a77a4", "#b18b58"][i % 3],
                  }}
                >
                  <Users size={22} strokeWidth={1.6} />
                </span>
                <div className="flex-1">
                  <h2 className="font-semibold text-base">{g.name}</h2>
                  <p className="text-[11px] text-text-secondary mt-1">
                    {g.members.length} members · {g.currency}
                  </p>
                </div>
                <ChevronRight size={16} className="text-text-secondary" />
              </div>
              <div className="px-5 py-4 border-t border-border-soft flex justify-between items-center">
                <div className="flex -space-x-1.5">
                  {g.members.slice(0, 4).map((m) => (
                    <span
                      className="h-7 w-7 rounded-full bg-surface-secondary border-2 border-surface-primary grid place-items-center text-[10px] text-text-secondary font-medium"
                      title={m.user?.name}
                      key={m.userId}
                    >
                      {m.user?.name?.slice(0, 1).toUpperCase() ?? "M"}
                    </span>
                  ))}
                </div>
                <p
                  className={`text-xs font-medium ${balance < 0 ? "text-negative" : "text-positive"}`}
                >
                  {balance === 0
                    ? "All settled up"
                    : `${balance > 0 ? "You are owed" : "You owe"} ${money(Math.abs(balance), g.currency)}`}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      {create && <CreateGroupModal isOpen onClose={() => setCreate(false)} />}
    </DashboardLayout>
  );
}
