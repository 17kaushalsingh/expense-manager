-- Personal planning never changes account balances.
create table public.finance_preferences (
 user_id uuid primary key references public.users,
 pay_day integer not null default 1 check(pay_day between 1 and 31),
 updated_at timestamptz not null default now()
);
create table public.budget_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users,
 name text not null check(length(trim(name)) between 1 and 120),
 category_id uuid references public.categories on delete cascade,
 amount numeric(14,2) not null check(amount>0), currency text not null,
 frequency text not null check(frequency in ('DAILY','WEEKLY','BIWEEKLY','MONTHLY','QUARTERLY','YEARLY','CUSTOM')),
 start_date date not null, end_date date, archived boolean not null default false,
 alerts_enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_date is null or end_date>=start_date),
 check(frequency<>'CUSTOM' or end_date is not null)
);
create index budget_plans_user on public.budget_plans(user_id);
create index budget_plans_category on public.budget_plans(category_id);
create table public.budget_overrides (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users,
 plan_id uuid not null references public.budget_plans on delete cascade,
 period_start date not null, amount numeric(14,2) not null check(amount>0),
 unique(plan_id,period_start), updated_at timestamptz not null default now()
);
create index budget_overrides_user on public.budget_overrides(user_id);
create table public.monthly_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users,
 month date not null check(month=date_trunc('month',month)::date),
 expected_income numeric(14,2) not null check(expected_income>=0),
 expected_expense numeric(14,2) not null check(expected_expense>=0),
 target_saving_rate numeric(5,2) not null default 20 check(target_saving_rate between 0 and 100),
 currency text not null, updated_at timestamptz not null default now(), unique(user_id,month)
);
-- Calendar anchors are retained when a short month clamps a 29th/30th/31st.
create function private.budget_window(p_anchor date,p_frequency text,p_date date,p_end date default null)
returns daterange language plpgsql immutable set search_path='' as $$
declare n int;step int;s date;e date;
begin
 if p_date<p_anchor or (p_end is not null and p_date>p_end) then return null;end if;
 if p_frequency='CUSTOM' then return daterange(p_anchor,p_end+1,'[)');end if;
 if p_frequency in ('DAILY','WEEKLY','BIWEEKLY') then
 step=case p_frequency when 'DAILY' then 1 when 'WEEKLY' then 7 else 14 end;
 n=(p_date-p_anchor)/step;s=p_anchor+n*step;e=s+step;
 else
 step=case p_frequency when 'MONTHLY' then 1 when 'QUARTERLY' then 3 when 'YEARLY' then 12 end;
 if step is null then raise exception 'Invalid frequency';end if;
 n=((extract(year from p_date)::int-extract(year from p_anchor)::int)*12+extract(month from p_date)::int-extract(month from p_anchor)::int)/step;
 s=(p_anchor+make_interval(months=>n*step))::date;
 if s>p_date then n=n-1;s=(p_anchor+make_interval(months=>n*step))::date;end if;
 e=(p_anchor+make_interval(months=>(n+1)*step))::date;
 end if;
 return daterange(s,least(e,coalesce(p_end+1,e)),'[)');
