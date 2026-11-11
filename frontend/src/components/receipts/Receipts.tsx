"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import { ErrorMessage } from "@/components/ui/Controls";
interface Receipt {
  id: string;
  fileName: string;
  byteSize: number;
  objectPath: string;
  status: "PENDING" | "READY";
}
export function Receipts({
  transactionId,
  splitId,
  canManage = false,
}: {
  transactionId?: string;
  splitId?: string;
  canManage?: boolean;
}) {
  const query = useResource<Receipt[]>(
    `/receipts?${transactionId ? `transactionId=${transactionId}` : `splitId=${splitId}`}`,
  );
  const queries = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const [links, setLinks] = useState<
    Record<string, { url: string; expires: number }>
  >({});
  const [removing, setRemoving] = useState<string>();
  const remove = useAction(
    async (id: string) => apiClient.delete(`/receipts/${id}`),
    () => setRemoving(undefined),
  );
  async function upload(file: File) {
    setBusy(true);
    setError(undefined);
    let receipt: Receipt | undefined;
    try {
      if (
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
          file.type,
        ) ||
        file.size <= 0 ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error("Choose a JPEG, PNG, WebP or PDF up to 5 MB.");
      receipt = await apiClient.post<Receipt>("/receipts", {
        transactionId,
        splitId,
        fileName: file.name,
        mimeType: file.type,
        byteSize: file.size,
      });
      const { error } = await supabase()
        .storage.from("receipts")
        .upload(receipt.objectPath, file, {
          contentType: file.type,
          upsert: false,
        });
      if (error) throw error;
      await apiClient.post(`/receipts/${receipt.id}/complete`, {});
    } catch (error) {
      setError(error);
      if (receipt)
        await apiClient.delete(`/receipts/${receipt.id}`).catch(() => {});
    } finally {
      setBusy(false);
      await queries.invalidateQueries();
    }
  }
  async function download(id: string) {
    setError(undefined);
    try {
      const data = await apiClient.post<{ url: string }>(
        `/receipts/${id}/download`,
        {},
      );
      setLinks((previous) => ({
        ...previous,
        [id]: { url: data.url, expires: Date.now() + 60_000 },
      }));
    } catch (error) {
      setError(error);
    }
  }
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Receipts</h3>
      <p className="text-xs text-text-secondary">
        Private files · JPEG, PNG, WebP or PDF · 5 MB each · up to 10 per
        expense. Remove receipts before deleting the expense.
      </p>
      {query.isLoading && <p role="status">Loading receipts…</p>}
      {query.data?.length === 0 && (
        <p className="text-sm text-text-secondary">No receipts attached.</p>
      )}
      {query.data?.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-border-soft p-3 space-y-2"
        >
          <p className="text-sm break-all">
            {r.fileName} ·{" "}
            {r.byteSize < 1024
              ? `${r.byteSize} B`
              : `${Math.ceil(r.byteSize / 1024)} KB`}{" "}
            {r.status === "PENDING" ? "· upload incomplete" : ""}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            {r.status === "READY" && (
              <button
                className="subtle-link"
                type="button"
                onClick={() => download(r.id)}
              >
                Prepare download
              </button>
            )}
            {links[r.id] && (
              <a
                className="subtle-link"
                href={links[r.id].url}
                rel="noreferrer"
                target="_blank"
              >
                Download (link expires in 1 minute)
              </a>
            )}
            {canManage &&
              (removing === r.id ? (
                <>
                  <span>Remove this file?</span>
                  <button
                    type="button"
                    className="text-negative"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(r.id)}
                  >
                    Confirm removal
                  </button>
                  <button type="button" onClick={() => setRemoving(undefined)}>
                    <T text="Cancel" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="text-negative"
                  onClick={() => setRemoving(r.id)}
                >
                  <T text="Remove" />
                </button>
              ))}
          </div>
        </div>
      ))}
      {canManage && (
        <label className="label">
          {busy ? "Uploading receipt…" : "Attach receipt"}
          <input
            className="w-full min-w-0 max-w-full text-sm"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={busy || (query.data?.length ?? 0) >= 10}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      )}
      <ErrorMessage error={error || query.error || remove.error} />
    </section>
  );
}
