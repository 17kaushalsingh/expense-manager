-- Fresh Supabase database. Auth owns credentials; public.users contains preferences only.
create schema if not exists private;
revoke all on schema private from public;
create table public.users (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) > 0),
 display_currency text not null default 'USD' check(display_currency ~ '^[A-Z]{3}$'),
 timezone text not null default 'UTC',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users,
 name text not null check(length(trim(name)) > 0),
 type text not null check(type in ('CASH','BANK_ACCOUNT','PREPAID_CARD','INVESTMENT','CREDIT_CARD','LOAN','ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE')),
 currency text not null check(currency ~ '^[A-Z]{3}$'), balance numeric(14,2) not null default 0,
 metadata jsonb, is_default boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index default_account on public.accounts(user_id,type,currency) where is_default;
create index accounts_owner on public.accounts(user_id);
create table public.categories (
 id uuid primary key default gen_random_uuid(), user_id uuid references public.users,
 name text not null check(length(trim(name)) > 0), type text not null check(type in ('INCOME','EXPENSE','TRANSFER')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.groups (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.users,
 name text not null check(length(trim(name)) > 0), currency text not null check(currency ~ '^[A-Z]{3}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.group_members (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups on delete cascade,
 user_id uuid not null references public.users, joined_at timestamptz not null default now(), unique(group_id,user_id)
);
create index members_user on public.group_members(user_id,group_id);
create table public.split_expenses (
 id uuid primary key default gen_random_uuid(), group_id uuid references public.groups,
 creator_id uuid not null references public.users, description text not null check(length(trim(description)) > 0),
 currency text not null check(currency ~ '^[A-Z]{3}$'), total_amount numeric(14,2) not null check(total_amount>0),
 split_type text not null check(split_type in ('EQUAL','EXACT','PERCENTAGE','SHARES')),
 category_id uuid references public.categories on delete set null,
 date timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index splits_group on public.split_expenses(group_id);
create table public.split_payers (
 id uuid primary key default gen_random_uuid(), split_expense_id uuid not null references public.split_expenses on delete cascade,
 user_id uuid not null references public.users, account_id uuid not null references public.accounts,
 amount_paid numeric(14,2) not null check(amount_paid>0), unique(split_expense_id,user_id)
);
create table public.split_participants (
 id uuid primary key default gen_random_uuid(), split_expense_id uuid not null references public.split_expenses on delete cascade,
 user_id uuid not null references public.users, share_value numeric(14,4) check(share_value>=0),
 amount_owed numeric(14,2) not null check(amount_owed>=0), unique(split_expense_id,user_id)
);
create table public.settlements (
 id uuid primary key default gen_random_uuid(), payer_id uuid not null references public.users,
 payee_id uuid not null references public.users, group_id uuid references public.groups,
 currency text not null, amount numeric(14,2) not null check(amount>0),
 account_id uuid not null references public.accounts, method text not null default 'CASH',
 date timestamptz not null default now(), notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(payer_id<>payee_id)
);
create index settlements_group on public.settlements(group_id);
create table public.transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users,
 account_id uuid not null references public.accounts, category_id uuid references public.categories on delete set null,
 type text not null check(type in ('INCOME','EXPENSE','TRANSFER')), amount numeric(14,2) not null check(amount>=0),
 balance_delta numeric(14,2) not null, analytics_amount numeric(14,2) not null default 0,
 source_type text not null default 'MANUAL' check(source_type in ('MANUAL','TRANSFER','SPLIT','SETTLEMENT')),
 source_id uuid, linked_transaction_id uuid unique references public.transactions deferrable initially deferred,
 date_time timestamptz not null default now(), tags jsonb, notes text, attachments jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index transactions_feed on public.transactions(user_id,date_time desc);
create index transactions_source on public.transactions(source_type,source_id);
create table public.reminders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users,
 title text not null check(length(trim(title))>0), description text, type text not null,
 due_date timestamptz not null, is_read boolean not null default false, is_completed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null,
 user_id uuid not null references public.users, action text not null, changes jsonb,
 created_at timestamptz not null default now()
);
create function private.bootstrap_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.users(id,name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'name',''),nullif(new.raw_user_meta_data->>'full_name',''),split_part(new.email,'@',1),'User'));
 return new;
end $$;
create trigger bootstrap_user after insert on auth.users for each row execute function private.bootstrap_user();
create function private.touch_updated() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['users','accounts','categories','groups','split_expenses','transactions','reminders','settlements'] loop
 execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()',t);
 end loop;
end $$;
-- Definer helpers avoid recursive policies on membership and split parties.
create function private.is_member(g uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_members where group_id=g and user_id=auth.uid()) $$;
create function private.can_read_split(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.split_expenses e where e.id=s and (e.creator_id=auth.uid() or private.is_member(e.group_id)))
 or exists(select 1 from public.split_payers where split_expense_id=s and user_id=auth.uid())
 or exists(select 1 from public.split_participants where split_expense_id=s and user_id=auth.uid()) $$;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid), private.can_read_split(uuid) to authenticated;
do $$ declare t text; begin
 foreach t in array array['users','accounts','categories','transactions','groups','group_members','split_expenses','split_payers','split_participants','reminders','settlements','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy own_profile on public.users for select to authenticated using(id=auth.uid());
create policy own_accounts on public.accounts for select to authenticated using(user_id=auth.uid());
create policy own_transactions on public.transactions for select to authenticated using(user_id=auth.uid());
create policy readable_categories on public.categories for select to authenticated using(user_id is null or user_id=auth.uid());
create policy write_categories on public.categories for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant insert,update,delete on public.categories to authenticated;
create policy readable_groups on public.groups for select to authenticated using(private.is_member(id));
create policy readable_members on public.group_members for select to authenticated using(private.is_member(group_id));
create policy readable_splits on public.split_expenses for select to authenticated using(private.can_read_split(id));
create policy readable_payers on public.split_payers for select to authenticated using(private.can_read_split(split_expense_id));
create policy readable_participants on public.split_participants for select to authenticated using(private.can_read_split(split_expense_id));
create policy own_reminders on public.reminders for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant insert,update,delete on public.reminders to authenticated;
create policy readable_settlements on public.settlements for select to authenticated using(payer_id=auth.uid() or payee_id=auth.uid() or private.is_member(group_id));
create policy own_audits on public.audit_logs for select to authenticated using(user_id=auth.uid());
-- Never expose public.users or auth.users via a group join.
create function public.group_member_profiles(p_group_id uuid) returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select u.id,u.name from public.users u join public.group_members m on m.user_id=u.id where m.group_id=p_group_id and private.is_member(p_group_id) $$;
create function public.lookup_user(p_email text) returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select u.id,u.name from public.users u join auth.users a on a.id=u.id where auth.uid() is not null and lower(a.email)=lower(trim(p_email)) $$;
revoke all on function public.group_member_profiles(uuid), public.lookup_user(text) from public,anon;
grant execute on function public.group_member_profiles(uuid), public.lookup_user(text) to authenticated;
insert into public.categories(name,type) values ('Food','EXPENSE'),('Travel','EXPENSE'),('Shopping','EXPENSE'),('Salary','INCOME'),('Other income','INCOME');
