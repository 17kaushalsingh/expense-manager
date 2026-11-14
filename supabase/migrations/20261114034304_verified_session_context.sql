-- PostgREST verifies JWT signatures/expiry before this actor/session check runs.
create or replace function public.verify_current_session() returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; inserted integer;
begin
 perform public.enforce_app_session();
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
 sid:=(auth.jwt()->>'session_id')::uuid;
 insert into private.session_devices(session_id,user_id) values(sid,auth.uid()) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=1 then
  insert into public.audit_logs(entity_type,entity_id,user_id,action,changes)
  values('AuthSession',sid,auth.uid(),'FIRST_USE',jsonb_build_object('scope','DEVICE'));
 else
  update private.session_devices set last_seen_at=now()
  where session_id=sid and user_id=auth.uid() and last_seen_at<now()-interval '10 minutes';
 end if;
 return jsonb_build_object('session_id',sid,'user_id',auth.uid());
end $$;
