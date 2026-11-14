"use client";
import { T } from "@/components/i18n/Language";
import { useFormat } from "@/lib/format";
import type { Split } from "@/lib/types";

export function AdjustmentSummary({
  split,
  memberName,
}: {
  split: Split;
  memberName: (id: string) => string;
}) {
  const { money } = useFormat();
  if (split.splitType !== "ADJUSTMENT" || !split.adjustments) return null;
  return (
    <section className="space-y-2 border-t border-border-soft pt-3">
      <h3 className="font-semibold">
        <T text="Adjustment" />
      </h3>
      <p className="text-xs text-text-secondary">
        <T text="Extras and reductions are applied to an equal common portion. Final shares include remainder cents in participant order." />
      </p>
      {split.adjustments.map((p) => (
        <div className="flex justify-between gap-3 text-sm" key={p.userId}>
          <span>{memberName(p.userId)}</span>
          <span>{money(p.shareValue, split.currency)}</span>
        </div>
      ))}
    </section>
  );
}
