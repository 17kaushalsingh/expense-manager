import { useResource } from "./useResource";
import { Group, Split, DebtGraph } from "@/lib/types";
export function useGroups() {
  return useResource<Group[]>("/groups");
}
export function useGroupSplits(id: string) {
  return useResource<Split[]>(`/splits/group/${id}`, !!id);
}
export function useGroupSimplification(id: string) {
  return useResource<DebtGraph>(`/groups/${id}/simplify-debts`, !!id);
}
