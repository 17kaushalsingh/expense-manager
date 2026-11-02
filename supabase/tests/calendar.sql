-- Run as one transaction in the dedicated test project with HTTP fixture users.
begin;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
update public.users set timezone='America/New_York' where id=auth.uid();
set local role authenticated;
do $$ declare b jsonb; begin
 b=public.local_date_bounds('2024-03-10','2024-03-10');
 if (b->>'from')::timestamptz<>'2024-03-10T05:00:00Z'::timestamptz or (b->>'to')::timestamptz<>'2024-03-11T04:00:00Z'::timestamptz then raise exception 'Spring DST bounds incorrect';end if;
 b=public.local_date_bounds('2024-11-03','2024-11-03');
 if (b->>'to')::timestamptz-(b->>'from')::timestamptz<>interval '25 hours' then raise exception 'Fall DST bounds incorrect';end if;
 begin perform public.local_date_bounds('2024-03-11','2024-03-10');raise exception 'Invalid dates accepted';exception when raise_exception then if sqlerrm='Invalid dates accepted' then raise;end if;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.local_date_bounds('2024-03-10','2024-03-10');raise exception 'Missing actor accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
update public.users set timezone='Asia/Kolkata' where id=auth.uid();
set local role authenticated;
do $$ declare b jsonb;begin
 b=public.local_date_bounds('2024-02-29','2024-02-29');
 if (b->>'from')::timestamptz<>'2024-02-28T18:30:00Z'::timestamptz or (b->>'to')::timestamptz<>'2024-02-29T18:30:00Z'::timestamptz then raise exception 'Leap-day half-hour bounds incorrect';end if;
 if has_function_privilege('anon','public.local_date_bounds(date,date)','EXECUTE') then raise exception 'Anonymous execution allowed';end if;
end $$;
rollback;
