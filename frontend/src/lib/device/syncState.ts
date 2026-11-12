import type { Workspace, PendingCommand } from "./vault";
const referenceKeys = new Set([
  "id",
  "localId",
  "accountId",
  "sourceAccountId",
  "targetAccountId",
  "groupId",
  "billId",
  "loanId",
  "sourceId",
  "categoryId",
  "templateId",
  "scheduleId",
  "assetId",
  "eventId",
  "payeeId",
  "payerId",
  "userId",
  "participantIds",
  "memberIds",
  "account_id",
  "category_id",
  "asset_id",
  "event_id",
  "plan_id",
  "loan_id",
  "bill_id",
  "transaction_id",
]);
/** Remap entity references only; names, notes, labels and arbitrary metadata are immutable user content. */
export function resolveReferences(
  value: unknown,
  map: Record<string, string>,
  field = "",
): unknown {
  if (
    [
      "metadata",
      "notes",
      "description",
      "name",
      "title",
      "counterparty",
      "tags",
    ].includes(field)
  )
    return value;
  if (typeof value === "string")
    return referenceKeys.has(field) ? (map[value] ?? value) : value;
  if (Array.isArray(value))
    return value.map((v) => resolveReferences(v, map, field));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveReferences(v, map, k)]),
    );
  return value;
}
export function acknowledge(
  w: Workspace,
  cmd: PendingCommand,
  result: { id?: string; updatedAt?: string; rowVersion?: string } | null,
) {
  const map = ((
    w as Workspace & { resolvedIds?: Record<string, string> }
  ).resolvedIds ??= {});
  if (result?.id) {
    map[cmd.id] = result.id;
    if (cmd.payload.localId) map[String(cmd.payload.localId)] = result.id;
  }
  const table =
    typeof cmd.payload.table === "string"
      ? cmd.payload.table
      : cmd.kind.startsWith("LOAN_")
        ? cmd.kind === "LOAN_PAY" || cmd.kind === "LOAN_REVERSE"
          ? "loan_payments"
          : "personal_loans"
        : cmd.kind.startsWith("BILL_")
          ? cmd.kind === "BILL_CREATE" || cmd.kind === "BILL_UPDATE"
            ? "personal_bills"
            : "bill_occurrences"
          : cmd.kind.startsWith("TX_")
            ? "transactions"
            : cmd.kind.startsWith("ACCOUNT_")
              ? "accounts"
              : cmd.kind.startsWith("CATEGORY_")
                ? "categories"
                : cmd.kind.startsWith("CONVERSION_")
                  ? "currency_conversions"
                  : cmd.kind.startsWith("PERSONAL_ENTRY_")
                    ? "personal_entries"
                    : undefined;
  const target = cmd.payload.localId ?? cmd.payload.id ?? cmd.id,
    row = table ? w.tables[table]?.find((r) => r.id === target) : undefined;
  if (row) {
    if (result?.updatedAt) row.updated_at = result.updatedAt;
    if (result?.rowVersion) row.row_version = result.rowVersion;
  }
  w.commands = w.commands.filter((c) => c.id !== cmd.id);
  for (const next of w.commands) {
    if (
      next.payload.id !== target &&
      !(cmd.payload.id !== undefined && next.payload.id === cmd.payload.id)
    )
      continue;
    if (result?.rowVersion) next.payload.expectedVersion = result.rowVersion;
    if (result?.updatedAt) next.expectedUpdatedAt = result.updatedAt;
  }
}