end $$;
create function private.validate_personal_planning() returns trigger language plpgsql set search_path='' as $$
declare w daterange;p public.budget_plans;
begin
 perform private.lock_ledger();
 if new.user_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 if tg_table_name='budget_overrides' then
 select * into p from public.budget_plans where id=new.plan_id and user_id=auth.uid();
 if not found then raise exception 'Budget plan not found';end if;
 w=private.budget_window(p.start_date,p.frequency,new.period_start,p.end_date);
 if w is null or lower(w)<>new.period_start then raise exception 'Choose the start of a budget period';end if;
 elsif tg_table_name in ('budget_plans','monthly_plans') then
 if new.currency is distinct from (select display_currency from public.users where id=auth.uid()) then raise exception 'Currency must match your profile';end if;
 if tg_table_name='budget_plans' then
 perform private.check_category(new.category_id,auth.uid(),'EXPENSE');
 if tg_op='UPDATE' and (new.start_date<>old.start_date or new.frequency<>old.frequency or new.end_date is distinct from old.end_date) and exists(select 1 from public.budget_overrides where plan_id=old.id) then raise exception 'Remove period overrides before changing the schedule';end if;
 end if;
 end if;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['finance_preferences','budget_plans','budget_overrides','monthly_plans'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy own_records on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 execute format('create trigger validate_personal_planning before insert or update on public.%I for each row execute function private.validate_personal_planning()',t);
 execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()',t);
 end loop;
end $$;
create function public.budget_plan_summary(p_date date default current_date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;tz text;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 select timezone into tz from public.users where id=auth.uid();
 with windows as (
 select p.*,private.budget_window(p.start_date,p.frequency,p_date,p.end_date) w from public.budget_plans p where user_id=auth.uid()
 ), totals as (
 select w.*,coalesce(o.amount,w.amount) effective_amount,o.id override_id,
 coalesce((select sum(t.analytics_amount) from public.transactions t where t.user_id=auth.uid() and t.type='EXPENSE' and t.analytics_amount>0 and (w.category_id is null or t.category_id=w.category_id) and t.date_time>=(lower(w.w)::timestamp at time zone tz) and t.date_time<(upper(w.w)::timestamp at time zone tz)),0) spent
 from windows w left join public.budget_overrides o on o.plan_id=w.id and o.period_start=lower(w.w)
 ) select coalesce(jsonb_agg((to_jsonb(t)-'w')||jsonb_build_object('period_start',lower(t.w),'period_end',upper(t.w)-1,'category_name',coalesce(c.name,'All expenses'),'elapsed_fraction',case when t.w is null then 0 else least(1,greatest(0,(p_date-lower(t.w)+1)::numeric/nullif(upper(t.w)-lower(t.w),0))) end) order by t.created_at),'[]') into result from totals t left join public.categories c on c.id=t.category_id;
 return result;
end $$;
create function public.monthly_plan_summary(p_month date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare tz text;payday int;a date;b date;income numeric;expense numeric;plan jsonb;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 if p_month<>date_trunc('month',p_month)::date then raise exception 'Use the first day of a month';end if;
 select timezone into tz from public.users where id=auth.uid();
 select coalesce((select pay_day from public.finance_preferences where user_id=auth.uid()),1) into payday;
 a=p_month+least(payday-1,extract(day from p_month+interval '1 month - 1 day')::int-1);
 b=(p_month+interval '1 month')::date+least(payday-1,extract(day from p_month+interval '2 months - 1 day')::int-1);
 select coalesce(sum(analytics_amount) filter(where type='INCOME'),0),coalesce(sum(analytics_amount) filter(where type='EXPENSE'),0) into income,expense from public.transactions where user_id=auth.uid() and date_time>=(a::timestamp at time zone tz) and date_time<(b::timestamp at time zone tz);
 select to_jsonb(p) into plan from public.monthly_plans p where user_id=auth.uid() and month=p_month;
 return jsonb_build_object('plan',plan,'period_start',a,'period_end',b-1,'income',income,'expense',expense,'saving',income-expense,'saving_rate',case when income>0 then (income-expense)/income*100 else null end,'timezone',tz);
end $$;
-- References in the new planning tables must also protect the single currency rule.
create function private.guard_extended_planning_currency() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.display_currency<>old.display_currency and (exists(select 1 from public.budget_plans where user_id=old.id) or exists(select 1 from public.monthly_plans where user_id=old.id)) then raise exception 'Remove budget plans and monthly plans before changing currency';end if;return new;
end $$;
create trigger extended_planning_currency before update on public.users for each row execute function private.guard_extended_planning_currency();
revoke all on function private.budget_window(date,text,date,date),private.validate_personal_planning(),private.guard_extended_planning_currency() from public,anon,authenticated;
grant execute on function private.budget_window(date,text,date,date) to authenticated;
revoke all on function public.budget_plan_summary(date),public.monthly_plan_summary(date) from public,anon;
grant execute on function public.budget_plan_summary(date),public.monthly_plan_summary(date) to authenticated;
