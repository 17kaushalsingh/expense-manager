-- Planning validation runs with caller privileges; use native locking and explicit
-- owner predicates rather than granting clients access to private ledger helpers.
create or replace function private.validate_planning() returns trigger language plpgsql set search_path='' as $$
declare c text;
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(821141009);
 select display_currency into c from public.users where id=auth.uid();
 if new.currency<>c then raise exception 'Planning currency must match your profile';end if;
 if tg_table_name='budgets' then
 if new.category_id is not null and not exists(select 1 from public.categories where id=new.category_id and (user_id is null or user_id=auth.uid()) and type='EXPENSE') then raise exception 'Choose an accessible expense category';end if;
 else
 if not exists(select 1 from public.accounts where id=new.account_id and user_id=auth.uid() and currency=c and type in ('CASH','BANK_ACCOUNT','PREPAID_CARD','INVESTMENT')) then raise exception 'Choose an owned asset account';end if;
 end if;
 return new;
end $$;
create function public.copy_budgets(p_month date) returns int language plpgsql security invoker set search_path='' as $$
declare copied int;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 if p_month<>date_trunc('month',p_month)::date then raise exception 'Use first day of month';end if;
 insert into public.budgets(user_id,category_id,month,amount,currency) select auth.uid(),category_id,p_month,amount,currency from public.budgets where user_id=auth.uid() and month=(p_month-interval '1 month')::date on conflict do nothing;
 get diagnostics copied=row_count;return copied;
end $$;
revoke all on function public.copy_budgets(date) from public,anon;
grant execute on function public.copy_budgets(date) to authenticated;
