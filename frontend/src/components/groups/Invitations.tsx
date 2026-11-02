"use client";
import { useState } from "react";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { ErrorMessage } from "@/components/ui/Controls";
interface InvitationsData {
  invitation: { id: string; expiresAt: string } | null;
  requests: { id: string; name: string; status: string }[];
}
export function Invitations({ groupId }: { groupId: string }) {
  const data = useResource<InvitationsData>(`/invitations/groups/${groupId}`);
  const [link, setLink] = useState(""),
    [copied, setCopied] = useState(false);
  const create = useAction(async () => {
    const result = await apiClient.post<{ token: string }>(
      `/invitations/groups/${groupId}`,
      {},
    );
    setLink(`${location.origin}/join#${result.token}`);
    setCopied(false);
  });
  const revoke = useAction(async () => {
    await apiClient.delete(`/invitations/groups/${groupId}`);
    setLink("");
  });
  const decide = useAction(
    ({ id, decision }: { id: string; decision: string }) =>
      apiClient.post(`/invitations/groups/${groupId}/requests/${id}`, {
        decision,
      }),
  );
  return (
    <section className="panel space-y-3">
      <h2 className="font-semibold text-lg">Invite members</h2>
      <p className="text-sm">
        Links expire after seven days. New members need your approval.
        Regenerating revokes the previous link.
      </p>
      {data.isLoading && <p>Loading invitations…</p>}
      {data.data?.invitation && (
        <p className="text-sm">
          Current link expires{" "}
          {new Date(data.data.invitation.expiresAt).toLocaleDateString()}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          disabled={create.isPending}
          onClick={() => create.mutate(undefined)}
        >
          {data.data?.invitation ? "Regenerate link" : "Create invite link"}
        </button>
        {data.data?.invitation && (
          <button
            className="btn-secondary"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(undefined)}
          >
            Revoke link
          </button>
        )}
      </div>
      {link && (
        <>
          <input
            aria-label="Invitation link"
            className="field"
            value={link}
            readOnly
          />
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <p className="text-xs">
            Save this link now; it cannot be retrieved later.
          </p>
        </>
      )}
      <h3 className="font-semibold">Membership requests</h3>
      {data.data?.requests.length === 0 && <p>No requests yet.</p>}
      {data.data?.requests.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center gap-2 border-t border-border-soft pt-2"
        >
          <span className="flex-1">
            {r.name} · {r.status.toLowerCase()}
          </span>
          {r.status === "PENDING" && (
            <>
              <button
                className="btn-secondary"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, decision: "APPROVE" })}
              >
                Approve
              </button>
              <button
                className="btn-secondary"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, decision: "REJECT" })}
              >
                Reject
              </button>
            </>
          )}
        </div>
      ))}
      <ErrorMessage
        error={data.error || create.error || revoke.error || decide.error}
      />
    </section>
  );
}
