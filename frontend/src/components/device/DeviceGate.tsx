"use client";
import { T } from "@/components/i18n/Language";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  subscribe,
  workspace,
  initializeVault,
  unlock,
  lock,
} from "@/lib/device/vault";
import { DeviceWorkspace } from "./DeviceWorkspace";
export function DeviceGate({ children }: { children: React.ReactNode }) {
  const data = useSyncExternalStore(subscribe, workspace, () => null);
  const [state, setState] = useState<"LOADING" | "OPEN" | "LOCKED" | "ERROR">(
      "LOADING",
    ),
    [passcode, setPasscode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void initializeVault()
      .then((exists) => {
        if (live) setState(exists ? "LOCKED" : "OPEN");
      })
      .catch(() => {
        if (live) {
          setState("ERROR");
          setError(
            "Device storage is unavailable. Enable browser storage before opening your ledger.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    function locked() {
      setState("LOCKED");
      setPasscode("");
    }
    function storage(e: StorageEvent) {
      if (e.key === "ledgersync-vault-configured") {
        lock();
        location.reload();
        return;
      }
      if (e.key === "ledgersync-lock-event" && workspace()) lock();
    }
    window.addEventListener("ledgersync-lock", locked);
    window.addEventListener("ledgersync-native-lock", lock);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("ledgersync-lock", locked);
      window.removeEventListener("ledgersync-native-lock", lock);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const isUnlocked = !!data;
  useEffect(() => {
    if (!isUnlocked) return;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const interval = setInterval(() => {
      if (Date.now() - last >= 300000) lock();
    }, 10000);
    const hidden = () => {
      if (document.visibilityState === "hidden") lock();
    };
    for (const name of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(name, touch, { passive: true });
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(interval);
      for (const name of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(name, touch);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [isUnlocked]);
  if (state === "LOADING")
    return (
      <main className="min-h-screen grid place-items-center">
        <p role="status">
          <T text="Opening secure workspace…" />
        </p>
      </main>
    );
  if (state === "ERROR")
    return (
      <main className="p-8">
        <p role="alert">{error}</p>
        <button className="btn" onClick={() => location.reload()}>
          Retry
        </button>
      </main>
    );
  if (state === "LOCKED" && !data)
    return (
      <main className="min-h-screen grid place-items-center px-5">
        <form
          className="panel max-w-sm w-full space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await unlock(passcode);
              setPasscode("");
              setState("OPEN");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to unlock");
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="eyebrow">LedgerSync</p>
          <h1 className="text-2xl">
            <T text="Your ledger is locked" />
          </h1>
          <label className="label">
            <T text="Device passcode" />
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              required
              autoFocus
            />
          </label>
          <p className="text-xs text-text-secondary">
            The passcode decrypts this device’s workspace. It cannot be
            recovered. Keep an encrypted backup and its passphrase somewhere
            safe.
          </p>
          {error && (
            <p role="alert" className="text-negative">
              {error}
            </p>
          )}
          <button className="btn" disabled={busy}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      </main>
    );
  if (data?.mode === "LOCAL") return <DeviceWorkspace />;
  return children;
}
