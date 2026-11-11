"use client";
import { T } from "@/components/i18n/Language";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useResource, useAction } from "@/hooks/useResource";
import { apiClient } from "@/lib/api/client";
import { Category } from "@/lib/types";
import { Modal, Confirm, ErrorMessage } from "@/components/ui/Controls";
export default function Categories() {
  const categories = useResource<Category[]>("/categories");
  const [edit, setEdit] = useState<Category | null | undefined>(),
    [remove, setRemove] = useState<Category>();
  const deletion = useAction(
    () => apiClient.delete(`/categories/${remove?.id}`),
    () => setRemove(undefined),
  );
  return (
    <DashboardLayout>
      <header className="flex justify-between">
        <h1 className="text-2xl font-bold">
          <T text="Categories" />
        </h1>
        <button className="btn" onClick={() => setEdit(null)}>
          New category
        </button>
      </header>
      <ErrorMessage error={categories.error} />
      {categories.isLoading && <p>Loading categories…</p>}
      <div className="space-y-3">
        {categories.data?.map((c) => (
          <article
            className="panel flex justify-between items-center"
            key={c.id}
          >
            <div>
              <h2>
                {c.parentId
                  ? `${categories.data?.find((p) => p.id === c.parentId)?.name ?? "Category"} / `
                  : ""}
                {c.name}
              </h2>
              <p className="text-xs text-text-secondary">
                {c.type}
                {!c.userId ? " · System default" : ""}
              </p>
            </div>
            {c.userId && (
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setEdit(c)}>
                  <T text="Edit" />
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    deletion.reset();
                    setRemove(c);
                  }}
                >
                  <T text="Delete" />
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {edit !== undefined && (
        <CategoryEditor
          category={edit ?? undefined}
          categories={categories.data ?? []}
          onClose={() => setEdit(undefined)}
        />
      )}{" "}
      {remove && (
        <Confirm
          message={`Delete ${remove.name}? Historical transactions will become uncategorized, and budgets for this category will be removed.`}
          onClose={() => setRemove(undefined)}
          onConfirm={() => deletion.mutate()}
          busy={deletion.isPending}
          error={deletion.error}
        />
      )}
    </DashboardLayout>
  );
}
function CategoryEditor({
  category,
  categories,
  onClose,
}: {
  category?: Category;
  categories: Category[];
  onClose: () => void;
}) {
  const [type, setType] = useState(category?.type ?? "EXPENSE");
  const action = useAction(
    (body: Record<string, unknown>) =>
      category
        ? apiClient.put(`/categories/${category.id}`, body)
        : apiClient.post("/categories", body),
    onClose,
  );
  return (
    <Modal
      title={category ? "Edit category" : "New category"}
      onClose={onClose}
      busy={action.isPending}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.mutate({
            name: f.get("name"),
            type,
            parentId: f.get("parent") || null,
          });
        }}
      >
        <label className="label">
          <T text="Name" />
          <input
            className="field"
            name="name"
            defaultValue={category?.name}
            required
          />
        </label>
        <label className="label">
          <T text="Type" />
          <select
            className="field"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as Category["type"])}
          >
            <option>EXPENSE</option>
            <option>INCOME</option>
            <option>TRANSFER</option>
          </select>
        </label>
        <label className="label">
          Parent category
          <select
            key={type}
            className="field"
            name="parent"
            defaultValue={
              type === category?.type ? (category?.parentId ?? "") : ""
            }
          >
            <option value="">Top-level category</option>
            {categories
              .filter(
                (c) => c.id !== category?.id && !c.parentId && c.type === type,
              )
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <ErrorMessage error={action.error} />
        <button className="btn" disabled={action.isPending}>
          <T text="Save category" />
        </button>
      </form>
    </Modal>
  );
}
