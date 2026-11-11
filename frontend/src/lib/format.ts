"use client";
import { useLocale } from "@/components/i18n/Language";
import { useAuthStore } from "@/store/auth";
export function useFormat() {
  const locale = useLocale();
  const user = useAuthStore((s) => s.user);
  const currency = user?.displayCurrency || "USD",
    timezone = user?.timezone || "UTC";
  return {
    locale,
    currency,
    timezone,
    money: (n: number, c = currency) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: c,
      }).format(Number(n)),
    date: (date: string) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(date)),
  };
}
