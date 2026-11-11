import { create } from "zustand";
import { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
interface AuthState {
  token: string | null;
  user: Profile | null;
  ready: boolean;
  error: string | null;
  setAuth: (token: string | null, user: Profile | null) => void;
  setReady: (error?: string) => void;
  setProfile: (user: Profile) => void;
  logout: () => Promise<void>;
}
export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  ready: false,
  error: null,
  setAuth: (token, user) =>
    set((state) => ({
      token,
      user:
        user && state.user?.id === user.id ? { ...user, ...state.user } : user,
    })),
  setReady: (error) => set({ ready: true, error: error ?? null }),
  setProfile: (user) => set((state) => ({ user: { ...state.user, ...user } })),
  logout: async () => {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("ledgersync-signout"));
    try {
      await supabase().auth.signOut();
    } finally {
      set({ token: null, user: null });
    }
  },
}));

if (typeof window !== "undefined")
  window.addEventListener("ledgersync-lock", () =>
    useAuthStore.setState({
      token: null,
      user: null,
      ready: false,
      error: null,
    }),
  );

if (typeof window !== "undefined")
  window.addEventListener("ledgersync-auth-reset", () =>
    useAuthStore.setState({
      token: null,
      user: null,
      ready: true,
      error: null,
    }),
  );
