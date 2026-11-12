import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareOfflineShell } from "../../../frontend/src/lib/device/prepareOffline";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function worker(result: "DEVICE_READY" | "DEVICE_CACHE_FAILED") {
  const events = new EventTarget();
  const active = { postMessage: vi.fn((message: { requestId: string }) => {
    queueMicrotask(() => {
      // An unrelated response must never mark this request ready.
      events.dispatchEvent(Object.assign(new Event("message"), { data: { type: "DEVICE_READY", requestId: "other-request" }, source: active }));
      events.dispatchEvent(Object.assign(new Event("message"), { data: { type: result, requestId: message.requestId }, source: active }));
    });
  }) };
  vi.stubGlobal("navigator", { serviceWorker: { register: vi.fn().mockResolvedValue({ active }), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) } });
  return active;
}
describe("explicit browser offline preparation", () => {
  it("waits for this worker's acknowledged cache request", async () => {
    const active = worker("DEVICE_READY");
    await expect(prepareOfflineShell()).resolves.toBeUndefined();
    expect(active.postMessage).toHaveBeenCalledWith({ type: "ENABLE_DEVICE", requestId: expect.any(String) });
  });
  it("reports incomplete caching instead of claiming readiness", async () => {
    worker("DEVICE_CACHE_FAILED");
    await expect(prepareOfflineShell()).rejects.toThrow("could not be saved");
  });
  it("explains unsupported browser storage", async () => {
    vi.stubGlobal("navigator", {});
    await expect(prepareOfflineShell()).rejects.toThrow("supported browser");
  });
});
