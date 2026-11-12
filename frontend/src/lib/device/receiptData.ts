import type { Workspace } from "./vault";
import { base64, unbase64, checksum } from "./crypto";
export async function prepareReceipt(file: File) {
  if (
    file.size < 1 ||
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
      file.type,
    )
  )
    throw Error("Use a JPEG, PNG, WebP or PDF receipt up to 5 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 160),
    mime: file.type,
    bytes: base64(bytes),
    sha256: await checksum(bytes),
  };
}
export function attachReceipt(
  w: Workspace,
  transactionId: string,
  a: Workspace["attachments"][number],
) {
  const tx = w.tables.transactions?.find((t) => t.id === transactionId);
  if (
    !tx ||
    ![
      "MANUAL",
      "CONVERSION",
      "PERSONAL_ENTRY",
      "PERSONAL_LOAN",
      "PERSONAL_BILL",
    ].includes(String(tx.source_type))
  )
    throw Error("This entry cannot have a personal receipt");
  if (
    (w.tables.receipt_attachments ?? []).filter(
      (r) => r.transaction_id === transactionId,
    ).length >= 10
  )
    throw Error("An expense can have at most 10 receipts");
  w.attachments.push(a);
  (w.tables.receipt_attachments ??= []).push({
    id: a.id,
    transaction_id: transactionId,
    file_name: a.name,
    mime_type: a.mime,
    byte_size: unbase64(a.bytes).length,
    status: "LOCAL",
  });
  if (w.mode === "CLOUD")
    w.commands.push({
      id: crypto.randomUUID(),
      kind: "RECEIPT_UPLOAD",
      payload: {
        localId: a.id,
        transactionId,
        targetSourceType: tx.source_type,
        targetSourceId: tx.source_id,
        targetAccountId: tx.account_id,
        targetType: tx.type,
        targetAmount: tx.amount,
        fileName: a.name,
        mimeType: a.mime,
        byteSize: unbase64(a.bytes).length,
      },
      createdAt: new Date().toISOString(),
      status: "PENDING",
    });
}
export function removeReceipt(w: Workspace, id: string) {
  const r = w.tables.receipt_attachments?.find((r) => r.id === id);
  if (!r) throw Error("Receipt is unavailable");
  const upload = w.commands.find(
    (c) => c.kind === "RECEIPT_UPLOAD" && c.payload.localId === id,
  );
  if (upload) {
    upload.kind = "RECEIPT_CANCEL";
    upload.status = "PENDING";
    delete upload.error;
  } else if (w.mode === "CLOUD")
    w.commands.push({
      id: crypto.randomUUID(),
      kind: "RECEIPT_DELETE",
      payload: { id },
      createdAt: new Date().toISOString(),
      status: "PENDING",
    });
  w.tables.receipt_attachments = w.tables.receipt_attachments.filter(
    (r) => r.id !== id,
  );
  w.attachments = w.attachments.filter((a) => a.id !== id);
}
