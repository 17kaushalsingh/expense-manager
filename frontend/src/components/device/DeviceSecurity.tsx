"use client";
import { T } from "@/components/i18n/Language";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/auth";
import { apiClient } from "@/lib/api/client";
import {
  Workspace,
  workspace,
  subscribe,
  blankWorkspace,
  createVault,
  changeWorkspace,
  changePasscode,
  lock,
  exportBackup,
  previewBackup,
  restoreBackup,
} from "@/lib/device/vault";
import { ErrorMessage } from "@/components/ui/Controls";
export function DeviceSecurity() {
  const router = useRouter();
  const data = useSyncExternalStore(subscribe, workspace, () => null),
    user = useAuthStore((s) => s.user);
  const [passcode, setPasscode] = useState(""),
    [confirm, setConfirm] = useState(""),
    [backupPassword, setBackupPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<Workspace>(),
    [file, setFile] = useState<File>();
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function enable(local: boolean) {
    if (passcode !== confirm) throw Error("Passcodes do not match");
    let w = blankWorkspace(
      user?.name ?? "My ledger",
      user?.displayCurrency ?? "USD",
      user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    if (!local) {
      if (!user) throw Error("Sign in before protecting a cloud workspace");
      w = {
        ...w,
        ownerId: user.id,
        mode: "CLOUD",
        profile: {
          ...w.profile,
          ...user,
          displayCurrency: user.displayCurrency ?? "USD",
          timezone: user.timezone ?? "UTC",
        },
      };
      const snap = await apiClient.get<{
        ownerId: string;
        tables: Workspace["tables"];
        attachments: Workspace["attachments"];
      }>("/portability/export");
      if (snap.ownerId !== user.id)
        throw Error("Account changed while preparing this workspace");
      w.tables = snap.tables;
      w.attachments = snap.attachments;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("sb-") && k.includes("auth-token"))
          w.sessions[k] = localStorage.getItem(k)!;
      }
    }
    await createVault(passcode, w);
    for (const k of Object.keys(w.sessions)) localStorage.removeItem(k);
    if (local) {
      window.dispatchEvent(new Event("ledgersync-auth-reset"));
      for (const k of Object.keys(localStorage))
        if (k.startsWith("sb-") && k.includes("auth-token"))
          localStorage.removeItem(k);
    }
    localStorage.setItem("ledgersync-vault-configured", w.id);
    navigator.serviceWorker?.controller?.postMessage({ type: "ENABLE_DEVICE" });
    setPasscode("");
    setConfirm("");
    router.push("/device");
  }
  return (
    <section className="panel space-y-5 max-w-2xl">
      <h2 className="text-xl">
        <T text="Device security & backups" />
      </h2>
      <p className="text-sm text-text-secondary">
        Encrypted with AES-256-GCM and a PBKDF2-derived key. Locks after 5
        minutes of inactivity or when the app is hidden. A long passphrase is
        safer than a short PIN. This protects stored data, not a compromised or
        rooted device.
      </p>
      {!data ? (
        <>
          <label className="label">
            <T text="New device passcode" />
            <input
              className="field"
              type="password"
              minLength={8}
              maxLength={1024}
              autoComplete="new-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
          </label>
          <label className="label">
            <T text="Confirm passcode" />
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {user && (
              <button
                className="btn"
                disabled={busy || passcode.length < 8}
                onClick={() => run(() => enable(false))}
              >
                <T text="Protect this account on this device" />
              </button>
            )}
            <button
              className="btn-secondary"
              disabled={busy || passcode.length < 8}
              onClick={() => run(() => enable(true))}
            >
              <T text="Create private offline ledger" />
            </button>
          </div>
          <p className="text-xs">
            A private ledger stays on this device and does not change your cloud
            finances.
          </p>
        </>
      ) : (
        <>
          <label className="flex gap-3 items-center text-sm">
            <input
              type="checkbox"
              checked={data.widgetAmounts}
              onChange={(e) =>
                void run(() =>
                  changeWorkspace((w) => {
                    w.widgetAmounts = e.target.checked;
                  }),
                )
              }
            />
            Share totals with native home-screen widgets while unlocked (hidden
            by default)
          </label>
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={lock}>
              <T text="Lock now" />
            </button>
            <a className="btn-secondary" href="/device">
              <T text="Open device workspace" />
            </a>
          </div>
          <label className="label">
            <T text="New device passcode" />
            <input
              className="field"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
          </label>
          <label className="label">
            <T text="Confirm new passcode" />
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button
            className="btn-secondary"
            disabled={busy || passcode.length < 8}
            onClick={() =>
              run(async () => {
                if (passcode !== confirm) throw Error("Passcodes do not match");
                await changePasscode(passcode);
                setPasscode("");
                setConfirm("");
                setNotice("Passcode changed.");
              })
            }
          >
            <T text="Change passcode" />
          </button>
          {data.mode === "CLOUD" && (
            <button
              className="btn-secondary"
              disabled={busy || data.commands.length > 0}
              onClick={() =>
                run(async () => {
                  const snapshot = await apiClient.get<{
                    ownerId: string;
                    tables: Workspace["tables"];
                    attachments: Workspace["attachments"];
                  }>("/portability/export");
                  if (snapshot.ownerId !== data.ownerId)
                    throw Error("Account identity mismatch");
                  await changeWorkspace((w) => {
                    w.tables = snapshot.tables;
                    w.attachments = snapshot.attachments;
                  });
                  setNotice(
                    "Cloud snapshot and all available receipt files saved on this device.",
                  );
                })
              }
            >
              <T text="Refresh full cloud snapshot & receipt files" />
            </button>
          )}
          <label className="label">
            <T text="Backup passphrase" />
            <input
              className="field"
              type="password"
              minLength={8}
              maxLength={1024}
              autoComplete="new-password"
              value={backupPassword}
              onChange={(e) => setBackupPassword(e.target.value)}
            />
          </label>
          <p className="text-xs">
            Backups contain all device records, receipt files and pending
            operations. Authentication tokens are excluded. Cloud snapshots
            include only data your current account may access. Refresh first for
            the latest cloud records.
          </p>
          <button
            className="btn"
            disabled={busy || backupPassword.length < 8}
            onClick={() =>
              run(async () => {
                const blob = new Blob(
                    [JSON.stringify(await exportBackup(backupPassword))],
                    { type: "application/json" },
                  ),
                  url = URL.createObjectURL(blob),
                  a = document.createElement("a");
                a.href = url;
                a.download = `ledgersync-${new Date().toISOString().slice(0, 10)}.ledgerbackup`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setNotice(
                  "Encrypted backup prepared. Keep its passphrase separately.",
                );
              })
            }
          >
            <T text="Download encrypted full backup" />
          </button>
          <label className="label">
            <T text="Restore encrypted backup" />
            <input
              className="field"
              type="file"
              accept=".ledgerbackup,application/json"
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                setPreview(undefined);
              }}
            />
          </label>
          <button
            className="btn-secondary"
            disabled={busy || !file || backupPassword.length < 8}
            onClick={() =>
              run(async () => {
                if (file!.size > 180 * 1024 * 1024)
                  throw Error("Backup is larger than 180 MiB");
                setPreview(
                  await previewBackup(await file!.text(), backupPassword),
                );
              })
            }
          >
            <T text="Validate & preview restore" />
          </button>
          {preview && (
            <div className="rounded-xl border border-border-soft p-4 space-y-3">
              <p>
                {preview.profile.name} · {preview.mode} ·{" "}
                {preview.profile.displayCurrency}
              </p>
              <p>
                {Object.values(preview.tables).reduce(
                  (n, r) => n + r.length,
                  0,
                )}{" "}
                records · {preview.attachments.length} receipts ·{" "}
                {preview.commands.length} pending operations
              </p>
              <p className="text-sm">
                Replace this device’s workspace with this backup? Cloud history
                will stay unchanged. Restored pending operations require review
                before syncing.
              </p>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await restoreBackup(preview);
                    setPreview(undefined);
                    setBackupPassword("");
                    setNotice(
                      "Device workspace restored atomically. Cloud history was not overwritten.",
                    );
                  })
                }
              >
                <T text="Replace device data with this backup" />
              </button>
            </div>
          )}
        </>
      )}
      <ErrorMessage error={error} />
      {notice && (
        <p role="status" className="text-positive">
          {notice}
        </p>
      )}
    </section>
  );
}
