"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import { Itemization, calculateItemization } from "@/lib/itemization";
import { calculateAdjustments } from "@/lib/adjustments";
import { ItemizationEditor } from "./ItemizationEditor";
import { useAuthStore } from "@/store/auth";
import { useAccounts } from "@/hooks/useDashboard";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import {
  Split,
  Member,
  Category,
  SplitInput,
  SplitTemplate,
} from "@/lib/types";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
import { MemberPicker, Person } from "@/components/groups/MemberPicker";
import { useFormat } from "@/lib/format";
import { translate } from "@/lib/i18n/catalogs";
interface Props {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
  groupMembers?: Member[];
  split?: Split;
  initial?: SplitInput;
  initialPeople?: Person[];
  templateMode?: boolean;
  initialName?: string;
  onSave?: (body: SplitInput, name: string) => Promise<unknown>;
  onSaveDraft?: (body: SplitInput) => Promise<unknown>;
  title?: string;
  submitLabel?: string;
  /** An already-paid purchase keeps its amount, payer and original account. */
  fundedPurchase?: { accountId: string; amount: number };
}
export function SplitBuilder(props: Props) {
  return props.isOpen ? <DefaultEditor {...props} /> : null;
}
function DefaultEditor(props: Props) {
  const enabled =
    !!props.groupId &&
    !props.split &&
    !props.initial &&
    !props.templateMode &&
    !props.onSave &&
    !props.onSaveDraft;
  const defaults = useResource<Pick<
    SplitTemplate,
    "id" | "name" | "payload" | "needsCorrection"
  > | null>(`/groups/${props.groupId}/default-split`, enabled);
  const [custom, setCustom] = useState(false);
  if (
    enabled &&
    !custom &&
    (defaults.isLoading || defaults.error || defaults.data?.needsCorrection)
  )
    return (
      <Modal title="Group split preference" onClose={props.onClose}>
        {defaults.isLoading && <p>Loading group default…</p>}
        <ErrorMessage error={defaults.error} />
        {defaults.data?.needsCorrection && (
          <p>
            A saved participant is unavailable. Repair the default in Split
            templates or choose a custom allocation.
          </p>
        )}
        {!defaults.isLoading && (
          <button className="btn-secondary" onClick={() => setCustom(true)}>
            Use a custom split
          </button>
        )}
      </Modal>
    );
  // Automatic defaults carry allocations only; each bill gets its own description,
  // total, date, payer and private account. Exact values are never rescaled.
  const initial =
    enabled && !custom && defaults.data
      ? {
          ...defaults.data.payload,
          description: "",
          totalAmount: null,
          payers: [],
        }
      : props.initial;
  return <Editor {...props} initial={initial} />;
}
function Editor({
  onClose,
  groupId,
  groupMembers = [],
  split,
  initial,
  templateMode = false,
  initialName = "",
  initialPeople = [],
  onSave,
  onSaveDraft,
  title,
  submitLabel,
  fundedPurchase,
}: Props) {
  const seed = split ?? initial;
  const [templateName, setTemplateName] = useState(initialName);
  const user = useAuthStore((s) => s.user)!;
  const { currency, money, locale } = useFormat(),
    accounts = useAccounts(),
    categories = useResource<Category[]>("/categories");
  const [amount, setAmount] = useState(String(seed?.totalAmount ?? "")),
    [description, setDescription] = useState(seed?.description ?? ""),
    [mode, setMode] = useState<Split["splitType"]>(seed?.splitType ?? "EQUAL");
  const partyIds = seed
    ? [...new Set([...seed.participants, ...seed.payers].map((p) => p.userId))]
    : [user.id];
  const [extra, setExtra] = useState<Person[]>(
      partyIds
        .filter((id) => id !== user.id)
        .map((id) => ({
          id,
          name: initialPeople.find((p) => p.id === id)?.name ?? "Member",
        })),
    ),
    [excluded, setExcluded] = useState<string[]>(
      seed
        ? (groupMembers.length
            ? groupMembers.map((m) => m.userId)
            : partyIds
          ).filter((id) => !seed.participants.some((p) => p.userId === id))
        : [],
    ),
    [values, setValues] = useState<Record<string, string>>(
      Object.fromEntries(
        (split?.adjustments ?? seed?.participants)?.map((p) => [
          p.userId,
          String(p.shareValue ?? (seed?.splitType === "ADJUSTMENT" ? 0 : 1)),
        ]) ?? [],
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
      seed?.payers.find((p) => p.userId === user.id)?.accountId ?? "",
    ),
    [category, setCategory] = useState(seed?.categoryId ?? "");
  const [itemized, setItemized] = useState(!!seed?.itemization);
  const [items, setItems] = useState<Itemization>(
    seed?.itemization ?? { items: [], tax: 0, tip: 0 },
  );
  const missingTotal = templateMode && amount.trim() === "" && !itemized;
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
  let itemPreview: ReturnType<typeof calculateItemization> | undefined;
  let itemError: unknown;
  if (itemized) {
    try {
      itemPreview = calculateItemization(
        items,
        participants.map((p) => p.id),
      );
    } catch (error) {
      itemError = error;
    }
  }
  const total =
      fundedPurchase?.amount ??
      Number(itemized ? (itemPreview?.total ?? 0) : amount),
    shares = itemized
      ? total
      : participants.reduce(
          (n, p) => n + Number(values[p.id] ?? (mode === "SHARES" ? "1" : "0")),
          0,
        );
  let adjustmentPreview: ReturnType<typeof calculateAdjustments> | undefined;
  let adjustmentError: unknown;
  if (!itemized && mode === "ADJUSTMENT" && !missingTotal) {
    try {
      adjustmentPreview = calculateAdjustments(
        total,
        participants.map((p) => ({
          userId: p.id,
          shareValue: Number(values[p.id] ?? 0),
        })),
      );
    } catch (error) {
      adjustmentError = error;
    }
  }
  const payers = fundedPurchase
    ? [
        {
          userId: user.id,
          amountPaid: fundedPurchase.amount,
          accountId: fundedPurchase.accountId,
        },
      ]
    : (multi
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
  const [removeUnavailable, setRemoveUnavailable] = useState(false);
  const missingParty =
    !!seed &&
    [...seed.participants, ...seed.payers].some(
      (p) => !people.some((person) => person.id === p.userId),
    );
  const valid =
    (!fundedPurchase || participants.some((p) => p.id !== user.id)) &&
    (!missingParty || removeUnavailable) &&
    (missingTotal ||
      (total > 0 &&
        Number.isFinite(total) &&
        Math.abs(total * 100 - Math.round(total * 100)) < 0.0001)) &&
    participants.length > 0 &&
    payers.length > 0 &&
    payers.every((p) => people.some((person) => person.id === p.userId)) &&
    (missingTotal || Math.abs(payerSum - total) < 0.001) &&
    (!itemized || !!itemPreview) &&
    (itemized ||
      mode === "EQUAL" ||
      (mode === "ADJUSTMENT" && (missingTotal || !!adjustmentPreview)) ||
      (mode === "EXACT" &&
        (missingTotal ? shares > 0 : Math.abs(shares - total) < 0.001)) ||
      (mode === "PERCENTAGE" && Math.abs(shares - 100) < 0.00001) ||
      (mode === "SHARES" && shares > 0)) &&
    (itemized ||
      mode === "ADJUSTMENT" ||
      participants.every(
        (p) => Number(values[p.id] ?? (mode === "SHARES" ? "1" : "0")) >= 0,
      ));
  function buildBody(): SplitInput {
    return {
      groupId: groupId ?? null,
      description,
      totalAmount: missingTotal ? null : total,
      splitType: itemized ? "EXACT" : mode,
      ...(itemized ? { itemization: items } : {}),
      categoryId: category || null,
      payers,
      participants: participants.map((p) => ({
        userId: p.id,
        ...(itemized
          ? { shareValue: Number(itemPreview?.allocations[p.id] ?? 0) }
          : mode !== "EQUAL"
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
  const draftAction = useAction(
    async () => onSaveDraft?.(buildBody()),
    onClose,
  );
  const action = useAction(async () => {
    const body = buildBody();
    if (onSave) return onSave(body, templateName);
    return split
      ? apiClient.put(`/splits/${split.id}`, body)
      : apiClient.post("/splits", body);
  }, onClose);
  return (
    <Modal
      title={
        title ??
        (templateMode
          ? "Split template"
          : split
            ? "Edit split expense"
            : "New split expense")
      }
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) action.mutate();
        }}
      >
        {fundedPurchase && (
          <p className="text-sm text-text-secondary">
            <T text="Choose at least one other participant. The total, payer and account are already recorded." />
          </p>
        )}
        {templateMode && (
          <label className="label">
            Template name
            <input
              className="field"
              required
              maxLength={120}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </label>
        )}
        <label className="label">
          <T text="Description" />
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
            readOnly={itemized || !!fundedPurchase}
            value={
              fundedPurchase?.amount ??
              (itemized ? (itemPreview?.total ?? "") : amount)
            }
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {!groupId && <MemberPicker selected={extra} onChange={setExtra} />}
        {!templateMode && (
          <label className="label">
            <T text="Category" />
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">
                <T text="Uncategorized" />
              </option>
              {categories.data
                ?.filter((c) => c.type === "EXPENSE")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={multi}
            disabled={!!fundedPurchase}
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
              disabled={!!fundedPurchase}
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
              disabled={!!fundedPurchase}
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
        {!fundedPurchase && (
          <p className="text-xs text-text-secondary">
            Other members’ payments use their default cash account.
          </p>
        )}
        {!templateMode && !onSave && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={itemized}
              onChange={(e) => setItemized(e.target.checked)}
            />
            Split by receipt items
          </label>
        )}
        {itemized && (
          <ItemizationEditor
            value={items}
            onChange={setItems}
            people={participants}
          />
        )}
        {itemized && <ErrorMessage error={itemError} />}
        {!itemized && (
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
              {["EQUAL", "EXACT", "PERCENTAGE", "SHARES", "ADJUSTMENT"].map(
                (m) => (
                  <option key={m} value={m}>
                    <T text={m[0] + m.slice(1).toLowerCase()} />
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        {!itemized && mode === "ADJUSTMENT" && (
          <p className="text-xs text-text-secondary">
            <T text="Enter each person’s extra or reduction. The remaining amount is shared equally; final shares cannot be negative." />
          </p>
        )}
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
                (itemized ? (
                  <span className="text-sm tabular-nums">
                    {itemPreview?.allocations[p.id] ?? "—"}
                  </span>
                ) : mode === "EQUAL" ? (
                  <span className="text-sm">Equal share</span>
                ) : (
                  <input
                    aria-label={`${p.name} ${mode.toLowerCase()} share`}
                    className="field max-w-32"
                    type="number"
                    min={mode === "ADJUSTMENT" ? undefined : "0"}
                    step={
                      mode === "EXACT" || mode === "ADJUSTMENT"
                        ? "0.01"
                        : "0.0001"
                    }
                    value={
                      values[p.id] ??
                      (mode === "SHARES"
                        ? "1"
                        : mode === "ADJUSTMENT"
                          ? "0"
                          : "")
                    }
                    onChange={(e) =>
                      setValues({ ...values, [p.id]: e.target.value })
                    }
                  />
                ))}
            </div>
          ))}
        </div>
        {adjustmentPreview && (
          <div
            className="rounded-lg border border-border-soft p-3 text-sm space-y-2"
            role="status"
          >
            <p className="font-semibold">
              <T text="Final shares" />
            </p>
            {adjustmentPreview.map((p) => (
              <div className="flex justify-between gap-3" key={p.userId}>
                <span>
                  {people.find((person) => person.id === p.userId)?.name}
                </span>
                <span>{money(p.amountOwed, currency)}</span>
              </div>
            ))}
          </div>
        )}
        <ErrorMessage
          error={
            adjustmentError instanceof Error
              ? new Error(translate(adjustmentError.message, locale))
              : adjustmentError
          }
        />
        <p role="status" className="text-xs text-text-secondary">
          Paid {payerSum.toFixed(2)} /{" "}
          {Number.isFinite(total) ? total.toFixed(2) : "0.00"}
          {mode !== "EQUAL" && mode !== "ADJUSTMENT"
            ? ` · Allocated ${shares.toFixed(mode === "EXACT" ? 2 : 4)}${mode === "PERCENTAGE" ? "%" : ""}`
            : ""}
          . Remainder cents are assigned in participant order.
        </p>
        <ErrorMessage
          error={
            action.error ||
            draftAction.error ||
            accounts.error ||
            categories.error
          }
        />
        {(mode === "EXACT" || multi) && (
          <p className="text-xs text-text-secondary">
            Review exact allocations and payer amounts when changing the total.
          </p>
        )}
        {seed &&
          [...seed.participants, ...seed.payers].some(
            (p) => !people.some((person) => person.id === p.userId),
          ) && (
            <p className="text-negative text-sm">
              A saved member is no longer in this group. Choose current
              participants and payers before saving.
              <label className="flex gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={removeUnavailable}
                  onChange={(e) => setRemoveUnavailable(e.target.checked)}
                />
                Remove unavailable members from this allocation
              </label>
            </p>
          )}
        {onSaveDraft && (
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={
              !valid ||
              !description.trim() ||
              draftAction.isPending ||
              action.isPending
            }
            onClick={() => draftAction.mutate(undefined)}
          >
            Save draft without posting
          </button>
        )}
        <button
          className="btn w-full"
          disabled={
            !valid ||
            !description.trim() ||
            action.isPending ||
            draftAction.isPending
          }
        >
          {submitLabel ?? (templateMode ? "Save template" : "Save split")}
        </button>
      </form>
    </Modal>
  );
}
