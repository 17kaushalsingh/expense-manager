"use client";
import { useState } from "react";
import { Delete } from "lucide-react";
import { Modal } from "@/components/ui/Controls";
import { calculateAmount } from "@/lib/amountCalculator";
export function AmountCalculator({
  initial,
  onApply,
  onClose,
}: {
  initial: string;
  onApply: (amount: string) => void;
  onClose: () => void;
}) {
  const [expression, setExpression] = useState(initial);
  let result = "",
    error = "";
  try {
    result = calculateAmount(expression);
  } catch (e) {
    error = e instanceof Error ? e.message : "Check the calculation.";
  }
  return (
    <Modal title="Calculate amount" onClose={onClose}>
      <label className="label">
        Calculation
        <input
          className="field !text-xl text-right"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          maxLength={200}
          data-autofocus
          autoFocus
          inputMode="decimal"
        />
      </label>
      <p className="text-right text-3xl font-semibold tabular-nums min-h-10">
        {result || "—"}
      </p>
      <p className="text-xs text-text-secondary min-h-4" role="status">
        {error || "Rounded to two decimal places."}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {[
          "7",
          "8",
          "9",
          "/",
          "4",
          "5",
          "6",
          "*",
          "1",
          "2",
          "3",
          "-",
          ".",
          "0",
          "(",
          "+",
        ].map((key) => (
          <button
            key={key}
            type="button"
            className="btn-secondary !text-xl !py-3"
            onClick={() => setExpression((v) => v + key)}
          >
            {key === "*" ? "×" : key === "/" ? "÷" : key}
          </button>
        ))}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setExpression("")}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn-secondary"
          aria-label="Delete last character"
          onClick={() => setExpression((v) => v.slice(0, -1))}
        >
          <Delete size={18} />
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setExpression((v) => v + ")")}
        >
          )
        </button>
        <button
          type="button"
          className="btn"
          disabled={!result}
          onClick={() => onApply(result)}
        >
          Use amount
        </button>
      </div>
    </Modal>
  );
}
