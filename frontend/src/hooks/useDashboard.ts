import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';

export function useNetWorth() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['net-worth'],
    queryFn: () => apiClient.get('/analytics/net-worth', token || undefined),
    enabled: !!token,
  });
}

export function useAccounts() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get('/accounts', token || undefined),
    enabled: !!token,
  });
}

export function useDebtSummary() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['debt-summary'],
    queryFn: () => apiClient.get('/analytics/debt-summary', token || undefined),
    enabled: !!token,
  });
}
