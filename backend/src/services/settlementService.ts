import { SupabaseClient } from '@supabase/supabase-js';
import { rpc } from '../db';
import { CreateSettlementInput } from '../validation/schemas';
export function createSettlement(client: SupabaseClient, input: CreateSettlementInput) {
  return rpc(client,'execute_settlement_atomic',{p_input:input});
}
