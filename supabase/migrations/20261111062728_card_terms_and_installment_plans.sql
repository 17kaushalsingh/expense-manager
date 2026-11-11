create table public.card_settings (
 account_id uuid primary key references public.accounts on delete cascade,user_id uuid not null references public.users,
 credit_limit numeric(14,2) not null check(credit_limit>=0),statement_day int not null check(statement_day between 1 and 31),
 due_day int not null check(due_day between 1 and 31),updated_at timestamptz not null default now()
);
create index card_settings_owner on public.card_settings(user_id);
create table public.card_installments (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 account_id uuid not null references public.accounts,transaction_id uuid not null unique references public.transactions,
 name text not null check(length(trim(name)) between 1 and 120),first_due_date date not null,
 installment_count int not null check(installment_count between 1 and 600),paid_principal numeric(14,2) not null default 0 check(paid_principal>=0),
 updated_at timestamptz not null default now()
);
create index card_installments_owner on public.card_installments(user_id);
create index card_installments_account on public.card_installments(account_id);
create function private.validate_card_plan() returns trigger language plpgsql set search_path='' as $$
declare n numeric;
begin
 perform pg_advisory_xact_lock(821141009);
 if new.user_id is distinct from auth.uid() or not exists(select 1 from public.accounts where id=new.account_id and user_id=auth.uid() and type='CREDIT_CARD') then raise exception 'Choose your own credit card';end if;
 if tg_table_name='card_installments' then
 select amount into n from public.transactions where id=new.transaction_id and account_id=new.account_id and user_id=auth.uid() and type='EXPENSE' and balance_delta>0;
 if n is null or new.paid_principal>n or not isfinite(new.first_due_date) then raise exception 'Choose a card purchase and valid paid principal';end if;
 end if;return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['card_settings','card_installments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy own_records on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 execute format('create trigger validate_card before insert or update on public.%I for each row execute function private.validate_card_plan()',t);
 execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()',t);
 end loop;
end $$;
create trigger audit_personal after insert or update or delete on public.card_installments for each row execute function private.audit_personal_record();
-- A planned purchase cannot change underneath its principal schedule.
create function private.guard_installment_purchase() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.card_installments where transaction_id=old.id) and (new.amount<>old.amount or new.account_id<>old.account_id or new.type<>old.type) then raise exception 'Remove the installment plan before changing this purchase';end if;return new;
end $$;
create trigger guard_installments before update on public.transactions for each row execute function private.guard_installment_purchase();
revoke all on function private.validate_card_plan(),private.guard_installment_purchase() from public,anon,authenticated;
