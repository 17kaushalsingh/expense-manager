import {useResource} from './useResource';
import {Account} from '@/lib/types';
export function useAccounts(){return useResource<Account[]>('/accounts');}
export function useNetWorth(){return useResource<{netWorth:number;breakdown:{assets:number;liabilities:number;receivables:number;payables:number}}>('/analytics/net-worth');}
export function useDebtSummary(){return useResource<{totalOwedToYou:number;totalYouOwe:number}>('/analytics/debt-summary');}
