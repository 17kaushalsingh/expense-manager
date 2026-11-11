create function public.create_personal_asset(p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.personal_assets;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 insert into public.personal_assets(user_id,name,kind,currency,notes) values(auth.uid(),trim(p_input->>'name'),p_input->>'kind',p_input->>'currency',coalesce(p_input->>'notes','')) returning * into a;
 if (p_input->>'value')::numeric<>round((p_input->>'value')::numeric,2) then raise exception 'Use at most two decimals';end if;
 insert into public.asset_valuations(user_id,asset_id,value_date,value) values(auth.uid(),a.id,(p_input->>'valueDate')::date,(p_input->>'value')::numeric);
 return to_jsonb(a);
end $$;
alter table public.event_planned_costs add column recorded_transaction_id uuid references public.transactions on delete set null;
create index event_costs_transaction on public.event_planned_costs(recorded_transaction_id);
create function public.record_event_cost(p_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cost public.event_planned_costs;tx jsonb;
begin
 perform private.lock_ledger();
 select * into cost from public.event_planned_costs where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Planned cost not found' using errcode='P0002';end if;
 if cost.recorded_transaction_id is not null then return (select to_jsonb(t) from public.transactions t where id=cost.recorded_transaction_id and user_id=auth.uid());end if;
 tx=public.mutate_transaction_atomic(jsonb_build_object('accountId',p_input->>'accountId','amount',coalesce((p_input->>'amount')::numeric,cost.amount),'type','EXPENSE','categoryId',cost.category_id,'dateTime',p_input->>'dateTime','notes',cost.name));
 insert into public.event_transactions(user_id,event_id,transaction_id) values(auth.uid(),cost.event_id,(tx->>'id')::uuid);
 update public.event_planned_costs set recorded_transaction_id=(tx->>'id')::uuid,is_completed=true where id=cost.id;
 return tx;
end $$;
revoke all on function public.create_personal_asset(jsonb),public.record_event_cost(uuid,jsonb) from public,anon;
grant execute on function public.create_personal_asset(jsonb),public.record_event_cost(uuid,jsonb) to authenticated;
