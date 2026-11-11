"use client";
import { workspace } from "@/lib/device/vault";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";
import { apiClient } from "@/lib/api/client";
import { Profile } from "@/lib/types";
export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queries] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  useEffect(() => {
    let disposed = false,
      lastUser: string | undefined;
    let generation = 0;
    const onLock = () => {
      generation++;
      queries.clear();
    };
    window.addEventListener("ledgersync-lock", onLock);
    function apply(session: Session | null) {
      if (disposed) return;
      const run = ++generation;
      const device = workspace();
      if (
        session &&
        device?.mode === "CLOUD" &&
        device.ownerId !== session.user.id
      ) {
        queries.clear();
        useAuthStore.getState().setAuth(null, null);
        useAuthStore
          .getState()
          .setReady(
            "Unlock a device workspace for this account before continuing.",
          );
        return;
      }
      if (session?.user.id !== lastUser) {
        queries.clear();
        lastUser = session?.user.id;
      }
      const store = useAuthStore.getState();
      store.setAuth(
        session?.access_token ?? null,
        session
          ? {
              id: session.user.id,
              email: session.user.email,
              name:
                session.user.user_metadata.name ||
                session.user.user_metadata.full_name ||
                "User",
            }
          : null,
      );
      if (!session) {
        store.setReady();
        return;
      }
      // Keep the auth callback synchronous; fetch profile outside the SDK auth lock.
      setTimeout(() => {
        void apiClient
          .get<Profile>("/users/profile", session.access_token)
          .then((profile) => {
            if (!disposed && run === generation) {
              useAuthStore.getState().setProfile(profile);
              useAuthStore.getState().setReady();
            }
          })
          .catch((error) => {
            if (!disposed && run === generation)
              useAuthStore.getState().setReady(error.message);
          });
      }, 0);
    }
    try {
      const client = supabase();
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => apply(session));
      void client.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          apply(data.session);
        })
        .catch((error) => useAuthStore.getState().setReady(error.message));
      return () => {
        disposed = true;
        subscription.unsubscribe();
        queries.clear();
        window.removeEventListener("ledgersync-lock", onLock);
      };
    } catch (error) {
      useAuthStore
        .getState()
        .setReady(
          error instanceof Error ? error.message : "Authentication unavailable",
        );
    }
    return () => {
      disposed = true;
    };
  }, [queries]);
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}
