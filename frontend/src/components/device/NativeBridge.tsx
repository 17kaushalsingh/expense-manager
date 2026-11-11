"use client";
import {useRouter} from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { workspace, subscribe } from "@/lib/device/vault";
import { widgetSnapshot, WidgetSnapshot } from "@/lib/device/widgets";
const Widgets = registerPlugin<{
  update(options: WidgetSnapshot): Promise<void>;
  clear(): Promise<void>;
}>("LedgerWidget");
export function NativeBridge() {
  const router=useRouter();
  const w = useSyncExternalStore(subscribe, workspace, () => null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let live = true;
    void (w ? Widgets.update(widgetSnapshot(w)) : Widgets.clear()).catch(() => {
      /* Never make finances depend on widget availability. */
    });
    const clear = () => {
      void Widgets.clear().catch(() => {});
    };
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest("a");
      if (!anchor) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin) return;
      const match = url.pathname.match(/^\/groups\/([0-9a-f-]{36})\/?$/i);
      if (match) {
        event.preventDefault();
        router.push(`/group/?groupId=${match[1]}`);
      }
    };
    window.addEventListener("ledgersync-lock", clear);
    window.addEventListener("ledgersync-signout", clear);
    document.addEventListener("click", link, true);
    const timer = setTimeout(() => {
      if (live) clear();
    }, 300000);
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener("ledgersync-lock", clear);
      window.removeEventListener("ledgersync-signout", clear);
      document.removeEventListener("click", link, true);
    };
  }, [w,router]);
  return null;
}
