import { authStorage } from "./device/vault";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function supabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key)
      throw new Error(
        "Supabase is not configured. Set the frontend environment variables.",
      );
    client = createClient(url, key, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

if (typeof window !== "undefined")
  window.addEventListener("ledgersync-lock", () => {
    void client?.auth.stopAutoRefresh();
    client = undefined;
  });

if (typeof window !== "undefined")
  window.addEventListener("ledgersync-auth-reset", () => {
    void client?.auth.stopAutoRefresh();
    client = undefined;
  });
