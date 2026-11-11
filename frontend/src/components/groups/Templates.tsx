"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { Group, SplitTemplate, SplitInput } from "@/lib/types";
import { SplitBuilder } from "@/components/split/SplitBuilder";
import { ErrorMessage } from "@/components/ui/Controls";
import { useAuthStore } from "@/store/auth";
export function Templates({ group }: { group: Group }) {
  const data = useResource<SplitTemplate[]>(`/templates/groups/${group.id}`);
  const defaults = useResource<{ id: string; name: string } | null>(
    `/groups/${group.id}/default-split`,
  );
  const setDefault = useAction((templateId: string | null) =>
    apiClient.put(`/groups/${group.id}/default-split`, { templateId }),
  );
  const user = useAuthStore((s) => s.user);
  const [edit, setEdit] = useState<SplitTemplate | null | undefined>();
  const [use, setUse] = useState<SplitTemplate>();
  const archive = useAction((id: string) =>
    apiClient.delete(`/templates/groups/${group.id}/${id}`),
  );
  async function save(body: SplitInput, name: string) {
    const { description, totalAmount, splitType, participants, payers } = body;
    const payload = {
      description,
      totalAmount,
      splitType,
      participants,
      payers: payers.map(({ userId, amountPaid }) => ({ userId, amountPaid })),
    };
    if (edit)
      return apiClient.put(`/templates/groups/${group.id}/${edit.id}`, {
        name,
        payload,
      });
    return apiClient.post(`/templates/groups/${group.id}`, { name, payload });
  }
  return (
    <section className="panel space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="font-semibold text-lg">Split templates</h2>
        <button className="btn-secondary" onClick={() => setEdit(null)}>
          New template
        </button>
      </div>
      <p className="text-sm text-text-secondary">
        Automatic allocation:{" "}
        {defaults.data?.name ?? "Equal split (no default)"}. New bills use this
        preference and remain editable.
      </p>
      {defaults.data && group.ownerId === user?.id && (
        <button
          className="btn-secondary"
          disabled={setDefault.isPending}
          onClick={() => setDefault.mutate(null)}
        >
          Clear default
        </button>
      )}
      {data.isLoading && <p>Loading templates…</p>}
      {data.data?.length === 0 && (
        <p>
          Save your regular splits to reuse their participants and allocation.
        </p>
      )}
      {data.data?.map((t) => (
        <article
          className="border-t border-border-soft pt-3 flex flex-wrap items-center gap-2"
          key={t.id}
        >
          <div className="flex-1">
            <h3 className="font-semibold">{t.name}</h3>
            <p className="text-sm">
              {t.payload.description} · {t.payload.splitType}
            </p>
            {t.needsCorrection && (
              <p className="text-negative text-sm">
                A saved member is unavailable. Correct this template before use.
              </p>
            )}
          </div>
          {group.ownerId === user?.id && t.id !== defaults.data?.id && (
            <button
              className="btn-secondary"
              disabled={t.needsCorrection || setDefault.isPending}
              onClick={() => setDefault.mutate(t.id)}
            >
              Make default
            </button>
          )}
          {t.id === defaults.data?.id && (
            <span className="text-xs text-brand-primary">Group default</span>
          )}
          <button
            className="btn-secondary"
            disabled={t.needsCorrection}
            onClick={() => setUse(t)}
          >
            Use template
          </button>
          {(t.creatorId === user?.id || group.ownerId === user?.id) && (
            <>
              <button className="btn-secondary" onClick={() => setEdit(t)}>
                <T text="Edit" />
              </button>
              <button
                className="btn-secondary"
                disabled={archive.isPending}
                onClick={() => archive.mutate(t.id)}
              >
                <T text="Archive" />
              </button>
            </>
          )}
        </article>
      ))}
      <ErrorMessage
        error={
          data.error || archive.error || defaults.error || setDefault.error
        }
      />
      {edit !== undefined && (
        <SplitBuilder
          isOpen
          groupId={group.id}
          groupMembers={group.members}
          initial={edit?.payload}
          templateMode
          initialName={edit?.name}
          onSave={save}
          onClose={() => setEdit(undefined)}
        />
      )}
      {use && (
        <SplitBuilder
          isOpen
          groupId={group.id}
          groupMembers={group.members}
          initial={use.payload}
          title={`Use ${use.name}`}
          onClose={() => setUse(undefined)}
        />
      )}
    </section>
  );
}
