-- Parent budgets include their direct subcategories. Keep saved finance references valid.
create or replace function private.validate_category_parent() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(821141009);
 if new.parent_id is not null then
 if new.parent_id=new.id or not exists(select 1 from public.categories p where p.id=new.parent_id and p.parent_id is null and p.type=new.type and (p.user_id is null or p.user_id=auth.uid())) or exists(select 1 from public.categories where parent_id=new.id) then raise exception 'Choose an accessible top-level category of the same type';end if;
 end if;
 if tg_op='UPDATE' and new.type<>old.type and (exists(select 1 from public.categories where parent_id=new.id) or exists(select 1 from public.transactions where category_id=new.id) or exists(select 1 from public.budgets where category_id=new.id) or exists(select 1 from public.budget_plans where category_id=new.id) or exists(select 1 from public.personal_bills where category_id=new.id) or exists(select 1 from public.personal_entries where category_id=new.id) or exists(select 1 from public.event_planned_costs where category_id=new.id) or exists(select 1 from public.split_expenses where category_id=new.id)) then raise exception 'Category type cannot change while referenced';end if;
 return new;
end $$;

create or replace function public.budget_summary(p_month date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare tz text;result jsonb;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 select timezone into tz from public.users where id=auth.uid();
 if p_month<>date_trunc('month',p_month)::date then raise exception 'Use first day of month';end if;
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('categoryName',coalesce(c.name,'Overall spending'),'spent',coalesce((select sum(t.analytics_amount) from public.transactions t where t.user_id=auth.uid() and t.type='EXPENSE' and t.analytics_amount>0 and (b.category_id is null or t.category_id=b.category_id or t.category_id in (select id from public.categories where parent_id=b.category_id)) and t.date_time>=(p_month::timestamp at time zone tz) and t.date_time<((p_month+interval '1 month')::timestamp at time zone tz)),0)) order by b.category_id nulls first),'[]') into result from public.budgets b left join public.categories c on c.id=b.category_id where b.user_id=auth.uid() and b.month=p_month;
 return result;
end $$;

create or replace function public.budget_plan_summary(p_date date default current_date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;tz text;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 select timezone into tz from public.users where id=auth.uid();
 with windows as (
 select p.*,private.budget_window(p.start_date,p.frequency,p_date,p.end_date) w from public.budget_plans p where user_id=auth.uid()
 ), totals as (
 select w.*,coalesce(o.amount,w.amount) effective_amount,o.id override_id,
 coalesce((select sum(t.analytics_amount) from public.transactions t where t.user_id=auth.uid() and t.type='EXPENSE' and t.analytics_amount>0 and (w.category_id is null or t.category_id=w.category_id or t.category_id in (select id from public.categories where parent_id=w.category_id)) and t.date_time>=(lower(w.w)::timestamp at time zone tz) and t.date_time<(upper(w.w)::timestamp at time zone tz)),0) spent
 from windows w left join public.budget_overrides o on o.plan_id=w.id and o.period_start=lower(w.w)
 ) select coalesce(jsonb_agg((to_jsonb(t)-'w')||jsonb_build_object('period_start',lower(t.w),'period_end',upper(t.w)-1,'category_name',coalesce(c.name,'All expenses'),'elapsed_fraction',case when t.w is null then 0 else least(1,greatest(0,(p_date-lower(t.w)+1)::numeric/nullif(upper(t.w)-lower(t.w),0))) end) order by t.created_at),'[]') into result from totals t left join public.categories c on c.id=t.category_id;
 return result;
end $$;

create function private.guard_card_type() returns trigger language plpgsql set search_path='' as $$
begin
 if new.type<>'CREDIT_CARD' and (exists(select 1 from public.card_settings where account_id=old.id) or exists(select 1 from public.card_installments where account_id=old.id)) then raise exception 'Remove card terms and plans before changing account type';end if;return new;
end $$;
create trigger guard_card_type before update of type on public.accounts for each row execute function private.guard_card_type();
revoke all on function private.guard_card_type() from public,anon,authenticated;
