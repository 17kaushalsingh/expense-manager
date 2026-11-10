"use client";
import { useState } from "react";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/store/auth";
import { useFormat } from "@/lib/format";
import { Modal, ErrorMessage, Confirm } from "@/components/ui/Controls";
interface Activity {
  id: string;
  actorName: string;
  summary: string;
  action: string;
  createdAt: string;
}
interface Comment {
  id: string;
  userId: string;
  authorName: string;
  body: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export function GroupActivity({ groupId }: { groupId: string }) {
  const [offset, setOffset] = useState(0);
  const data = useResource<{ items: Activity[]; total: number }>(
    `/collaboration/groups/${groupId}/activity?offset=${offset}`,
  );
  const { date } = useFormat();
  return (
    <section className="panel space-y-3">
      <h2 className="font-semibold text-lg">Group activity</h2>
      <ErrorMessage error={data.error} />
      {data.isLoading && <p>Loading activity…</p>}
      {data.data?.items.length === 0 && (
        <p>
          New expenses, settlements, memberships, and comments will appear here.
        </p>
      )}
      {data.data?.items.map((a) => (
        <article className="border-t border-border-soft pt-2" key={a.id}>
          <p>
            <strong>{a.actorName}</strong> · {a.action.toLowerCase()}
          </p>
          <p>{a.summary}</p>
          <p className="text-xs text-text-secondary">{date(a.createdAt)}</p>
        </article>
      ))}
      <div className="flex justify-between gap-2">
        <button
          className="btn-secondary"
          disabled={offset === 0 || data.isLoading}
          onClick={() => setOffset(Math.max(0, offset - 25))}
        >
          Newer
        </button>
        <button
          className="btn-secondary"
          disabled={
            !data.data || offset + 25 >= data.data.total || data.isLoading
          }
          onClick={() => setOffset(offset + 25)}
        >
          Older
        </button>
      </div>
    </section>
  );
}
export function ExpenseComments({
  splitId,
  description,
  owner,
  onClose,
}: {
  splitId: string;
  description: string;
  owner: boolean;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const { date } = useFormat();
  const data = useResource<Comment[]>(
    `/collaboration/splits/${splitId}/comments`,
  );
  const [body, setBody] = useState(""),
    [edit, setEdit] = useState<Comment>(),
    [remove, setRemove] = useState<Comment>();
  const save = useAction(
    () =>
      edit
        ? apiClient.put(`/collaboration/comments/${edit.id}`, { body })
        : apiClient.post(`/collaboration/splits/${splitId}/comments`, { body }),
    () => {
      setBody("");
      setEdit(undefined);
    },
  );
  const deletion = useAction(
    () => apiClient.delete(`/collaboration/comments/${remove?.id}`),
    () => setRemove(undefined),
  );
  return (
    <Modal title={`Comments: ${description}`} onClose={onClose}>
      <ErrorMessage error={data.error} />
      {data.isLoading && <p>Loading comments…</p>}
      {data.data?.length === 0 && <p>No comments yet.</p>}
      {data.data?.map((c) => (
        <article
          key={c.id}
          className="border-b border-border-soft pb-3 space-y-2"
        >
          <p className="text-sm">
            <strong>{c.authorName}</strong> · {date(c.createdAt)}
            {!c.deletedAt && c.updatedAt !== c.createdAt ? " · edited" : ""}
          </p>
          <p className="whitespace-pre-wrap break-words">{c.body}</p>
          {!c.deletedAt && (
            <div className="flex gap-2">
              {c.userId === user?.id && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setEdit(c);
                    setBody(c.body);
                    save.reset();
                  }}
                >
                  Edit
                </button>
              )}
              {(c.userId === user?.id || owner) && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setRemove(c);
                    deletion.reset();
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </article>
      ))}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined);
        }}
      >
        <label className="label">
          {edit ? "Edit your comment" : "Add a comment"}
          <textarea
            className="field min-h-24"
            required
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <p className="text-xs">
          Visible to people with access to this expense. {body.length}/2000
        </p>
        <ErrorMessage error={save.error} />
        <div className="flex gap-2">
          <button className="btn" disabled={!body.trim() || save.isPending}>
            {edit ? "Save comment" : "Post comment"}
          </button>
          {edit && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEdit(undefined);
                setBody("");
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>
      {remove && (
        <Confirm
          message="Remove this comment? Its text will be replaced with [Deleted]."
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate(undefined)}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </Modal>
  );
}
