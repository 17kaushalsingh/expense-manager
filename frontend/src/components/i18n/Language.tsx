"use client";
import { workspace, changeWorkspace } from "@/lib/device/vault";
import { useEffect, useSyncExternalStore } from "react";
import { locales, Locale, translate } from "@/lib/i18n/catalogs";
const key = "ledgersync-locale";
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("ledgersync-language", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("ledgersync-language", callback);
  };
};
function snapshot(): Locale {
  const value = localStorage.getItem(key) ?? "en";
  return value in locales ? (value as Locale) : "en";
}
export function useLocale() {
  return useSyncExternalStore(subscribe, snapshot, () => "en" as Locale);
}
export function T({ text }: { text: string }) {
  const locale = useLocale();
  return translate(text, locale);
}
export function LanguageSettings() {
  const locale = useLocale();
  return (
    <section className="panel max-w-xl">
      <label className="label">
        <T text="Language" />
        <select
          className="field"
          value={locale}
          onChange={(e) => {
            localStorage.setItem(key, e.target.value);
            window.dispatchEvent(new Event("ledgersync-language"));
            if (workspace())
              void changeWorkspace((w) => {
                w.locale = e.target.value;
              }).catch(() => {});
          }}
        >
          {Object.entries(locales).map(([code, name]) => (
            <option value={code} key={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-text-secondary mt-3">
        Language and number/date formatting apply on this device. User-written
        names and notes stay in their original language. Some detailed help and
        validation messages are currently English.
      </p>
    </section>
  );
}
export function LanguageRoot({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  return (
    <div lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      {children}
    </div>
  );
}
