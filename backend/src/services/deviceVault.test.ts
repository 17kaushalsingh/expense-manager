import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
const pass = "correct horse battery staple";
let vault: typeof import("../../../frontend/src/lib/device/vault");
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("indexedDB", new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  vi.stubGlobal("window", new EventTarget());
  vault = await import("../../../frontend/src/lib/device/vault");
});
afterEach(() => vi.unstubAllGlobals());
describe("encrypted device vault and full archive", () => {
  it("does not create a vault if its account changed during encryption", async () => {
    const w = vault.blankWorkspace("Ledger", "USD", "UTC");
    await expect(vault.createVault(pass, w, () => { throw Error("Account changed"); })).rejects.toThrow("Account changed");
    expect(vault.workspace()).toBeNull();
    expect(await vault.initializeVault()).toBe(false);
  });
  it("persists ciphertext, clears keys on lock and restores after unlock", async () => {
    const w = vault.blankWorkspace("Private name", "USD", "UTC");
    await vault.createVault(pass, w);
    await vault.changeWorkspace((c) => {
      c.tables.accounts.push({
        id: "cash",
        name: "Secret wallet",
        balance: 123,
      });
    });
    vault.lock();
    expect(vault.workspace()).toBeNull();
    await expect(vault.unlock("incorrect password")).rejects.toThrow(
      "Incorrect passcode",
    );
    await vault.unlock(pass);
    expect(vault.workspace()!.tables.accounts[0].balance).toBe(123);
    const request = indexedDB.open("ledgersync-encrypted-device", 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const record = await new Promise<unknown>((resolve) => {
      const r = db.transaction("vault").objectStore("vault").get("workspace");
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    expect(JSON.stringify(record)).not.toContain("Secret wallet");
    expect(JSON.stringify(record)).not.toContain("Private name");
  });
  it("serializes simultaneous mutations and rolls back invalid changes", async () => {
    await vault.createVault(pass, vault.blankWorkspace("Ledger", "USD", "UTC"));
    await Promise.all([
      vault.changeWorkspace((w) =>
        w.tables.accounts.push({ id: "a", balance: 0 }),
      ),
      vault.changeWorkspace((w) =>
        w.tables.accounts.push({ id: "b", balance: 0 }),
      ),
    ]);
    expect(vault.workspace()!.tables.accounts).toHaveLength(2);
    await expect(
      vault.changeWorkspace((w) => {
        w.profile.displayCurrency = "INVALID";
      }),
    ).rejects.toThrow();
    expect(vault.workspace()!.profile.displayCurrency).toBe("USD");
    vault.lock();
    await vault.unlock(pass);
    expect(vault.workspace()!.tables.accounts).toHaveLength(2);
  });
  it("exports every table and attachment but never session tokens; restores atomically", async () => {
    const crypto = await import("../../../frontend/src/lib/device/crypto");
    const bytes = new TextEncoder().encode("synthetic receipt"),
      hash = await crypto.checksum(bytes);
    const w = vault.blankWorkspace("Ledger", "USD", "UTC");
    w.sessions = { "sb-test-auth-token": "secret bearer" };
    w.tables.reminders = [{ id: "r", title: "Pay bill" }];
    w.attachments = [
      {
        id: "receipt",
        name: "receipt.pdf",
        mime: "application/pdf",
        bytes: crypto.base64(bytes),
        sha256: hash,
      },
    ];
    await vault.createVault(pass, w);
    const encrypted = await vault.exportBackup("separate backup password");
    expect(JSON.stringify(encrypted)).not.toContain("secret bearer");
    const preview = await vault.previewBackup(
      JSON.stringify(encrypted),
      "separate backup password",
    );
    expect(preview.sessions).toEqual({});
    expect(preview.attachments[0].bytes).toBe(crypto.base64(bytes));
    await vault.changeWorkspace((w) => {
      w.tables.reminders = [];
    });
    await vault.restoreBackup(preview);
    expect(vault.workspace()!.tables.reminders).toHaveLength(1);
    expect(vault.workspace()!.sessions["sb-test-auth-token"]).toBe(
      "secret bearer",
    );
  });
  it("rejects corrupt archives and wrong identities before replacing data", async () => {
    const crypto = await import("../../../frontend/src/lib/device/crypto");
    await vault.createVault(pass, vault.blankWorkspace("Ledger", "USD", "UTC"));
    const encrypted = await vault.exportBackup(pass);
    encrypted.ciphertext =
      (encrypted.ciphertext[0] === "A" ? "B" : "A") +
      encrypted.ciphertext.slice(1);
    await expect(
      vault.previewBackup(JSON.stringify(encrypted), pass),
    ).rejects.toThrow();
    const wrong = vault.blankWorkspace("Other", "USD", "UTC");
    wrong.mode = "CLOUD";
    wrong.ownerId = wrong.profile.id;
    await expect(vault.restoreBackup(wrong)).rejects.toThrow(
      "another workspace",
    );
    expect(vault.workspace()!.profile.name).toBe("Ledger");
    const e = await vault.exportBackup(pass);
    expect(() => crypto.validateEnvelope({ ...e, iterations: 1 })).toThrow();
  });
  it("detects conflicting writes from another unlocked tab", async () => {
    await vault.createVault(pass, vault.blankWorkspace("Ledger", "USD", "UTC"));
    vi.resetModules();
    const second = await import("../../../frontend/src/lib/device/vault");
    await second.initializeVault();
    await second.unlock(pass);
    await vault.changeWorkspace((w) => {
      w.profile.name = "First tab";
    });
    await expect(
      second.changeWorkspace((w) => {
        w.profile.name = "Second tab";
      }),
    ).rejects.toThrow("another tab");
    second.lock();
    await second.unlock(pass);
    expect(second.workspace()!.profile.name).toBe("First tab");
  });
  it("changes the encryption key and rejects the old passcode", async () => {
    await vault.createVault(pass, vault.blankWorkspace("Ledger", "USD", "UTC"));
    await vault.changePasscode("new long password");
    vault.lock();
    await expect(vault.unlock(pass)).rejects.toThrow();
    await vault.unlock("new long password");
    expect(vault.workspace()!.profile.name).toBe("Ledger");
  });
  it("erases only local state after exact confirmation and cannot silently reset the passcode", async () => {
    await vault.createVault(pass, vault.blankWorkspace("Ledger", "USD", "UTC"));
    await expect(vault.eraseDevice("wrong")).rejects.toThrow(
      "Type ERASE DEVICE",
    );
    expect(vault.workspace()).not.toBeNull();
    await vault.eraseDevice("ERASE DEVICE");
    expect(vault.workspace()).toBeNull();
    expect(await vault.initializeVault()).toBe(false);
  });
  it("rejects cross-account SDK storage and generation-reused stale writes", async () => {
    const w = vault.blankWorkspace("A", "USD", "UTC");
    w.mode = "CLOUD";
    w.ownerId = w.profile.id;
    await vault.createVault(pass, w);
    await expect(
      vault.authStorage.setItem(
        vault.authKeyPrefix(),
        JSON.stringify({ user: { id: "another identity" } }),
      ),
    ).rejects.toThrow("another account");
    vi.resetModules();
    const stale = await import("../../../frontend/src/lib/device/vault");
    await stale.initializeVault();
    await stale.unlock(pass);
    await vault.eraseDevice("ERASE DEVICE");
    await vault.createVault(
      "new workspace password",
      vault.blankWorkspace("B", "USD", "UTC"),
    );
    await expect(
      stale.changeWorkspace((copy) => {
        copy.profile.name = "Stale A";
      }),
    ).rejects.toThrow("another tab");
    stale.lock();
    await stale.unlock("new workspace password");
    expect(stale.workspace()!.profile.name).toBe("B");
  });
});
