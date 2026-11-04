import { Itemization } from "@/lib/itemization";
export function ItemSummary({
  value,
  memberName,
}: {
  value?: Itemization | null;
  memberName: (id: string) => string;
}) {
  if (!value) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">Itemized receipt</h3>
      {value.items.map((item, i) => (
        <div key={i} className="border-b border-border-soft pb-2 text-sm">
          <p>
            {item.label} · {Number(item.amount).toFixed(2)}
          </p>
          <p className="text-xs text-text-secondary">
            {item.participantIds.map(memberName).join(", ")}
          </p>
        </div>
      ))}
      <p className="text-sm">
        Tax {Number(value.tax ?? 0).toFixed(2)} · Tip{" "}
        {Number(value.tip ?? 0).toFixed(2)}
      </p>
    </section>
  );
}
