"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useAccounts } from "@/hooks/useDashboard";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { Split, Member, Category, SplitInput } from "@/lib/types";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
import { MemberPicker, Person } from "@/components/groups/MemberPicker";
import { useFormat } from "@/lib/format";
interface Props {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
  groupMembers?: Member[];
  split?: Split;
  initial?: SplitInput;
  templateMode?: boolean;
  initialName?: string;
  onSave?: (body: SplitInput, name: string) => Promise<unknown>;
  onSaveDraft?: (body: SplitInput) => Promise<unknown>;
  title?: string;
  submitLabel?: string;
}
export function SplitBuilder(props: Props) {
  return props.isOpen ? <Editor {...props} /> : null;
}
function Editor({ onClose, groupId, groupMembers = [], split, initial, templateMode=false, initialName="", onSave, onSaveDraft, title, submitLabel }: Props) {
  const seed = split ?? initial;
  const [templateName, setTemplateName] = useState(initialName);
  const user = useAuthStore((s) => s.user)!;
  const { currency } = useFormat(),
    accounts = useAccounts(),
    categories = useResource<Category[]>("/categories");
  const [amount, setAmount] = useState(String(seed?.totalAmount ?? "")),
    [description, setDescription] = useState(seed?.description ?? ""),
    [mode, setMode] = useState<Split["splitType"]>(seed?.splitType ?? "EQUAL");
  const [extra, setExtra] = useState<Person[]>([]),
    [excluded, setExcluded] = useState<string[]>(
      seed
        ? groupMembers
            .filter(
              (m) => !seed.participants.some((p) => p.userId === m.userId),
            )
            .map((m) => m.userId)
        : [],
    ),
    [values, setValues] = useState<Record<string, string>>(
      Object.fromEntries(
        seed?.participants.map((p) => [p.userId, String(p.shareValue ?? 1)]) ??
          [],
      ),
    );
  const [multi, setMulti] = useState((seed?.payers.length ?? 0) > 1),
    [paidBy, setPaidBy] = useState(seed?.payers[0]?.userId ?? user.id),
    [paidValues, setPaidValues] = useState<Record<string, string>>(
      Object.fromEntries(
        seed?.payers.map((p) => [p.userId, String(p.amountPaid)]) ?? [],
      ),
    ),
    [account, setAccount] = useState(
      split?.payers.find((p) => p.userId === user.id)?.accountId ?? "",
    ),
    [category, setCategory] = useState(seed?.categoryId ?? "");
  const missingTotal = templateMode && amount.trim() === "";
  const people = groupMembers.length
    ? groupMembers.map((m) => ({
        id: m.userId,
        name: m.user?.name ?? "Member",
      }))
    : [
        { id: user.id, name: user.name },
        ...extra.filter((p) => p.id !== user.id),
      ];
  const participants = people.filter((p) => !excluded.includes(p.id));
  const total = Number(amount),
    shares = participants.reduce(
      (n, p) => n + Number(values[p.id] ?? (mode === "SHARES" ? "1" : "0")),
      0,
    );
  const payers = (
    multi
      ? people
          .map((p) => ({
            userId: p.id,
            amountPaid: Number(paidValues[p.id] || 0),
          }))
          .filter((p) => p.amountPaid > 0)
      : [{ userId: paidBy, amountPaid: missingTotal ? undefined : total }]
  ).map((p) => ({
    ...p,
    ...(p.userId === user.id && account ? { accountId: account } : {}),
  }));
  const payerSum = payers.reduce((n, p) => n + (p.amountPaid ?? 0), 0);
  const valid =
    (missingTotal || (total > 0 && Number.isFinite(total) && Math.abs(total * 100 - Math.round(total * 100)) < 0.0001)) &&
    participants.length > 0 &&
    payers.length > 0 && payers.every(p=>people.some(person=>person.id===p.userId)) &&
    (missingTotal || Math.abs(payerSum - total) < 0.001) &&
    (mode === "EQUAL" ||
      (mode === "EXACT" && (missingTotal ? shares > 0 : Math.abs(shares - total) < 0.001)) ||
      (mode === "PERCENTAGE" && Math.abs(shares - 100) < 0.00001) ||
      (mode === "SHARES" && shares > 0)) &&
    participants.every(
      (p) => Number(values[p.id] ?? (mode === "SHARES" ? "1" : "0")) >= 0,
    );
  function buildBody(): SplitInput {
    return {
      groupId: groupId ?? null,
      description,
      totalAmount: missingTotal ? null : total,
      splitType: mode,
      categoryId: category || null,
      payers,
      participants: participants.map((p) => ({
        userId: p.id,
        ...(mode !== "EQUAL"
          ? {
              shareValue: Number(
                values[p.id] ?? (mode === "SHARES" ? "1" : "0"),
              ),
            }
          : {}),
      })),
      date: seed?.date ?? new Date().toISOString(),
    };
  }
  const draftAction = useAction(async()=>onSaveDraft?.(buildBody()),onClose);
  const action = useAction(async () => {
    const body = buildBody();
    if (onSave) return onSave(body, templateName);
    return split
      ? apiClient.put(`/splits/${split.id}`, body)
      : apiClient.post("/splits", body);
  }, onClose);
  return (
    <Modal
      title={title ?? (split ? "Edit split expense" : "New split expense")}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) action.mutate();
        }}
      >
        {templateMode && <label className="label">Template name<input className="field" required maxLength={120} value={templateName} onChange={e=>setTemplateName(e.target.value)}/></label>}
        <label className="label">
          Description
          <input
            className="field"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="label">
          Total ({currency}){templateMode ? " · optional" : ""}
          <input
            className="field text-2xl"
            type="number"
            step="0.01"
            min="0.01"
            required={!templateMode}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {!groupId && <MemberPicker selected={extra} onChange={setExtra} />}
        {!templateMode && <label className="label">
          Category
          <select
            className="field"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Uncategorized</option>
            {categories.data
              ?.filter((c) => c.type === "EXPENSE")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        }
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={multi}
            onChange={(e) => setMulti(e.target.checked)}
          />
          Multiple payers
        </label>
        {multi ? (
          <div className="space-y-2">
            {people.map((p) => (
              <label
                className="label flex justify-between items-center gap-3"
                key={p.id}
              >
                {p.name} paid
                <input
                  className="field max-w-32"
                  aria-label={`${p.name} paid`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidValues[p.id] ?? ""}
                  onChange={(e) =>
                    setPaidValues({ ...paidValues, [p.id]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
        ) : (
          <label className="label">
            Paid by
            <select
              className="field"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!templateMode && payers.some((p) => p.userId === user.id) && (
          <label className="label">
            Your paying account
            <select
              className="field"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">Default cash account</option>
              {accounts.data
                ?.filter(
                  (a) =>
                    !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(
                      a.type,
                    ),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <p className="text-xs text-text-secondary">
          Other members’ payments use their default cash account.
        </p>
        <label className="label">
          Split method
          <select
            className="field"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Split["splitType"]);
              setValues({});
            }}
          >
            {["EQUAL", "EXACT", "PERCENTAGE", "SHARES"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <div className="space-y-3">
          {people.map((p) => (
            <div className="flex items-center justify-between gap-3" key={p.id}>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!excluded.includes(p.id)}
                  onChange={(e) =>
                    setExcluded(
                      e.target.checked
                        ? excluded.filter((id) => id !== p.id)
                        : [...excluded, p.id],
                    )
                  }
                />
                {p.name}
              </label>
              {!excluded.includes(p.id) &&
                (mode === "EQUAL" ? (
                  <span className="text-sm">Equal share</span>
                ) : (
                  <input
                    aria-label={`${p.name} ${mode.toLowerCase()} share`}
                    className="field max-w-32"
                    type="number"
                    min="0"
                    step={mode === "EXACT" ? "0.01" : "0.0001"}
                    value={values[p.id] ?? (mode === "SHARES" ? "1" : "")}
                    onChange={(e) =>
                      setValues({ ...values, [p.id]: e.target.value })
                    }
                  />
                ))}
            </div>
          ))}
        </div>
        <p role="status" className="text-xs text-text-secondary">
          Paid {payerSum.toFixed(2)} /{" "}
          {Number.isFinite(total) ? total.toFixed(2) : "0.00"}
          {mode !== "EQUAL"
            ? ` · Allocated ${shares.toFixed(mode === "EXACT" ? 2 : 4)}${mode === "PERCENTAGE" ? "%" : ""}`
            : ""}
          . Remainder cents are assigned in participant order.
        </p>
        <ErrorMessage
          error={action.error || draftAction.error || accounts.error || categories.error}
        />
        {(mode==="EXACT"||multi) && <p className="text-xs text-text-secondary">Review exact allocations and payer amounts when changing the total.</p>}
        {seed && [...seed.participants,...seed.payers].some(p=>!people.some(person=>person.id===p.userId)) && <p className="text-negative text-sm">A saved member is no longer in this group. Choose current participants and payers before saving.</p>}
        {onSaveDraft && <button type="button" className="btn-secondary w-full" disabled={!valid||!description.trim()||draftAction.isPending||action.isPending} onClick={()=>draftAction.mutate(undefined)}>Save draft without posting</button>}
        <button
          className="btn w-full"
          disabled={!valid || !description.trim() || action.isPending || draftAction.isPending}
        >
          {submitLabel ?? (templateMode ? "Save template" : "Save split")}
        </button>
      </form>
    </Modal>
  );
}
