"use client";
import Link from "next/link";
import { useResource } from "@/hooks/useResource";
import { useFormat } from "@/lib/format";
import { ErrorMessage } from "@/components/ui/Controls";
export function BillsOverview() {
  const data = useResource<{
      items: {
        id: string;
        reviewDate: string;
        payload: { name: string; amount: number; currency: string };
      }[];
      total: number;
    }>("/bills/occurrences?status=DUE&limit=5"),
    { money } = useFormat();
  return (
    <section className="panel space-y-3">
      <div className="flex justify-between gap-3">
        <h2 className="text-lg font-semibold">Bills to review</h2>
        <Link href="/bills" className="text-brand-primary text-sm">
          All bills →
        </Link>
      </div>
      <ErrorMessage error={data.error} />
      {data.isLoading ? (
        <p>Loading bills…</p>
      ) : data.data?.total === 0 ? (
        <p className="text-sm text-text-secondary">
          No pending bills. Add schedules for rent, subscriptions and salary.
        </p>
      ) : (
        data.data?.items.map((b) => (
          <Link
            className="flex justify-between gap-3 text-sm border-t border-border-soft pt-3"
            href="/bills"
            key={b.id}
          >
            <span>
              {b.payload.name}
              <span className="block text-text-secondary text-xs">
                Review {b.reviewDate}
              </span>
            </span>
            <strong>
              {money(Number(b.payload.amount), b.payload.currency)}
            </strong>
          </Link>
        ))
      )}
    </section>
  );
}
