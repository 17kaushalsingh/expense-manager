"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormat } from "@/lib/format";
export interface CalendarData {
  month: string;
  timezone: string;
  totalIncome: number;
  totalExpense: number;
  days: { date: string; income: number; expense: number; count: number }[];
}
export function changeMonth(month: string, delta: number) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}
export function SpendingCalendar({
  month,
  data,
  loading,
  onMonth,
  selected,
  onSelect,
}: {
  month: string;
  data?: CalendarData;
  loading: boolean;
  onMonth: (month: string) => void;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const { currency } = useFormat();
  const first = new Date(`${month}-01T12:00:00Z`),
    offset = (first.getUTCDay() + 6) % 7;
  const end = new Date(`${month}-01T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const days = Array.from(
    { length: end.getUTCDate() },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
  const compact = (n: number) =>
    new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  return (
    <section className="panel !p-0 overflow-hidden">
      <div className="flex justify-between items-center px-4 py-4">
        <button
          className="btn-secondary !p-2"
          aria-label="Previous month"
          onClick={() => onMonth(changeMonth(month, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-semibold">
            {new Intl.DateTimeFormat(undefined, {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(first)}
          </h2>
          <p className="text-[10px] text-text-secondary mt-1">
            {currency} · {data?.timezone ?? "Your timezone"}
          </p>
        </div>
        <button
          className="btn-secondary !p-2"
          aria-label="Next month"
          onClick={() => onMonth(changeMonth(month, 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 border-t border-border-soft">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <p
            key={d}
            className="text-center text-[10px] text-text-secondary py-3"
          >
            {d}
          </p>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}
        {days.map((day) => {
          const d = data?.days.find((x) => x.date === day);
          return (
            <button
              key={day}
              aria-pressed={selected === day}
              aria-label={`${day}${d ? `, income ${d.income}, expense ${d.expense}` : ""}`}
              onClick={() => onSelect(selected === day ? "" : day)}
              className={`min-h-[78px] sm:min-h-[96px] px-1 sm:px-3 py-2 border-t border-border-soft text-left flex flex-col gap-1 ${selected === day ? "bg-surface-secondary ring-1 ring-inset ring-brand-primary" : "hover:bg-surface-secondary/40"}`}
            >
              <span className="text-xs font-medium">
                {Number(day.slice(-2))}
              </span>
              {!loading && !!d?.expense && (
                <span className="text-[10px] sm:text-xs text-negative tabular-nums">
                  −{compact(d.expense)}
                </span>
              )}
              {!loading && !!d?.income && (
                <span className="text-[10px] sm:text-xs text-positive tabular-nums">
                  +{compact(d.income)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {loading && (
        <p className="text-xs text-text-secondary px-4 py-3" role="status">
          Loading daily totals…
        </p>
      )}
      <p className="text-[10px] text-text-secondary px-4 py-3 border-t border-border-soft">
        Personal income and expenses. Shared bills count only your share. Tap a
        day to see its entries.
      </p>
    </section>
  );
}
