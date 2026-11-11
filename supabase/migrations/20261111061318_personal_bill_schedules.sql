alter table public.transactions drop constraint transactions_source_type_check;
alter table public.transactions add constraint transactions_source_type_check check(source_type in ('MANUAL','TRANSFER','SPLIT','SETTLEMENT','PERSONAL_LOAN','PERSONAL_BILL'));
create table public.personal_bills (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 name text not null check(length(trim(name)) between 1 and 120),type text not null check(type in ('INCOME','EXPENSE')),
 amount numeric(14,2) not null check(amount>0),currency text not null,category_id uuid references public.categories on delete set null,
 account_id uuid references public.accounts,frequency text not null check(frequency in ('ONCE','DAILY','WEEKLY','BIWEEKLY','MONTHLY','QUARTERLY','YEARLY')),
 start_date date not null,end_date date,timezone text not null,status text not null default 'ACTIVE' check(status in ('ACTIVE','PAUSED','ARCHIVED')),
 next_index int not null default 0,notes text not null default '' check(length(notes)<=2000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(end_date is null or end_date>=start_date)
);
create index personal_bills_owner on public.personal_bills(user_id);
create index personal_bills_account on public.personal_bills(account_id);
create index personal_bills_category on public.personal_bills(category_id);
create table public.bill_occurrences (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 bill_id uuid not null references public.personal_bills,occurrence_index int not null,due_date date not null,review_date date not null,
 timezone text not null,payload jsonb not null,status text not null default 'DUE' check(status in ('DUE','RECORDED','SKIPPED','REVERSED')),
 transaction_id uuid references public.transactions on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(bill_id,occurrence_index)
);
create index bill_occurrences_owner on public.bill_occurrences(user_id,review_date);
create index bill_occurrences_transaction on public.bill_occurrences(transaction_id);
alter table public.personal_bills enable row level security;
alter table public.bill_occurrences enable row level security;
revoke all on public.personal_bills,public.bill_occurrences from public,anon,authenticated;
grant select on public.personal_bills,public.bill_occurrences to authenticated;
create policy own_bills on public.personal_bills for select to authenticated using(user_id=(select auth.uid()));
create policy own_occurrences on public.bill_occurrences for select to authenticated using(user_id=(select auth.uid()));
create trigger touch_updated before update on public.personal_bills for each row execute function private.touch_updated();
create trigger touch_updated before update on public.bill_occurrences for each row execute function private.touch_updated();
create function private.personal_due_date(anchor date,frequency text,idx int) returns date language sql immutable set search_path='' as $$
 select case frequency when 'ONCE' then case when idx=0 then anchor end when 'DAILY' then anchor+idx when 'WEEKLY' then anchor+idx*7 when 'BIWEEKLY' then anchor+idx*14 when 'MONTHLY' then (anchor+make_interval(months=>idx))::date when 'QUARTERLY' then (anchor+make_interval(months=>idx*3))::date when 'YEARLY' then (anchor+make_interval(years=>idx))::date end
$$;
-- Private Cron worker creates review records only. It cannot write ledger entries.
create function private.generate_personal_bills(p_now timestamptz default now(),p_user uuid default null) returns int language plpgsql security definer set search_path='' as $$
declare s public.personal_bills;idx int;due date;today date;n int;added int=0;i int;
begin
 perform pg_advisory_xact_lock(821141009);
 for s in select * from public.personal_bills where status='ACTIVE' and (p_user is null or user_id=p_user) order by id loop
 today=(p_now at time zone s.timezone)::date;idx=s.next_index;
 for i in 1..100 loop
 due=private.personal_due_date(s.start_date,s.frequency,idx);
 exit when due is null or due>today or (s.end_date is not null and due>s.end_date);
 insert into public.bill_occurrences(user_id,bill_id,occurrence_index,due_date,review_date,timezone,payload) values(s.user_id,s.id,idx,due,due,s.timezone,jsonb_build_object('name',s.name,'type',s.type,'amount',s.amount,'currency',s.currency,'categoryId',s.category_id,'accountId',s.account_id,'notes',s.notes)) on conflict(bill_id,occurrence_index) do nothing;
 get diagnostics n=row_count;added=added+n;
 if n>0 then insert into public.audit_logs(user_id,entity_type,entity_id,action,changes) values(s.user_id,'PersonalBill',s.id,'GENERATE_DRAFT',jsonb_build_object('system',true,'dueDate',due));end if;
 idx=idx+1;
 end loop;
 update public.personal_bills set next_index=idx where id=s.id;
 end loop;
 return added;
end $$;
create function public.manage_personal_bill(p_input jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if p_id is null and start_at<today then raise exception 'Start date must be today or later';end if;
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
create function public.refresh_personal_bills() returns int language plpgsql security definer set search_path='' as $$
begin perform private.lock_ledger();return private.generate_personal_bills(now(),auth.uid());end $$;
create function public.review_bill_occurrence(p_id uuid,p_action text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.bill_occurrences;v jsonb;tx jsonb;dt timestamptz;r record;
begin
 perform private.lock_ledger();select * into d from public.bill_occurrences where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Occurrence not found' using errcode='P0002';end if;
 if p_action='RECORD' and d.status='RECORDED' then
 if d.transaction_id is null then raise exception 'Recorded transaction was removed';end if;return (select to_jsonb(t) from public.transactions t where id=d.transaction_id and user_id=auth.uid());
 end if;
 if p_action='REVERSE' then
 if d.status='REVERSED' then return to_jsonb(d);end if;
 if d.status<>'RECORDED' then raise exception 'Only recorded occurrences can be reversed';end if;
 for r in select account_id,sum(balance_delta) delta from public.transactions where source_type='PERSONAL_BILL' and source_id=d.id and user_id=auth.uid() group by account_id loop
 update public.accounts set balance=balance-r.delta where id=r.account_id and user_id=auth.uid();if not found then raise exception 'Original account missing';end if;
 end loop;
 delete from public.transactions where source_type='PERSONAL_BILL' and source_id=d.id and user_id=auth.uid();
 update public.bill_occurrences set status='REVERSED' where id=d.id;
 elsif d.status<>'DUE' then raise exception 'Occurrence is no longer pending';
 elsif p_action='SKIP' then update public.bill_occurrences set status='SKIPPED' where id=d.id;
 elsif p_action='POSTPONE' then
 if (p_input->>'reviewDate')::date is null or not isfinite((p_input->>'reviewDate')::date) then raise exception 'Choose a review date';end if;
 update public.bill_occurrences set review_date=(p_input->>'reviewDate')::date where id=d.id;
 elsif p_action='RECORD' then
 v=d.payload||p_input;
 select coalesce((p_input->>'dateTime')::timestamptz,(d.review_date::timestamp at time zone d.timezone)) into dt;
 if not isfinite(dt) then raise exception 'Choose a finite date';end if;
 tx=public.mutate_transaction_atomic(jsonb_build_object('accountId',v->>'accountId','categoryId',v->>'categoryId','type',d.payload->>'type','amount',(v->>'amount')::numeric,'dateTime',dt,'notes',coalesce(v->>'notes',v->>'name')));
 update public.transactions set source_type='PERSONAL_BILL',source_id=d.id where id=(tx->>'id')::uuid;
 update public.bill_occurrences set status='RECORDED',transaction_id=(tx->>'id')::uuid where id=d.id;
 else raise exception 'Invalid review action';end if;
 insert into public.audit_logs(user_id,entity_type,entity_id,action) values(auth.uid(),'BillOccurrence',d.id,p_action);
 if p_action='RECORD' then return (select to_jsonb(t) from public.transactions t where id=(tx->>'id')::uuid);end if;
 return (select to_jsonb(x) from public.bill_occurrences x where id=d.id);
end $$;
create function private.guard_bill_currency() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.display_currency<>old.display_currency and exists(select 1 from public.personal_bills where user_id=old.id) then raise exception 'Personal bill schedules retain their original currency';end if;return new;end $$;
create trigger bill_currency before update on public.users for each row execute function private.guard_bill_currency();
revoke all on function private.personal_due_date(date,text,int),private.generate_personal_bills(timestamptz,uuid),private.guard_bill_currency() from public,anon,authenticated;
revoke all on function public.manage_personal_bill(jsonb,uuid),public.refresh_personal_bills(),public.review_bill_occurrence(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_personal_bill(jsonb,uuid),public.refresh_personal_bills(),public.review_bill_occurrence(uuid,text,jsonb) to authenticated;
select cron.schedule('generate-personal-bills-hourly','0 * * * *','select private.generate_personal_bills();');
