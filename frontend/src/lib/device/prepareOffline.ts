import { Capacitor } from "@capacitor/core";

/** Resolves only when the public shell and its code dependencies are cached. */
export async function prepareOfflineShell(): Promise<void> {
  if (Capacitor.isNativePlatform()) return; // Assets are bundled in the application.
  if (!("serviceWorker" in navigator))
    throw Error("This browser cannot prepare offline assets. Use a supported browser or the native app.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  const active = registration.active ?? await new Promise<ServiceWorker>((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) return reject(Error("Offline worker is unavailable"));
    const timer = setTimeout(() => { worker.removeEventListener("statechange", changed); reject(Error("Offline preparation timed out. Retry while connected.")); }, 30000);
    function changed() {
      if (worker!.state === "activated") {
        clearTimeout(timer); worker!.removeEventListener("statechange", changed); resolve(worker!);
      } else if (worker!.state === "redundant") {
        clearTimeout(timer); worker!.removeEventListener("statechange", changed); reject(Error("Offline preparation failed. Retry while connected."));
      }
    }
    worker.addEventListener("statechange", changed); changed();
  });
  await new Promise<void>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => finish(Error("Offline preparation timed out. Retry while connected.")), 60000);
    function finish(error?: Error) {
      clearTimeout(timer); navigator.serviceWorker.removeEventListener("message", receive);
      if (error) reject(error); else resolve();
    }
    function receive(event: MessageEvent) {
      if (event.source !== active || event.data?.requestId !== requestId) return;
      if (event.data.type === "DEVICE_READY") finish();
      if (event.data.type === "DEVICE_CACHE_FAILED") finish(Error("Offline assets could not be saved. Your encrypted records are safe; retry preparation while connected."));
    }
    navigator.serviceWorker.addEventListener("message", receive);
    active.postMessage({ type: "ENABLE_DEVICE", requestId });
  });
}
