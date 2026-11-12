create or replace function public.manage_personal_bill(p_input jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.personal_bills;c text;a uuid;cat uuid;tz text;f text;start_at date;end_at date;state text;idx int;v uuid=coalesce(p_id,gen_random_uuid());today date;
begin
 perform private.lock_ledger();select display_currency into c from public.users where id=auth.uid();
 if p_id is not null then
 select * into s from public.personal_bills where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Bill not found' using errcode='P0002';end if;
 if s.status='ARCHIVED' then raise exception 'Archived schedules cannot be changed';end if;
 end if;
 tz=p_input->>'timezone';f=p_input->>'frequency';start_at=(p_input->>'startDate')::date;end_at=(p_input->>'endDate')::date;state=coalesce(p_input->>'status','ACTIVE');
 if tz is null or not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'Choose an IANA timezone';end if;
 today=(now() at time zone tz)::date;
 if not private.valid_money((p_input->>'amount')::numeric) or p_input->>'currency' is distinct from c or p_input->>'type' not in ('INCOME','EXPENSE') then raise exception 'Invalid bill amount, currency or type';end if;
 if f is null or f not in ('ONCE','DAILY','WEEKLY','BIWEEKLY','MONTHLY','QUARTERLY','YEARLY') or start_at is null or not isfinite(start_at) or (end_at is not null and (not isfinite(end_at) or end_at<start_at)) or state not in ('ACTIVE','PAUSED','ARCHIVED') then raise exception 'Invalid recurrence settings';end if;
 -- Offline-created schedules retain their original anchor. Catch-up only generates bounded review drafts.
 if p_id is not null and (tz<>s.timezone or f<>s.frequency or start_at<>s.start_date) then raise exception 'Create a new bill to change cadence or timezone';end if;
 a=(p_input->>'accountId')::uuid;cat=(p_input->>'categoryId')::uuid;
 if a is not null and not exists(select 1 from public.accounts where id=a and user_id=auth.uid() and currency=c and type not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE')) then raise exception 'Choose an owned payment account';end if;
 perform private.check_category(cat,auth.uid(),p_input->>'type');
 idx=coalesce(s.next_index,0);
 if s.status='PAUSED' and state='ACTIVE' then
 while private.personal_due_date(start_at,f,idx)<today loop idx=idx+1;end loop;
 end if;
 if p_id is null then
 insert into public.personal_bills(id,user_id,name,type,amount,currency,category_id,account_id,frequency,start_date,end_date,timezone,status,notes,next_index) values(v,auth.uid(),trim(p_input->>'name'),p_input->>'type',(p_input->>'amount')::numeric,c,cat,a,f,start_at,end_at,tz,state,coalesce(p_input->>'notes',''),idx);
 else update public.personal_bills set name=trim(p_input->>'name'),type=p_input->>'type',amount=(p_input->>'amount')::numeric,category_id=cat,account_id=a,end_date=end_at,status=state,notes=coalesce(p_input->>'notes',''),next_index=idx where id=v;
 end if;
 if state='ARCHIVED' then update public.bill_occurrences set status='SKIPPED' where bill_id=v and status='DUE';end if;
 insert into public.audit_logs(user_id,entity_type,entity_id,action) values(auth.uid(),'PersonalBill',v,case when p_id is null then 'CREATE' else state end);
 perform private.generate_personal_bills(now(),auth.uid());
 return (select to_jsonb(x) from public.personal_bills x where id=v);
end $$;
