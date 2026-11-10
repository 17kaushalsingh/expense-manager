"use client";
import { Itemization } from "@/lib/itemization";
export function ItemizationEditor({
  value,
  onChange,
  people,
}: {
  value: Itemization;
  onChange: (value: Itemization) => void;
  people: { id: string; name: string }[];
}) {
  function update(index: number, patch: Partial<Itemization["items"][number]>) {
    onChange({
      ...value,
      items: value.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }
  return (
    <fieldset className="min-w-0 space-y-4 rounded-xl border border-border-soft p-3">
      <legend className="px-2 font-semibold text-sm">Receipt items</legend>
      <p className="text-xs text-text-secondary">
        Enter each line’s full amount, then choose who shares it. Tax, tip and
        discounts are distributed in proportion to each person’s allocated
        items.
      </p>
      {value.items.map((item, index) => (
        <div key={index} className="space-y-2 border-b border-border-soft pb-3">
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <label className="label">
              Item {index + 1}
              <input
                className="field"
                required
                maxLength={120}
                value={item.label}
                onChange={(e) => update(index, { label: e.target.value })}
              />
            </label>
            <label className="label">
              Line amount
              <input
                className="field"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={item.amount || ""}
                onChange={(e) =>
                  update(index, { amount: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            {people.map((person) => (
              <label
                className="text-xs flex gap-1 items-center"
                key={person.id}
              >
                <input
                  type="checkbox"
                  checked={item.participantIds.includes(person.id)}
                  onChange={(e) =>
                    update(index, {
                      participantIds: e.target.checked
                        ? [...item.participantIds, person.id]
                        : item.participantIds.filter((id) => id !== person.id),
                    })
                  }
                />
                {person.name}
              </label>
            ))}
          </div>
          {item.participantIds.some(
            (id) => !people.some((p) => p.id === id),
          ) && (
            <button
              type="button"
              className="text-negative text-xs"
              onClick={() =>
                update(index, {
                  participantIds: item.participantIds.filter((id) =>
                    people.some((p) => p.id === id),
                  ),
                })
              }
            >
              Remove unavailable participants from this item
            </button>
          )}
          <button
            type="button"
            className="subtle-link text-xs"
            onClick={() =>
              onChange({
                ...value,
                items: value.items.filter((_, i) => i !== index),
              })
            }
          >
            Remove item
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary"
        disabled={value.items.length >= 100}
        onClick={() =>
          onChange({
            ...value,
            items: [
              ...value.items,
              { label: "", amount: 0, participantIds: people.map((p) => p.id) },
            ],
          })
        }
      >
        Add item
      </button>
      <div className="grid grid-cols-2 gap-3">
        {(["tax", "tip", "discount"] as const).map((key) => (
          <label className="label" key={key}>
            {key === "tax" ? "Tax" : key === "tip" ? "Tip" : "Discount"}
            <input
              className="field"
              type="number"
              min="0"
              step="0.01"
              value={value[key] ?? 0}
              onChange={(e) =>
                onChange({ ...value, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
