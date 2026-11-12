import type { Workspace, PendingCommand } from "./vault";
import { unbase64, checksum } from "./crypto";
import { apiClient, ApiError } from "../api/client";
import { supabase } from "../supabase";
export { prepareReceipt, attachReceipt, removeReceipt } from "./receiptData";
export async function syncReceipt(
  w: Workspace,
  command: PendingCommand,
  map: Record<string, string>,
) {
  const p = command.payload;
  if (command.kind === "RECEIPT_DELETE") {
    try {
      await apiClient.delete(`/receipts/${String(p.id)}`);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    return;
  }
  let target = String(p.transactionId);
  const tx = w.tables.transactions?.find((t) => t.id === target) ?? {
    source_type: p.targetSourceType,
    source_id: p.targetSourceId,
    account_id: p.targetAccountId,
  };
  if (
    tx &&
    ["CONVERSION", "PERSONAL_ENTRY", "PERSONAL_LOAN", "PERSONAL_BILL"].includes(
      String(tx.source_type),
    ) &&
    map[String(tx.source_id)]
  ) {
    const params = new URLSearchParams({
      sourceType: String(tx.source_type),
      sourceId: map[String(tx.source_id)],
      accountId: map[String(tx.account_id)] ?? String(tx.account_id),
      type: String(tx.type ?? p.targetType),
      amount: String(tx.amount ?? p.targetAmount),
    });
    target = (
      await apiClient.get<{ id: string }>(
        `/portability/entry-reference?${params}`,
      )
    ).id;
  } else target = map[`transaction:${target}`] ?? map[target] ?? target;
  const receipt = await apiClient.post<{
    id: string;
    objectPath: string;
    status: string;
  }>("/receipts", {
    transactionId: target,
    fileName: p.fileName,
    mimeType: p.mimeType,
    byteSize: p.byteSize,
    requestKey: command.id,
  });
  if (command.kind === "RECEIPT_CANCEL") {
    await apiClient.delete(`/receipts/${receipt.id}`);
    return;
  }
  const file = w.attachments.find((a) => a.id === p.localId);
  if (!file)
    throw Error(
      "Pending receipt bytes are missing; restore a backup or cancel the upload",
    );
  const bytes = unbase64(file.bytes);
  if ((await checksum(bytes)) !== file.sha256)
    throw Error("Receipt checksum does not match");
  const storage = supabase().storage.from("receipts"),
    result = await storage.upload(receipt.objectPath, bytes, {
      contentType: file.mime,
      upsert: false,
    });
  if (result.error) {
    const existing = await storage.download(receipt.objectPath);
    if (
      existing.error ||
      (await checksum(new Uint8Array(await existing.data.arrayBuffer()))) !==
        file.sha256
    )
      throw Error("Receipt upload was not verified; retry when online");
  }
  await apiClient.post(`/receipts/${receipt.id}/complete`, {});
}
