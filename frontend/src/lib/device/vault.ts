import Decimal from "decimal.js";
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
  generation: string;
  revision: number;
  envelope: Envelope;
}
let generation: string | null = null;
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
      r.onsuccess = () =>
        resolve(
          r.result
            ? {
                ...r.result,
                generation: r.result.generation ?? r.result.envelope.salt,
              }
            : undefined,
        );
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
async function write(
  value: Stored,
  expected: number,
  expectedGeneration: string | null,
) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite"),
        store = tx.objectStore("vault"),
        r = store.get("workspace");
      r.onsuccess = () => {
        if (
          (r.result?.revision ?? 0) !== expected ||
          (r.result
            ? (r.result.generation ?? r.result.envelope.salt)
            : null) !== expectedGeneration
        ) {
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
  const stored = await read();
  configured = !!stored;
  generation = stored?.generation ?? null;
  notify();
  return configured;
}
function safeJson(value: unknown, depth = 0): void {
  if (depth > 64) throw Error("Backup nesting is too deep");
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Backup contains a non-finite number");
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw Error("Unsafe backup field");
      safeJson(v, depth + 1);
    }
  }
}
export function validateWorkspace(value: unknown): Workspace {
  safeJson(value);
  if (!value || typeof value !== "object") throw Error("Invalid workspace");
  const w = value as Workspace;
  if (
    w.version !== 1 ||
    typeof w.widgetAmounts !== "boolean" ||
    !["en", "hi", "es", "ar"].includes(w.locale) ||
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
  const moneyFields = new Set([
    "balance",
    "balance_delta",
    "analytics_amount",
    "amount",
    "total_amount",
    "target_amount",
    "principal",
    "interest",
    "value",
    "original_amount",
    "base_amount",
    "exchange_rate",
    "amount_paid",
    "amount_owed",
    "share_value",
    "expected_income",
    "expected_expense",
    "credit_limit",
    "paid_principal",
  ]);
  for (const [table, rows] of Object.entries(w.tables))
    for (const row of rows) {
      for (const [field, value] of Object.entries(row)) {
        if (!moneyFields.has(field) || value === null) continue;
        if (
          !["string", "number"].includes(typeof value) ||
          (typeof value === "string" &&
            (value.length > 64 ||
              !/^[-]?\d+(?:\.\d+)?(?:e[-+]?\d{1,3})?$/i.test(value)))
        )
          throw Error("Invalid financial value in backup");
        const n = new Decimal(value as string | number);
        if (
          !n.isFinite() ||
          n.abs().gte(1e12) ||
          (!["balance", "balance_delta"].includes(field) && n.lt(0))
        )
          throw Error("Invalid financial value in backup");
      }
      for (const field of [
        "start_date",
        "end_date",
        "value_date",
        "period_start",
        "first_due_date",
        "target_date",
      ]) {
        if (row[field] === null || row[field] === undefined) continue;
        const value = String(row[field]);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value + "T12:00:00Z")) ||
          new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value
        )
          throw Error("Invalid calendar date in backup");
      }
      if (
        ["personal_bills", "expense_schedules"].includes(table) &&
        row.next_index !== undefined &&
        (!Number.isInteger(Number(row.next_index)) ||
          Number(row.next_index) < 0 ||
          Number(row.next_index) > 3700000)
      )
        throw Error("Invalid recurrence index in backup");
    }
  if (new Set(w.attachments.map((a) => a.id)).size !== w.attachments.length)
    throw Error("Duplicate receipt files in backup");
  for (const a of w.attachments)
    if (
      typeof a.id !== "string" ||
      typeof a.name !== "string" ||
      a.name.length < 1 ||
      a.name.length > 160 ||
      /[\x00-\x1f\x7f/\\]/.test(a.name) ||
      unbase64(a.bytes).length < 1 ||
      unbase64(a.sha256).length !== 32
    )
      throw Error("Invalid receipt file in backup");
  for (const rows of Object.values(w.tables)) {
    const ids = rows.flatMap((r) => (typeof r.id === "string" ? [r.id] : []));
    if (new Set(ids).size !== ids.length)
      throw Error("Duplicate records in backup");
  }
  for (const a of w.tables.accounts ?? [])
    if (
      typeof a.id !== "string" ||
      !Number.isFinite(Number(a.balance)) ||
      Math.abs(Number(a.balance)) >= 1e12
    )
      throw Error("Invalid account balance in backup");
  for (const t of w.tables.transactions ?? [])
    if (
      typeof t.id !== "string" ||
      !["INCOME", "EXPENSE", "TRANSFER"].includes(String(t.type)) ||
      ![t.amount, t.balance_delta, t.analytics_amount].every(
        (n) => n !== null && n !== undefined && Number.isFinite(Number(n)),
      ) ||
      !Number.isFinite(Date.parse(String(t.date_time)))
    )
      throw Error("Invalid transaction in backup");
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
    generation = stored.generation;
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
  if (!configured) return;
  current = null;
  key = null;
  salt = null;
  notify();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ledgersync-lock"));
    localStorage.setItem("ledgersync-lock-event", String(Date.now()));
  }
}
export async function createVault(passcode: string, data: Workspace, assertCurrent?: () => void) {
  if (await read())
    throw Error("A device workspace already exists. Unlock it first.");
  const s = crypto.getRandomValues(new Uint8Array(16)),
    k = await derive(passcode, s);
  const w = validateWorkspace(structuredClone(data));
  const gen = crypto.randomUUID(), envelope = await seal(w, k, s);
  assertCurrent?.();
  await write(
    { generation: gen, revision: 1, envelope },
    0,
    null,
  );
  generation = gen;
  current = w;
  key = k;
  salt = s;
  revision = 1;
  configured = true;
  notify();
}
export function changeWorkspace(
  mutate: (copy: Workspace) => void,
  expectedId = current?.id,
): Promise<void> {
  const expectedGeneration = generation;
  const task = chain.then(async () => {
    if (
      !current ||
      !key ||
      !salt ||
      current.id !== expectedId ||
      generation !== expectedGeneration
    )
      throw Error("Unlock the expected device workspace before saving");
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
    await write(
      { generation: expectedGeneration!, revision: expected + 1, envelope },
      expected,
      expectedGeneration,
    );
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
  await write(
    { generation: generation!, revision: expected + 1, envelope: e },
    expected,
    generation,
  );
  salt = s;
  key = k;
  revision = expected + 1;
}
export async function exportBackup(passphrase: string) {
  if (!current) throw Error("Unlock first");
  const copy = structuredClone(current);
  copy.sessions = {};
  copy.widgetAmounts = false;
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
    w.widgetAmounts = false;
  });
  localStorage.setItem("ledgersync-locale", value.locale);
  window.dispatchEvent(new Event("ledgersync-language"));
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
    if (configured && current?.mode === "CLOUD" && name === authKeyPrefix()) {
      const session = JSON.parse(value);
      if (session?.user?.id && session.user.id !== current.ownerId)
        throw Error(
          "This device workspace belongs to another account. Switch workspaces before signing in.",
        );
    }
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

/** User-confirmed local erasure. This never deletes cloud records. */
export async function eraseDevice(confirmation: string) {
  if (confirmation !== "ERASE DEVICE")
    throw Error("Type ERASE DEVICE to confirm");
  const expectedGeneration = generation ?? (await read())?.generation;
  await chain;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite"),
        store = tx.objectStore("vault"),
        r = store.get("workspace");
      r.onsuccess = () => {
        const actual = r.result
          ? (r.result.generation ?? r.result.envelope.salt)
          : undefined;
        if (actual !== expectedGeneration) {
          tx.abort();
          return;
        }
        store.delete("workspace");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(Error("Workspace changed; local erasure was cancelled"));
    });
  } finally {
    db.close();
  }
  current = null;
  key = null;
  salt = null;
  revision = 0;
  generation = null;
  configured = false;
  for (const name of Object.keys(localStorage))
    if (name.startsWith(authKeyPrefix())) localStorage.removeItem(name);
  localStorage.removeItem("ledgersync-unlock-delay");
  localStorage.removeItem("ledgersync-vault-configured");
  notify();
  window.dispatchEvent(new Event("ledgersync-auth-reset"));
  window.dispatchEvent(new Event("ledgersync-vault-removed"));
}

export function authKeyPrefix() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return "sb-ledgersync-auth-token";
  return `sb-${new URL(value).hostname.split(".")[0]}-auth-token`;
}
