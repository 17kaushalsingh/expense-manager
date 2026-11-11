create function private.validate_bill_postponement() returns trigger language plpgsql set search_path='' as $$
begin
 if new.review_date<(now() at time zone new.timezone)::date then raise exception 'Choose today or a future review date';end if;return new;
end $$;
create trigger validate_postponement before update of review_date on public.bill_occurrences for each row execute function private.validate_bill_postponement();
revoke all on function private.validate_bill_postponement() from public,anon,authenticated;
