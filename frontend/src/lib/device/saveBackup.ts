import { Capacitor, registerPlugin } from "@capacitor/core";
import { validateEnvelope } from "./crypto";
const Files = registerPlugin<{ saveBackup(options: { contents: string }): Promise<void> }>("LedgerFiles");
export async function saveEncryptedBackup(envelope: unknown) {
  const contents = JSON.stringify(validateEnvelope(envelope));
  if (Capacitor.isNativePlatform()) {
    await Files.saveBackup({ contents });
    return;
  }
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ledgersync-${new Date().toISOString().slice(0, 10)}.ledgerbackup`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
