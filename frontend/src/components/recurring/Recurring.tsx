"use client";
import { useState } from "react";
import Link from "next/link";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import {
  Group,
  SplitTemplate,
  ExpenseSchedule,
  ExpenseDraft,
  SplitInput,
} from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Modal, ErrorMessage } from "@/components/ui/Controls";
import { SplitBuilder } from "@/components/split/SplitBuilder";
export function Recurring({ group }: { group: Group }) {
  const schedules = useResource<ExpenseSchedule[]>(
    `/recurring/schedules/groups/${group.id}`,
  );
  const templates = useResource<SplitTemplate[]>(
    `/templates/groups/${group.id}`,
  );
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState<ExpenseSchedule | null | undefined>();
  const action = useAction(({ id, status }: { id: string; status: string }) =>
    apiClient.put(`/recurring/schedules/${id}`, { status }),
  );
  return (
    <section className="panel space-y-3">
      <div className="flex justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-lg">Recurring expenses</h2>
        <button className="btn-secondary" onClick={() => setEditing(null)}>
          New schedule
        </button>
      </div>
      <p className="text-sm">
        Due expenses become reviewable drafts within an hour. Your balances
        change only when you post them.
      </p>
      {schedules.isLoading && <p>Loading schedules…</p>}
      {schedules.data?.length === 0 && (
        <p>No recurring expenses yet. Save a complete split template first.</p>
      )}
      {schedules.data?.map((s) => (
        <article
          key={s.id}
          className="border-t border-border-soft pt-3 space-y-2"
        >
          <h3 className="font-semibold">
            {templates.data?.find((t) => t.id === s.templateId)?.name ??
              "Archived template"}
          </h3>
          <p className="text-sm">
            {s.frequency.toLowerCase()} · from {s.startDate}
            {s.endDate ? ` through ${s.endDate}` : ""} · {s.timezone} ·{" "}
            {s.status.toLowerCase()}
          </p>
          {s.status !== "ARCHIVED" &&
            (s.creatorId === user?.id || group.ownerId === user?.id) && (
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => setEditing(s)}>
                  Edit end date
                </button>
                <button
                  className="btn-secondary"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      id: s.id,
                      status: s.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                    })
                  }
                >
                  {s.status === "ACTIVE" ? "Pause" : "Resume"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({ id: s.id, status: "ARCHIVED" })
                  }
                >
                  Archive
                </button>
              </div>
            )}
        </article>
      ))}
      <ErrorMessage
        error={schedules.error || templates.error || action.error}
      />
      {editing !== undefined && (
        <ScheduleForm
          schedule={editing}
          templates={templates.data ?? []}
          timezone={user?.timezone ?? "UTC"}
          onClose={() => setEditing(undefined)}
        />
      )}
    </section>
  );
}
function ScheduleForm({
  schedule,
  templates,
  timezone,
  onClose,
}: {
  schedule: ExpenseSchedule | null;
  templates: SplitTemplate[];
  timezone: string;
  onClose: () => void;
}) {
  const [tz, setTz] = useState(schedule?.timezone ?? timezone);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const action = useAction(
    (body: unknown) =>
      schedule
        ? apiClient.put(`/recurring/schedules/${schedule.id}`, body)
        : apiClient.post("/recurring/schedules", body),
    onClose,
  );
  return (
    <Modal
      title={schedule ? "Edit recurring expense" : "New recurring expense"}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const endDate = String(f.get("endDate") ?? "") || null;
          action.mutate(
            schedule
              ? { endDate }
              : {
                  templateId: f.get("templateId"),
                  frequency: f.get("frequency"),
                  startDate: f.get("startDate"),
                  endDate,
                  timezone: tz,
                },
          );
        }}
      >
        {!schedule && (
          <>
            <label className="label">
              Template
              <select className="field" name="templateId" required>
                <option value="">Choose a complete template</option>
                {templates
                  .filter(
                    (t) => !t.needsCorrection && t.payload.totalAmount !== null,
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="label">
              Repeats
              <select className="field" name="frequency">
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </label>
            <label className="label">
              Start date
              <input
                className="field"
                name="startDate"
                type="date"
                defaultValue={today}
                required
              />
            </label>
            <label className="label">
              Timezone
              <input
                className="field"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                required
                placeholder="Asia/Kolkata"
              />
            </label>
          </>
        )}
        <label className="label">
          End date (optional)
          <input
            className="field"
            type="date"
            name="endDate"
            defaultValue={schedule?.endDate ?? ""}
          />
        </label>
        <p className="text-xs">
          Month-end dates use the last available day. Paused dates are skipped
          when resumed. To change cadence or timezone, archive and create a new
          schedule.
        </p>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          Save schedule
        </button>
      </form>
    </Modal>
  );
}
export function DueDrafts({ groupId }: { groupId?: string }) {
  const data = useResource<ExpenseDraft[]>(
    `/recurring/drafts${groupId ? `?groupId=${groupId}` : ""}`,
  );
  const [review, setReview] = useState<ExpenseDraft>();
  const skip = useAction((id: string) =>
    apiClient.post(`/recurring/drafts/${id}/skip`, {}),
  );
  return (
    <section className="panel space-y-3">
      <div className="flex justify-between gap-2">
        <h2 className="font-semibold text-lg">Due expense drafts</h2>
        <button
          className="btn-secondary"
          onClick={() => data.refetch()}
          disabled={data.isFetching}
        >
          Refresh
        </button>
      </div>
      {data.isLoading && <p>Loading drafts…</p>}
      {data.data?.length === 0 && <p>No expenses awaiting review.</p>}
      {data.data?.map((d) => (
        <article
          key={d.id}
          className="border-t border-border-soft pt-3 flex flex-wrap gap-3 items-center"
        >
          <div className="flex-1">
            <h3 className="font-semibold">{d.payload.description}</h3>
            <p className="text-sm">
              Due {d.dueDate} · {d.timezone} · {d.scheduleStatus.toLowerCase()}{" "}
              schedule
            </p>
            {!groupId && (
              <Link
                href={`/groups/${d.groupId}`}
                className="text-brand-primary text-sm"
              >
                Open group
              </Link>
            )}
            {d.needsCorrection && (
              <p className="text-negative text-sm">
                Review required: check saved members and amounts.
              </p>
            )}
          </div>
          {d.canManage && (
            <>
              <button className="btn" onClick={() => setReview(d)}>
                Review
              </button>
              <button
                className="btn-secondary"
                disabled={skip.isPending}
                onClick={() => skip.mutate(d.id)}
              >
                Skip
              </button>
            </>
          )}
        </article>
      ))}
      <ErrorMessage error={data.error || skip.error} />
      {review && (
        <DraftEditor draft={review} onClose={() => setReview(undefined)} />
      )}
    </section>
  );
}
function DraftEditor({
  draft,
  onClose,
}: {
  draft: ExpenseDraft;
  onClose: () => void;
}) {
  const group = useResource<Group>(`/groups/${draft.groupId}`);
  const saveDraft = async (body: SplitInput) => {
    const { description, totalAmount, splitType, participants, payers } = body;
    return apiClient.put(`/recurring/drafts/${draft.id}`, {
      description,
      totalAmount,
      splitType,
      participants,
      payers: payers.map(({ userId, amountPaid }) => ({ userId, amountPaid })),
    });
  };
  if (!group.data)
    return (
      <Modal title="Review draft" onClose={onClose}>
        <p>Loading group…</p>
        <ErrorMessage error={group.error} />
      </Modal>
    );
  return (
    <SplitBuilder
      isOpen
      groupId={group.data.id}
      groupMembers={group.data.members}
      initial={draft.payload}
      title={`Review: ${draft.dueDate}`}
      submitLabel="Post expense"
      onSaveDraft={saveDraft}
      onSave={(body) =>
        apiClient.post(`/recurring/drafts/${draft.id}/post`, body)
      }
      onClose={onClose}
    />
  );
}
