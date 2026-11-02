import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";
export type DatabaseClient = SupabaseClient<Database>;
import { HttpError } from "./errors/httpError";

// Construct lazily so imports and unit tests do not require live credentials.
export function getSupabaseClient(token?: string): DatabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError(503, "Supabase is not configured");
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
  });
}
export function camelCase<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelCase(v)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        camelCase(v),
      ]),
    ) as T;
  return value as T;
}
export function snakeCase(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      v,
    ]),
  );
}
export function dbResult<T>(result: {
  data: T;
  error: { code?: string; message: string } | null;
}): T {
  if (result.error) {
    const { code, message } = result.error;
    const status =
      message.startsWith("Too many invitation requests") ? 429 : code === "42501"
        ? 403
        : ["P0002", "PGRST116"].includes(code ?? "")
          ? 404
          : ["23505", "23503"].includes(code ?? "")
            ? 409
            : code === "P0001" ||
                code?.startsWith("22") ||
                code?.startsWith("23")
              ? 400
              : 500;
    throw new HttpError(
      status,
      status === 500 ? "Database operation failed" : message,
    );
  }
  return result.data;
}
export async function rpc<T = unknown>(
  client: SupabaseClient,
  name: keyof Database["public"]["Functions"],
  args: Record<string, unknown> = {},
) {
  return camelCase<T>(dbResult(await client.rpc(name, args)));
}
