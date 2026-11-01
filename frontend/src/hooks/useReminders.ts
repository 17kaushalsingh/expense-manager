import {useResource,useAction} from './useResource';
import {apiClient} from '@/lib/api/client';
import {Reminder} from '@/lib/types';
export function useReminders(){return useResource<Reminder[]>('/reminders');}
export function useCompleteReminder(){return useAction((id:string)=>apiClient.patch(`/reminders/${id}/complete`,{}));}
export function useDismissReminder(){return useAction((id:string)=>apiClient.patch(`/reminders/${id}/read`,{}));}
