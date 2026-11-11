/** Portable encrypted envelope. No user identifiers, keys or financial values outside ciphertext. */
export interface Envelope {
  format: "ledgersync-vault";
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: 600000;
  salt: string;
  iv: string;
  ciphertext: string;
}
const encode = new TextEncoder(),
  decode = new TextDecoder("utf-8", { fatal: true });
export function base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function unbase64(text: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0)
    throw Error("Invalid encrypted file");
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}
export async function derive(
  passcode: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  if (passcode.length < 8 || passcode.length > 1024)
    throw Error(
      "Use at least 8 characters; a long passphrase is safer than a numeric PIN.",
    );
  const material = await crypto.subtle.importKey(
    "raw",
    encode.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: buffer(salt), iterations: 600000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
const aad = encode.encode("ledgersync-vault:1:PBKDF2-SHA256:600000");
export function validateEnvelope(input: unknown): Envelope {
  if (!input || typeof input !== "object")
    throw Error("Invalid encrypted file");
  const e = input as Envelope;
  if (
    e.format !== "ledgersync-vault" ||
    e.version !== 1 ||
    e.kdf !== "PBKDF2-SHA256" ||
    e.iterations !== 600000 ||
    typeof e.salt !== "string" ||
    typeof e.iv !== "string" ||
    typeof e.ciphertext !== "string" ||
    e.ciphertext.length > 180 * 1024 * 1024 ||
    unbase64(e.salt).length !== 16 ||
    unbase64(e.iv).length !== 12 ||
    unbase64(e.ciphertext).length < 16
  )
    throw Error("Unsupported or corrupted encrypted file");
  return e;
}
export async function seal(
  value: unknown,
  key: CryptoKey,
  salt: Uint8Array,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encode.encode(JSON.stringify(value));
  if (data.length > 128 * 1024 * 1024)
    throw Error("Workspace exceeds the 128 MiB limit. Nothing was changed.");
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: buffer(iv), additionalData: aad },
    key,
    data,
  );
  return {
    format: "ledgersync-vault",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 600000,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  };
}
export async function open<T>(
  input: unknown,
  passcode: string,
): Promise<{ value: T; key: CryptoKey; salt: Uint8Array }> {
  const e = validateEnvelope(input),
    salt = unbase64(e.salt),
    key = await derive(passcode, salt);
  try {
    const bytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buffer(unbase64(e.iv)), additionalData: aad },
      key,
      buffer(unbase64(e.ciphertext)),
    );
    return { value: JSON.parse(decode.decode(bytes)) as T, key, salt };
  } catch {
    throw Error(
      "Incorrect passcode or damaged encrypted data. Nothing was changed.",
    );
  }
}
export async function checksum(bytes: Uint8Array) {
  return base64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer(bytes))),
  );
}
