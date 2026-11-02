-- Planning records never write the accounting ledger.
create table public.budgets (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 category_id uuid references public.categories on delete cascade,month date not null,
 amount numeric(14,2) not null check(amount>0),currency text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(month=date_trunc('month',month)::date),unique nulls not distinct(user_id,month,category_id)
);
create index budgets_category on public.budgets(category_id);
create table public.savings_goals (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 account_id uuid not null unique references public.accounts,name text not null check(length(trim(name)) between 1 and 120),
 target_amount numeric(14,2) not null check(target_amount>0),target_date date,currency text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index goals_user on public.savings_goals(user_id);
create function private.validate_planning() returns trigger language plpgsql set search_path='' as $$
declare c text;
begin
 perform private.lock_ledger();
 if new.user_id<>auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 select display_currency into c from public.users where id=auth.uid();
 if new.currency<>c then raise exception 'Planning currency must match your profile';end if;
 if tg_table_name='budgets' then
 perform private.check_category(new.category_id,auth.uid(),'EXPENSE');
 else
 if not exists(select 1 from public.accounts where id=new.account_id and user_id=auth.uid() and currency=c and type in ('CASH','BANK_ACCOUNT','PREPAID_CARD','INVESTMENT')) then raise exception 'Choose an owned asset account';end if;
 end if;
 return new;
end $$;
create trigger validate_budget before insert or update on public.budgets for each row execute function private.validate_planning();
create trigger validate_goal before insert or update on public.savings_goals for each row execute function private.validate_planning();
create trigger touch_updated before update on public.budgets for each row execute function private.touch_updated();
create trigger touch_updated before update on public.savings_goals for each row execute function private.touch_updated();
create function private.guard_planning_currency() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.display_currency<>old.display_currency and (exists(select 1 from public.budgets where user_id=old.id) or exists(select 1 from public.savings_goals where user_id=old.id)) then raise exception 'Remove budgets and savings goals before changing currency';end if;
 return new;
end $$;
create trigger planning_currency before update on public.users for each row execute function private.guard_planning_currency();
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
revoke all on public.budgets,public.savings_goals from public,anon,authenticated;
grant select,insert,update,delete on public.budgets,public.savings_goals to authenticated;
create policy own_budgets on public.budgets for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_goals on public.savings_goals for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function public.budget_summary(p_month date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare tz text;result jsonb;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 select timezone into tz from public.users where id=auth.uid();
 if p_month<>date_trunc('month',p_month)::date then raise exception 'Use first day of month';end if;
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('categoryName',coalesce(c.name,'Overall spending'),'spent',coalesce((select sum(t.analytics_amount) from public.transactions t where t.user_id=auth.uid() and t.type='EXPENSE' and t.analytics_amount>0 and (b.category_id is null or t.category_id=b.category_id) and t.date_time>=(p_month::timestamp at time zone tz) and t.date_time<((p_month+interval '1 month')::timestamp at time zone tz)),0)) order by b.category_id nulls first),'[]') into result from public.budgets b left join public.categories c on c.id=b.category_id where b.user_id=auth.uid() and b.month=p_month;
 return result;
end $$;
-- The feed is append-only and contains only group-visible information.
create table public.group_activity (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.groups on delete cascade,
 actor_id uuid references public.users on delete set null,actor_name text not null,action text not null,
 entity_type text not null,entity_id uuid not null,summary text not null,created_at timestamptz not null default now()
);
create index activity_feed on public.group_activity(group_id,created_at desc,id);
create index activity_actor on public.group_activity(actor_id);
create function private.record_group_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;g uuid;summary text;actor_name text;
begin
 r=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 g=(r->>'group_id')::uuid;
 if g is null or not exists(select 1 from public.groups where id=g) then return coalesce(new,old);end if;
 select name into actor_name from public.users where id=auth.uid();
 summary=case tg_table_name when 'split_expenses' then r->>'description' when 'settlements' then 'Settlement recorded' else 'Group membership changed' end;
 insert into public.group_activity(group_id,actor_id,actor_name,action,entity_type,entity_id,summary) values(g,auth.uid(),coalesce(actor_name,'System'),tg_op,tg_table_name,(r->>'id')::uuid,summary);
 return coalesce(new,old);
