"use client";
import { useSyncExternalStore } from "react";
const key = "ledgersync-appearance";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("appearance-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("appearance-change", callback);
  };
}
function snapshot() {
  return localStorage.getItem(key) ?? "light";
}
export function Appearance() {
  const selected = useSyncExternalStore(subscribe, snapshot, () => "light");
  return (
    <section className="panel space-y-4">
      <div>
        <h2 className="section-title">Appearance</h2>
        <p className="text-xs text-text-secondary mt-1">
          Choose a look for this device.
        </p>
      </div>
      <div className="segmented">
        {["light", "dark", "system"].map((mode) => (
          <button
            className="segment capitalize"
            key={mode}
            aria-pressed={mode === selected}
            onClick={() => {
              localStorage.setItem(key, mode);
              document.documentElement.dataset.theme = mode;
              window.dispatchEvent(new Event("appearance-change"));
            }}
          >
            {mode}
          </button>
        ))}
      </div>
    </section>
  );
}
