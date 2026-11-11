alter table public.personal_loans add constraint valid_loan_due_dates check(first_due_date is null or first_due_date>=start_date);
create function private.validate_loan_dates() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='personal_loans' then
 if not isfinite(new.start_date) or (new.first_due_date is not null and not isfinite(new.first_due_date)) then raise exception 'Choose finite dates';end if;
 if tg_op='INSERT' and new.start_date>(select (now() at time zone timezone)::date from public.users where id=auth.uid()) then raise exception 'Loan start cannot be in the future';end if;
 elsif not isfinite(new.date_time) then raise exception 'Choose a finite payment date';end if;
 return new;
end $$;
create trigger validate_dates before insert or update on public.personal_loans for each row execute function private.validate_loan_dates();
create trigger validate_dates before insert or update on public.loan_payments for each row execute function private.validate_loan_dates();
revoke all on function private.validate_loan_dates() from public,anon,authenticated;