end $$;
create trigger expense_activity after insert or update or delete on public.split_expenses for each row execute function private.record_group_activity();
create trigger settlement_activity after insert on public.settlements for each row execute function private.record_group_activity();
create trigger membership_activity after insert or delete on public.group_members for each row execute function private.record_group_activity();
create table public.split_comments (
 id uuid primary key default gen_random_uuid(),split_expense_id uuid not null references public.split_expenses on delete cascade,
 group_id uuid not null references public.groups on delete cascade,user_id uuid not null references public.users,
 author_name text not null,body text not null check(length(trim(body)) between 1 and 2000),
 deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index comments_expense on public.split_comments(split_expense_id,created_at);
create index comments_group on public.split_comments(group_id);
create index comments_author on public.split_comments(user_id);
create trigger touch_updated before update on public.split_comments for each row execute function private.touch_updated();
alter table public.group_activity enable row level security;
alter table public.split_comments enable row level security;
revoke all on public.group_activity,public.split_comments from public,anon,authenticated;
grant select on public.group_activity,public.split_comments to authenticated;
create policy member_activity on public.group_activity for select to authenticated using(private.is_member(group_id));
create policy member_comments on public.split_comments for select to authenticated using(private.is_member(group_id));
create function public.mutate_split_comment(p_split_id uuid default null,p_body text default null,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.split_comments;g uuid;v uuid=coalesce(p_id,gen_random_uuid());n text;
begin
 perform private.lock_ledger();
 if p_id is not null then
 select * into c from public.split_comments where id=p_id;
 if not found then raise exception 'Comment not found' using errcode='P0002';end if;
 g=c.group_id;
 if not private.is_member(g) or (c.user_id<>auth.uid() and not(p_delete and exists(select 1 from public.groups where id=g and owner_id=auth.uid()))) then raise exception 'Only the author can edit; owners may moderate deletion' using errcode='42501';end if;
 if c.deleted_at is not null then return to_jsonb(c);end if;
 else
 select group_id into g from public.split_expenses where id=p_split_id;
 if g is null or not private.is_member(g) then raise exception 'Group expense not found' using errcode='42501';end if;
 end if;
 if p_delete then
 update public.split_comments set body='[Deleted]',deleted_at=now() where id=v;
 elsif nullif(trim(p_body),'') is null or length(trim(p_body))>2000 then raise exception 'Comments must contain 1 to 2000 characters';
 elsif p_id is null then
 select name into n from public.users where id=auth.uid();
 insert into public.split_comments(id,split_expense_id,group_id,user_id,author_name,body) values(v,p_split_id,g,auth.uid(),n,trim(p_body));
 else update public.split_comments set body=trim(p_body) where id=v;end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('SplitComment',v,auth.uid(),case when p_delete then 'DELETE' when p_id is null then 'CREATE' else 'UPDATE' end);
 insert into public.group_activity(group_id,actor_id,actor_name,action,entity_type,entity_id,summary) select g,auth.uid(),name,case when p_delete then 'DELETE' when p_id is null then 'INSERT' else 'UPDATE' end,'split_comments',v,case when p_delete then 'Comment removed' else 'Comment on an expense' end from public.users where id=auth.uid();
 return (select to_jsonb(x) from public.split_comments x where id=v);
end $$;
revoke all on function private.validate_planning(),private.guard_planning_currency(),private.record_group_activity() from public,anon,authenticated;
revoke all on function public.budget_summary(date),public.mutate_split_comment(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.budget_summary(date),public.mutate_split_comment(uuid,text,uuid,boolean) to authenticated;
