-- The posting pointer belongs to the atomic RPC, not direct client writes.
revoke insert,update on public.event_planned_costs from authenticated;
grant insert(user_id,event_id,name,amount,category_id,is_completed),update(name,amount,category_id,is_completed) on public.event_planned_costs to authenticated;
