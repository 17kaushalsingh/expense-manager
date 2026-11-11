import { Envelope, derive, seal, open, unbase64, checksum } from "./crypto";
export interface PendingCommand {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  expectedUpdatedAt?: string;
  createdAt: string;
  status: "PENDING" | "CONFLICT";
  error?: string;
  result?: unknown;
}
export interface Workspace {
  version: 1;
  id: string;
  ownerId: string | null;
  profile: {
    id: string;
    name: string;
    displayCurrency: string;
    timezone: string;
  };
  mode: "LOCAL" | "CLOUD";
  tables: Record<string, Record<string, unknown>[]>;
  attachments: {
    id: string;
    name: string;
    mime: string;
    bytes: string;
    sha256: string;
  }[];
  commands: PendingCommand[];
  sessions: Record<string, string>;
  locale: string;
  widgetAmounts: boolean;
  updatedAt: string;
}
interface Stored {
  revision: number;
  envelope: Envelope;
}
let current: Workspace | null = null,
  key: CryptoKey | null = null,
  salt: Uint8Array | null = null,
  revision = 0,
  configured = false,
  chain = Promise.resolve();
const listeners = new Set<() => void>();
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify() {
  listeners.forEach((fn) => fn());
}
export const workspace = () => current;
export const vaultConfigured = () => configured;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("ledgersync-encrypted-device", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("vault");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function read(): Promise<Stored | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("vault", "readonly"),
        r = tx.objectStore("vault").get("workspace");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
async function write(value: Stored, expected: number) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite"),
        store = tx.objectStore("vault"),
        r = store.get("workspace");
      r.onsuccess = () => {
        if ((r.result?.revision ?? 0) !== expected) {
          tx.abort();
          return;
        }
        store.put(value, "workspace");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? Error("Unable to save device data"));
      tx.onabort = () =>
        reject(
          Error(
            "Device data changed in another tab. Lock and unlock before continuing.",
          ),
        );
    });
  } finally {
    db.close();
  }
}
export async function initializeVault() {
  configured = !!(await read());
  notify();
  return configured;
}
export function validateWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== "object") throw Error("Invalid workspace");
  const w = value as Workspace;
  if (
    w.version !== 1 ||
    typeof w.id !== "string" ||
    !["LOCAL", "CLOUD"].includes(w.mode) ||
    !w.profile ||
    typeof w.profile.id !== "string" ||
    typeof w.profile.name !== "string" ||
    !/^[A-Z]{3}$/.test(w.profile.displayCurrency) ||
    typeof w.profile.timezone !== "string" ||
    !w.tables ||
    typeof w.tables !== "object" ||
    Array.isArray(w.tables) ||
    !Array.isArray(w.attachments) ||
    !Array.isArray(w.commands) ||
    !w.sessions ||
    typeof w.sessions !== "object" ||
    !Object.values(w.tables).every(
      (rows) =>
        Array.isArray(rows) &&
        rows.length <= 20000 &&
        rows.every((r) => r && typeof r === "object" && !Array.isArray(r)),
    ) ||
    w.commands.length > 10000 ||
    w.attachments.length > 5000 ||
    Object.keys(w.sessions).some(
      (s) => !s.startsWith("sb-") || s.length > 200,
    ) ||
    !Object.values(w.sessions).every((s) => typeof s === "string")
  )
    throw Error("Invalid workspace manifest");
  if (
    (w.mode === "CLOUD" && (!w.ownerId || w.ownerId !== w.profile.id)) ||
    (w.mode === "LOCAL" && w.ownerId !== null)
  )
    throw Error("Workspace identity does not match its manifest");
  new Intl.DateTimeFormat("en", { timeZone: w.profile.timezone });
  for (const c of w.commands)
    if (
      !c ||
      typeof c.id !== "string" ||
      typeof c.kind !== "string" ||
      !["PENDING", "CONFLICT"].includes(c.status) ||
      !c.payload ||
      typeof c.payload !== "object"
    )
      throw Error("Invalid pending operation");
  for (const a of w.attachments)
    if (
      !a ||
      typeof a.bytes !== "string" ||
      typeof a.sha256 !== "string" ||
      unbase64(a.bytes).length > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
        a.mime,
      )
    )
      throw Error("Invalid attachment manifest");
  return w;
}
export async function unlock(passcode: string) {
  const retry = JSON.parse(
    localStorage.getItem("ledgersync-unlock-delay") ??
      '{"attempts":0,"until":0}',
  );
  if (retry.until > Date.now())
    throw Error(
      `Try again in ${Math.ceil((retry.until - Date.now()) / 1000)} seconds.`,
    );
  const stored = await read();
  if (!stored) throw Error("No device workspace exists");
  try {
    const result = await open<Workspace>(stored.envelope, passcode);
    current = validateWorkspace(result.value);
    key = result.key;
    salt = result.salt;
    revision = stored.revision;
    configured = true;
    localStorage.removeItem("ledgersync-unlock-delay");
    notify();
  } catch (error) {
    const attempts = Math.min(20, (retry.attempts || 0) + 1);
    localStorage.setItem(
      "ledgersync-unlock-delay",
      JSON.stringify({
        attempts,
        until:
          Date.now() +
          (attempts >= 5 ? Math.min(300000, 1000 * 2 ** (attempts - 5)) : 0),
      }),
    );
    throw error;
  }
}
export function lock() {
  current = null;
  key = null;
  salt = null;
  notify();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ledgersync-lock"));
    localStorage.setItem("ledgersync-lock-event", String(Date.now()));
  }
}
export async function createVault(passcode: string, data: Workspace) {
  if (await read())
    throw Error("A device workspace already exists. Unlock it first.");
  const s = crypto.getRandomValues(new Uint8Array(16)),
    k = await derive(passcode, s);
  const w = validateWorkspace(structuredClone(data));
  await write({ revision: 1, envelope: await seal(w, k, s) }, 0);
  current = w;
  key = k;
  salt = s;
  revision = 1;
  configured = true;
  notify();
}
export function changeWorkspace(
  mutate: (copy: Workspace) => void,
): Promise<void> {
  const task = chain.then(async () => {
    if (!current || !key || !salt)
      throw Error("Unlock the device workspace first");
    const before = current,
      k = key,
      s = salt,
      expected = revision,
      copy = structuredClone(before);
    mutate(copy);
    copy.updatedAt = new Date().toISOString();
    validateWorkspace(copy);
    const envelope = await seal(copy, k, s);
    if (current !== before || key !== k)
      throw Error("Workspace locked during save; nothing was changed");
    await write({ revision: expected + 1, envelope }, expected);
    if (key === k) {
      current = copy;
      revision = expected + 1;
      notify();
    }
  });
  chain = task.catch(() => {});
  return task;
}
export async function changePasscode(passcode: string) {
  await chain;
  if (!current || !key) throw Error("Unlock the workspace first");
  const before = current,
    s = crypto.getRandomValues(new Uint8Array(16)),
    k = await derive(passcode, s),
    expected = revision;
  const e = await seal(before, k, s);
  if (current !== before || !key) throw Error("Workspace locked");
  await write({ revision: expected + 1, envelope: e }, expected);
  salt = s;
  key = k;
  revision = expected + 1;
}
export async function exportBackup(passphrase: string) {
  if (!current) throw Error("Unlock first");
  const copy = structuredClone(current);
  copy.sessions = {};
  const s = crypto.getRandomValues(new Uint8Array(16)),
    k = await derive(passphrase, s);
  return seal(copy, k, s);
}
export async function previewBackup(file: string, passphrase: string) {
  if (file.length > 180 * 1024 * 1024) throw Error("Backup exceeds 180 MiB");
  const result = await open<Workspace>(JSON.parse(file), passphrase),
    value = validateWorkspace(result.value);
  if (Object.keys(value.sessions).length)
    throw Error("Backups must not contain authentication credentials");
  for (const a of value.attachments)
    if ((await checksum(unbase64(a.bytes))) !== a.sha256)
      throw Error("Attachment integrity check failed");
  return value;
}
export async function restoreBackup(value: Workspace) {
  if (!current)
    throw Error("Create or unlock a device workspace before restoring");
  if (current.ownerId !== value.ownerId || current.mode !== value.mode)
    throw Error(
      "This backup belongs to another workspace identity. Sign into its original account first.",
    );
  await changeWorkspace((w) => {
    const sessions = w.sessions;
    Object.assign(w, structuredClone(value));
    w.sessions = sessions;
  });
}
export const authStorage = {
  async getItem(name: string) {
    if (configured) {
      if (!current) throw Error("Device locked");
      return current.sessions[name] ?? null;
    }
    return localStorage.getItem(name);
  },
  async setItem(name: string, value: string) {
    if (configured)
      await changeWorkspace((w) => {
        w.sessions[name] = value;
      });
    else localStorage.setItem(name, value);
  },
  async removeItem(name: string) {
    if (configured) {
      if (current)
        await changeWorkspace((w) => {
          delete w.sessions[name];
        });
    }
    localStorage.removeItem(name);
  },
};
export function blankWorkspace(
  name: string,
  currency: string,
  timezone: string,
): Workspace {
  const id = crypto.randomUUID();
  return {
    version: 1,
    id,
    ownerId: null,
    mode: "LOCAL",
    profile: { id, name, displayCurrency: currency, timezone },
    tables: { accounts: [], transactions: [], categories: [] },
    attachments: [],
    commands: [],
    sessions: {},
    locale: "en",
    widgetAmounts: false,
    updatedAt: new Date().toISOString(),
  };
}
