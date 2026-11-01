"use client";
import { useAuthStore } from "@/store/auth";
export function useFormat() {
  const user = useAuthStore((s) => s.user);
  const currency = user?.displayCurrency || "USD",
    timezone = user?.timezone || "UTC";
  return {
    currency,
    timezone,
    money: (n: number, c = currency) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: c,
      }).format(Number(n)),
    date: (date: string) =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(date)),
  };
}
