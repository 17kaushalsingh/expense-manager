"use client";
import { useSyncExternalStore } from "react";
const key = "ledgersync-appearance";
const accents = ["sage", "blue", "rose", "amber", "plum"];
function accentSnapshot() {
  const value = localStorage.getItem("ledgersync-accent") ?? "sage";
  return accents.includes(value) ? value : "sage";
}
function subscribe(callback: () => void) {
  const update = () => {
    document.documentElement.dataset.theme = snapshot();
    document.documentElement.dataset.accent = accentSnapshot();
    callback();
  };
  window.addEventListener("storage", update);
  window.addEventListener("appearance-change", update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener("appearance-change", update);
  };
}
function snapshot() {
  const mode = localStorage.getItem(key) ?? "light";
  return ["light", "dark", "system"].includes(mode) ? mode : "light";
}
export function Appearance() {
  const selected = useSyncExternalStore(subscribe, snapshot, () => "light");
  const accent = useSyncExternalStore(subscribe, accentSnapshot, () => "sage");
  return (
    <section className="panel space-y-4">
      <div>
        <h2 className="section-title">Appearance</h2>
        <p className="text-xs text-text-secondary mt-1">
          Choose a look for this device.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">Accent color</legend>
        <div className="flex flex-wrap gap-2">
          {accents.map((color) => (
            <button
              key={color}
              className="btn-secondary capitalize"
              aria-pressed={accent === color}
              onClick={() => {
                localStorage.setItem("ledgersync-accent", color);
                document.documentElement.dataset.accent = color;
                window.dispatchEvent(new Event("appearance-change"));
              }}
            >
              <span className={`accent-swatch ${color}`} aria-hidden="true" />
              {color}
              {accent === color ? " ✓" : ""}
            </button>
          ))}
        </div>
      </fieldset>
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
