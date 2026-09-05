import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';

export function useGroups() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => apiClient.get('/groups', token || undefined),
    enabled: !!token,
  });
}

export function useGroupSplits(groupId: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['group-splits', groupId],
    queryFn: () => apiClient.get(`/splits/group/${groupId}`, token || undefined),
    enabled: !!token && !!groupId,
  });
}

export function useGroupSimplification(groupId: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['group-simplify', groupId],
    queryFn: () => apiClient.get(`/groups/${groupId}/simplify-debts`, token || undefined),
    enabled: !!token && !!groupId,
  });
}
