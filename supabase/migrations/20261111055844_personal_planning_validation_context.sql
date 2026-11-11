-- Validation runs as the caller: do not grant ledger-writing helpers to clients.
create or replace function private.validate_personal_planning() returns trigger language plpgsql set search_path='' as $$
declare w daterange;p public.budget_plans;
begin
 perform pg_advisory_xact_lock(821141009);
 if new.user_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 if tg_table_name='budget_overrides' then
 select * into p from public.budget_plans where id=new.plan_id and user_id=auth.uid();
 if not found then raise exception 'Budget plan not found';end if;
 w=private.budget_window(p.start_date,p.frequency,new.period_start,p.end_date);
 if w is null or lower(w)<>new.period_start then raise exception 'Choose the start of a budget period';end if;
 elsif tg_table_name in ('budget_plans','monthly_plans') then
 if new.currency is distinct from (select display_currency from public.users where id=auth.uid()) then raise exception 'Currency must match your profile';end if;
 if tg_table_name='budget_plans' then
 if new.category_id is not null and not exists(select 1 from public.categories where id=new.category_id and type='EXPENSE' and (user_id is null or user_id=auth.uid())) then raise exception 'Choose an accessible expense category';end if;
 if tg_op='UPDATE' and (new.start_date<>old.start_date or new.frequency<>old.frequency or new.end_date is distinct from old.end_date) and exists(select 1 from public.budget_overrides where plan_id=old.id) then raise exception 'Remove period overrides before changing the schedule';end if;
 end if;
 end if;
 return new;
end $$;
-- Trigger-only writer appends audit events without granting clients audit INSERT.
create function private.audit_personal_record() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
 if auth.uid() is null or (r->>'user_id')::uuid is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 insert into public.audit_logs(user_id,entity_type,entity_id,action,changes) values(auth.uid(),tg_table_name,coalesce((r->>'id')::uuid,(r->>'user_id')::uuid),tg_op,jsonb_build_object('record',r));
 return coalesce(new,old);
end $$;
revoke all on function private.audit_personal_record() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['finance_preferences','budget_plans','budget_overrides','monthly_plans'] loop
 execute format('create trigger audit_personal after insert or update or delete on public.%I for each row execute function private.audit_personal_record()',t);
 end loop;
end $$;
