import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/store/auth";

export function useReminders() {
  const token = useAuthStore(state => state.token);

  return useQuery({
    queryKey: ['reminders'],
    queryFn: async () => {
      const data = await apiClient.get('/reminders', token || undefined);
      return data;
    },
    enabled: !!token
  });
}

export function useCompleteReminder() {
  const token = useAuthStore(state => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return apiClient.patch(`/reminders/${id}/complete`, {}, token || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    }
  });
}

export function useDismissReminder() {
  const token = useAuthStore(state => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return apiClient.patch(`/reminders/${id}/read`, {}, token || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    }
  });
}
