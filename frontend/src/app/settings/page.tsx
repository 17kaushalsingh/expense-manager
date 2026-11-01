"use client";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuthStore } from "@/store/auth";
import { useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { Profile } from "@/lib/types";
import { ErrorMessage } from "@/components/ui/Controls";
export default function Settings() {
  const { user, setProfile, logout } = useAuthStore();
  const [saved, setSaved] = useState(false),
    [logoutError, setLogoutError] = useState("");
  const action = useAction(
    async (body: Record<string, unknown>) => {
      setSaved(false);
      const profile = await apiClient.put<Profile>("/users/profile", body);
      setProfile(profile);
    },
    () => setSaved(true),
  );
  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold">Settings</h1>
      <form
        key={`${user?.id}-${user?.displayCurrency}-${user?.timezone}`}
        className="panel max-w-xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        <label className="label">
          Name
          <input
            className="field"
            name="name"
            defaultValue={user?.name}
            required
          />
        </label>
        <p className="text-text-secondary">{user?.email}</p>
        <label className="label">
          Currency
          <select
            className="field"
            name="displayCurrency"
            defaultValue={user?.displayCurrency || "USD"}
          >
            {["USD", "INR", "EUR", "GBP", "JPY", "CAD", "AUD", "SGD"].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <p className="text-xs text-text-secondary">
          Currency is fixed once you record financial activity or join a group.
        </p>
        <label className="label">
          Timezone
          <select
            className="field"
            name="timezone"
            defaultValue={user?.timezone || "UTC"}
          >
            {["UTC", ...Intl.supportedValuesOf("timeZone")].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <ErrorMessage error={action.error} />
        {saved && (
          <p role="status" className="text-positive">
            Preferences saved.
          </p>
        )}
        <button className="btn" disabled={action.isPending}>
          Save preferences
        </button>
      </form>
      <ErrorMessage error={logoutError} />
      <button
        className="btn-secondary"
        onClick={() =>
          void logout().catch((error) => setLogoutError(error.message))
        }
      >
        Sign out
      </button>
    </DashboardLayout>
  );
}
