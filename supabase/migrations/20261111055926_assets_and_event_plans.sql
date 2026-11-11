create table public.personal_assets (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 name text not null check(length(trim(name)) between 1 and 120),
 kind text not null check(kind in ('PROPERTY','VEHICLE','INVESTMENT','VALUABLE','OTHER')),
 currency text not null,notes text not null default '' check(length(notes)<=2000),
 archived boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index personal_assets_owner on public.personal_assets(user_id);
create table public.asset_valuations (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 asset_id uuid not null references public.personal_assets on delete cascade,
 value_date date not null,value numeric(14,2) not null check(value>=0),
 notes text not null default '' check(length(notes)<=1000),updated_at timestamptz not null default now(),unique(asset_id,value_date)
);
create index asset_valuations_owner on public.asset_valuations(user_id);
create table public.finance_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 name text not null check(length(trim(name)) between 1 and 120),kind text not null check(kind in ('TRIP','WEDDING','PROJECT','OTHER')),
 start_date date not null,end_date date not null,amount numeric(14,2) not null check(amount>0),currency text not null,
 notes text not null default '' check(length(notes)<=2000),archived boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(end_date>=start_date)
);
create index finance_events_owner on public.finance_events(user_id);
create table public.event_transactions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 event_id uuid not null references public.finance_events on delete cascade,
 transaction_id uuid not null unique references public.transactions on delete cascade,
 updated_at timestamptz not null default now()
);
create index event_transactions_owner on public.event_transactions(user_id);
create index event_transactions_event on public.event_transactions(event_id);
create table public.event_planned_costs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 event_id uuid not null references public.finance_events on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),amount numeric(14,2) not null check(amount>0),
 category_id uuid references public.categories on delete set null,is_completed boolean not null default false,
 updated_at timestamptz not null default now()
);
create index event_costs_owner on public.event_planned_costs(user_id);
create index event_costs_event on public.event_planned_costs(event_id);
create index event_costs_category on public.event_planned_costs(category_id);
create function private.validate_asset_event() returns trigger language plpgsql set search_path='' as $$
declare c text;today date;
begin
 perform pg_advisory_xact_lock(821141009);
 if new.user_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 select display_currency,(now() at time zone timezone)::date into c,today from public.users where id=auth.uid();
 if tg_table_name in ('personal_assets','finance_events') then
 if new.currency is distinct from c then raise exception 'Currency must match your profile';end if;
 elsif tg_table_name='asset_valuations' then
 if not exists(select 1 from public.personal_assets where id=new.asset_id and user_id=auth.uid()) then raise exception 'Asset not found';end if;
 if new.value_date>today then raise exception 'Valuations cannot be future dated';end if;
 elsif tg_table_name in ('event_planned_costs','event_transactions') then
 if not exists(select 1 from public.finance_events where id=new.event_id and user_id=auth.uid()) then raise exception 'Event not found';end if;
 if tg_table_name='event_transactions' then
 if not exists(select 1 from public.transactions where id=new.transaction_id and user_id=auth.uid() and type='EXPENSE' and analytics_amount>0) then raise exception 'Choose a personal expense entry';end if;
 elsif new.category_id is not null and not exists(select 1 from public.categories where id=new.category_id and type='EXPENSE' and (user_id is null or user_id=auth.uid())) then raise exception 'Choose an accessible expense category';end if;
 end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['personal_assets','asset_valuations','finance_events','event_transactions','event_planned_costs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy own_records on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 execute format('create trigger validate_asset_event before insert or update on public.%I for each row execute function private.validate_asset_event()',t);
 execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()',t);
 execute format('create trigger audit_personal after insert or update or delete on public.%I for each row execute function private.audit_personal_record()',t);
 end loop;
end $$;
create function public.event_finance_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('spent',coalesce((select sum(t.analytics_amount) from public.event_transactions x join public.transactions t on t.id=x.transaction_id where x.event_id=e.id and t.type='EXPENSE'),0),'planned',coalesce((select sum(amount) from public.event_planned_costs where event_id=e.id),0)) order by e.start_date desc,e.id),'[]') from public.finance_events e where user_id=auth.uid()
$$;
create function public.net_worth_history(p_range text default '1M') returns jsonb language plpgsql security invoker set search_path='' as $$
declare tz text;today date;start_date date;result jsonb;monthly boolean;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 if p_range not in ('1W','1M','3M','1Y','ALL') then raise exception 'Invalid range';end if;
 select timezone,(now() at time zone timezone)::date into tz,today from public.users where id=auth.uid();
 monthly=p_range='ALL';
 if monthly then
 select greatest(coalesce(least((select min(created_at at time zone tz)::date from public.accounts where user_id=auth.uid()),(select min(date_time at time zone tz)::date from public.transactions where user_id=auth.uid()),(select min(value_date) from public.asset_valuations where user_id=auth.uid())),today),today-interval '100 years')::date into start_date;
 start_date=date_trunc('month',start_date)::date;
 else start_date=today-case p_range when '1W' then 6 when '1M' then 29 when '3M' then 89 else 364 end;end if;
 with dates as (select least(case when monthly then (d+interval '1 month - 1 day')::date else d::date end,today) d from generate_series(start_date::timestamp,today::timestamp,case when monthly then interval '1 month' else interval '1 day' end) d),
 values_by_day as (
 select dates.d,
 coalesce((select sum((a.balance-coalesce((select sum(balance_delta) from public.transactions t where t.account_id=a.id and t.date_time>=((dates.d+1)::timestamp at time zone tz)),0))*case when a.type in ('CREDIT_CARD','LOAN','ACCOUNTS_PAYABLE') then -1 else 1 end) from public.accounts a where a.user_id=auth.uid() and least(a.created_at,coalesce((select min(date_time) from public.transactions where account_id=a.id),a.created_at))<((dates.d+1)::timestamp at time zone tz)),0) account_worth,
 coalesce((select sum(v.value) from public.personal_assets a cross join lateral(select value from public.asset_valuations where asset_id=a.id and value_date<=dates.d order by value_date desc limit 1) v where a.user_id=auth.uid()),0) asset_worth
 from dates)
 select coalesce(jsonb_agg(jsonb_build_object('date',d,'accounts',account_worth,'assets',asset_worth,'net_worth',account_worth+asset_worth) order by d),'[]') into result from values_by_day;
 return jsonb_build_object('timezone',tz,'series',result);
end $$;
create function private.guard_asset_event_currency() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.display_currency<>old.display_currency and (exists(select 1 from public.personal_assets where user_id=old.id) or exists(select 1 from public.finance_events where user_id=old.id)) then raise exception 'Remove assets and events before changing currency';end if;return new;
end $$;
create trigger asset_event_currency before update on public.users for each row execute function private.guard_asset_event_currency();
revoke all on function private.validate_asset_event(),private.guard_asset_event_currency() from public,anon,authenticated;
revoke all on function public.event_finance_summary(),public.net_worth_history(text) from public,anon;
grant execute on function public.event_finance_summary(),public.net_worth_history(text) to authenticated;
