create function public.local_date_bounds(p_from date,p_to date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare tz text;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid date range';end if;
 select timezone into tz from public.users where id=auth.uid();
 return jsonb_build_object('from',(p_from::timestamp at time zone tz),'to',((p_to+1)::timestamp at time zone tz),'timezone',tz);
end $$;
revoke all on function public.local_date_bounds(date,date) from public,anon;
grant execute on function public.local_date_bounds(date,date) to authenticated;
