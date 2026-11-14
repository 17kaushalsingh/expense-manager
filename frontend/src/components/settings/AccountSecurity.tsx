"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { T } from "@/components/i18n/Language";
import { ErrorMessage, Modal } from "@/components/ui/Controls";
import { useResource } from "@/hooks/useResource";
import { useFormat } from "@/lib/format";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/store/auth";
import { translate } from "@/lib/i18n/catalogs";
interface Device {
  id: string;
  name: string | null;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}
interface Activity {
  id: string;
  sessionId: string;
  action: string;
  changes: { name?: string; scope?: string };
  createdAt: string;
}
type Intent = { scope: "ONE" | "OTHERS" | "ALL"; device?: Device };
function platform(agent: string) {
  if (/android/i.test(agent)) return "Android";
  if (/iphone|ipad|ipod/i.test(agent)) return "iOS";
  if (/windows/i.test(agent)) return "Windows";
  if (/macintosh|mac os/i.test(agent)) return "Mac";
  return "Browser or application";
}
export function AccountSecurity() {
  const user = useAuthStore((s) => s.user),
    logout = useAuthStore((s) => s.logout);
  const queries = useQueryClient(),
    { date, locale } = useFormat();
  const [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [intent, setIntent] = useState<Intent>(),
    [editing, setEditing] = useState<Device>();
  const devices = useResource<Device[]>("/users/security/sessions");
  const activity = useResource<Activity[]>(
    `/users/security/activity?limit=30&offset=${offset}`,
  );
  async function refresh() {
    await Promise.all([
      queries.invalidateQueries({
        queryKey: [user?.id, "/users/security/sessions"],
      }),
      queries.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === user?.id &&
          String(q.queryKey[1]).startsWith("/users/security/activity"),
      }),
    ]);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">
          <T text="Devices & security activity" />
        </h2>
        <button
          className="btn-secondary"
          disabled={busy || devices.isFetching}
          onClick={() => void run(refresh)}
        >
          <T text="Refresh" />
        </button>
      </div>
      <p className="text-sm text-text-secondary">
        <T text="Review signed-in devices. Revocation blocks new database requests and token refreshes. Previously cached receipts and offline files cannot be remotely erased." />
      </p>
      <ErrorMessage error={error || devices.error} />
      {devices.isPending ? (
        <p role="status">
          <T text="Loading devices…" />
        </p>
      ) : !devices.data?.length ? (
        <p>
          <T text="No active devices to show." />
        </p>
      ) : (
        <ul className="space-y-3">
          {devices.data.map((d) => (
            <li
              key={d.id}
              className="rounded-xl border border-border-soft p-4 space-y-2 min-w-0"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="break-words">
                  {d.name || <T text={platform(d.userAgent)} />}
                </strong>
                {d.isCurrent && (
                  <span className="text-xs text-positive">
                    <T text="This device" />
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary">
                <T text="Signed in" />: {date(d.createdAt)}
                <br />
                <T text="Last used" />: {date(d.lastSeenAt)}
              </p>
              <details className="text-xs">
                <summary>
                  <T text="Technical details" />
                </summary>
                <p className="break-all mt-2">{d.userAgent}</p>
                <p>
                  <T text="Device ID" />: {d.id.slice(0, 8)}
                </p>
              </details>
              <div className="flex flex-wrap gap-3">
                <button
                  className="subtle-link"
                  disabled={busy}
                  onClick={() => {
                    setEditing(d);
                    setError(undefined);
                  }}
                >
                  <T text="Rename device" />
                </button>
                <button
                  className="subtle-link text-negative"
                  disabled={busy}
                  onClick={() => {
                    setIntent({ scope: "ONE", device: d });
                    setError(undefined);
                  }}
                >
                  <T
                    text={
                      d.isCurrent ? "Sign out this device" : "Revoke access"
                    }
                  />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-secondary"
          disabled={busy || !devices.data?.some((d) => !d.isCurrent)}
          onClick={() => {
            setIntent({ scope: "OTHERS" });
            setError(undefined);
          }}
        >
          <T text="Sign out other devices" />
        </button>
        <button
          className="btn-secondary text-negative"
          disabled={busy || !devices.data?.length}
          onClick={() => {
            setIntent({ scope: "ALL" });
            setError(undefined);
          }}
        >
          <T text="Sign out all devices" />
        </button>
      </div>
      <h3 className="font-semibold">
        <T text="Security activity" />
      </h3>
      <p className="text-xs text-text-secondary">
        <T text="Records first app use, device naming and revocation. Earlier sign-ins and provider-side sign-outs are not backfilled. IP addresses and credentials are never shown." />
      </p>
      <ErrorMessage error={activity.error} />
      {activity.isPending ? (
        <p role="status">
          <T text="Loading activity…" />
        </p>
      ) : !activity.data?.length ? (
        <p className="text-sm">
          <T text="No activity on this page." />
        </p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {activity.data.map((a) => (
            <li key={a.id} className="py-3 text-sm">
              <T
                text={
                  a.action === "FIRST_USE"
                    ? "Device first used with LedgerSync"
                    : a.action === "RENAME"
                      ? "Device renamed"
                      : "Device access revoked"
                }
              />
              {a.action === "RENAME" && a.changes?.name
                ? ` · ${a.changes.name}`
                : ""}
              <span className="block text-xs text-text-secondary">
                {date(a.createdAt)}
              </span>
              <span className="text-xs text-text-secondary">
                <T text="Device ID" />: {a.sessionId.slice(0, 8)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-3">
        <button
          className="btn-secondary"
          disabled={!offset || activity.isFetching}
          onClick={() => setOffset((n) => Math.max(0, n - 30))}
        >
          <T text="Previous" />
        </button>
        <button
          className="btn-secondary"
          disabled={
            offset >= 9990 ||
            activity.data?.length !== 30 ||
            activity.isFetching
          }
          onClick={() => setOffset((n) => n + 30)}
        >
          <T text="Next" />
        </button>
      </div>
      {editing && (
        <Modal
          title={translate("Rename device", locale)}
          busy={busy}
          onClose={() => setEditing(undefined)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name"));
              void run(async () => {
                await apiClient.put(`/users/security/sessions/${editing.id}`, {
                  name,
                });
                setEditing(undefined);
                await refresh();
              });
            }}
          >
            <label className="label">
              <T text="Device name" />
              <input
                className="field"
                name="name"
                autoComplete="off"
                maxLength={80}
                required
                defaultValue={
                  editing.name || translate(platform(editing.userAgent), locale)
                }
                data-autofocus
              />
            </label>
            <ErrorMessage error={error} />
            <button className="btn" disabled={busy}>
              <T text="Save" />
            </button>
          </form>
        </Modal>
      )}
      {intent && (
        <Modal
          title={translate("Confirm sign out", locale)}
          busy={busy}
          onClose={() => setIntent(undefined)}
        >
          <p>
            <T
              text={
                intent.scope === "ALL"
                  ? "Sign out every device, including this one?"
                  : intent.scope === "OTHERS"
                    ? "Sign out all other devices and keep this device signed in?"
                    : intent.device?.isCurrent
                      ? "Sign out this device now?"
                      : "Revoke this device’s cloud access?"
              }
            />
          </p>
          {intent.device?.name && (
            <p className="break-words">{intent.device.name}</p>
          )}
          <p className="text-sm text-text-secondary">
            <T text="Previously authorized receipt links or downloads can remain available from caches after sign out. New file access is checked again. Offline records remain encrypted on their devices." />
          </p>
          <ErrorMessage error={error} />
          <button
            className="btn mt-4"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await apiClient.post<{
                  currentRevoked: boolean;
                }>("/users/security/revoke", {
                  scope: intent.scope,
                  ...(intent.device ? { id: intent.device.id } : {}),
                });
                setIntent(undefined);
                if (result.currentRevoked) await logout();
                else {
                  setOffset(0);
                  await refresh();
                }
              })
            }
          >
            <T text="Confirm sign out" />
          </button>
        </Modal>
      )}
    </section>
  );
}
