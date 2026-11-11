"use client";
import { T } from "@/components/i18n/Language";
import { useEffect, useState } from "react";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function InstallApp() {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    function offer(e: Event) {
      e.preventDefault();
      setInstall(e as InstallEvent);
    }
    function installed() {
      setInstall(null);
    }
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return (
    <section className="panel space-y-3">
      <h2 className="font-semibold text-lg">
        <T text="Install LedgerSync" />
      </h2>
      <p className="text-sm">
        Use LedgerSync from your home screen in its own app window. On iPhone or
        iPad, open Safari’s Share menu and choose Add to Home Screen. Other
        browsers may show an Install option in their menu.
      </p>
      {install && (
        <button
          className="btn"
          onClick={async () => {
            try {
              await install.prompt();
              await install.userChoice;
              setInstall(null);
            } catch {
              setError("Open your browser menu to install the app.");
            }
          }}
        >
          Install app
        </button>
      )}
      {error && <p role="status">{error}</p>}
      <p className="text-xs text-text-secondary">
        Create an encrypted device workspace in Settings for offline personal
        finances. Open /device while offline. Cloud collaboration syncs after
        reconnection. API responses and credentials are never added to the
        service-worker cache.
      </p>
    </section>
  );
}
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Installation remains available without offline support. */
      });
    }
  }, []);
  return null;
}
