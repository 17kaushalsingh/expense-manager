-- Current Auth sessions remain the authority. Never store bearer/refresh tokens or IPs.
create table private.session_devices (
 session_id uuid primary key,
 user_id uuid not null references public.users(id) on delete cascade,
 name text check (name is null or length(trim(name)) between 1 and 80),
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 revoked_at timestamptz
);
create index session_devices_owner on private.session_devices(user_id);
alter table private.session_devices enable row level security;
create policy session_devices_no_client_access on private.session_devices for all to authenticated using(false) with check(false);
revoke all on private.session_devices from public,anon,authenticated;

create function private.session_active() returns boolean language plpgsql stable security definer set search_path='' as $$
declare sid uuid;
begin
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 return sid is not null and auth.uid() is not null and exists(
  select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid()
  and (s.not_after is null or s.not_after>now())
 );
exception when invalid_text_representation then return false;
end $$;
revoke all on function private.session_active() from public,anon;
grant execute on function private.session_active() to authenticated;

-- PostgREST checks privileged RPCs too; restrictive RLS also covers Storage/read paths.
create function public.enforce_app_session() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.jwt()->>'role'='authenticated' and not private.session_active() then
  raise sqlstate 'PT401' using message='Session revoked or expired';
 end if;
end $$;
revoke all on function public.enforce_app_session() from public;
grant execute on function public.enforce_app_session() to anon,authenticated,service_role;
do $$ declare existing text; t record; begin
 select setting into existing from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
 where s.setrole=(select oid from pg_roles where rolname='authenticator') and setting like 'pgrst.db_pre_request=%' limit 1;
 if existing is not null and existing<>'pgrst.db_pre_request=public.enforce_app_session' then
  raise exception 'An existing Data API pre-request hook needs explicit integration';
 end if;
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
  execute format('create policy app_active_session on %I.%I as restrictive for all to authenticated using ((select private.session_active())) with check ((select private.session_active()))',t.nspname,t.relname);
 end loop;
end $$;
alter role authenticator set pgrst.db_pre_request='public.enforce_app_session';
notify pgrst, 'reload config';

create function public.verify_current_session() returns jsonb language plpgsql security definer set search_path='' as $$
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
 return jsonb_build_object('session_id',sid);
end $$;
revoke all on function public.verify_current_session() from public,anon;
grant execute on function public.verify_current_session() to authenticated;

create function public.list_account_sessions() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.enforce_app_session();
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.is_current desc,q.last_seen_at desc,q.id) from (
  select s.id,d.name,left(coalesce(s.user_agent,''),512) user_agent,s.created_at,
   greatest(s.created_at,s.refreshed_at at time zone 'UTC',d.last_seen_at) last_seen_at,
   s.id=(auth.jwt()->>'session_id')::uuid is_current
  from auth.sessions s left join private.session_devices d on d.session_id=s.id and d.user_id=s.user_id
  where s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  order by s.created_at desc limit 1000
 ) q),'[]'::jsonb);
end $$;
revoke all on function public.list_account_sessions() from public,anon;
grant execute on function public.list_account_sessions() to authenticated;

create function public.manage_account_session(p_action text,p_id uuid default null,p_name text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_sid uuid:=(auth.jwt()->>'session_id')::uuid; target uuid; affected integer:=0; current_revoked boolean:=false;
begin
 if actor is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended('account-sessions:'||actor::text,0));
 perform public.enforce_app_session();
 if p_action='RENAME' then
  if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Use a device name of 1 to 80 characters';end if;
  if not exists(select 1 from auth.sessions where id=p_id and user_id=actor and (not_after is null or not_after>now())) then raise sqlstate 'PT404' using message='Device session unavailable';end if;
  insert into private.session_devices(session_id,user_id,name) values(p_id,actor,trim(p_name))
  on conflict(session_id) do update set name=excluded.name where session_devices.user_id=actor;
  insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('AuthSession',p_id,actor,'RENAME',jsonb_build_object('name',trim(p_name)));
  return jsonb_build_object('id',p_id);
 end if;
 if p_action not in ('REVOKE','REVOKE_OTHERS','REVOKE_ALL') or (p_action='REVOKE' and p_id is null) then raise exception 'Invalid session action';end if;
 if p_action='REVOKE' and not exists(select 1 from auth.sessions where id=p_id and user_id=actor) then
  if exists(select 1 from private.session_devices where session_id=p_id and user_id=actor and revoked_at is not null) then
   return jsonb_build_object('revoked_count',0,'current_revoked',false);
  end if;
  raise sqlstate 'PT404' using message='Device session unavailable';
 end if;
 for target in select id from auth.sessions where user_id=actor and
  (p_action='REVOKE_ALL' or (p_action='REVOKE_OTHERS' and id<>current_sid) or (p_action='REVOKE' and id=p_id)) for update loop
  insert into private.session_devices(session_id,user_id,revoked_at) values(target,actor,now())
  on conflict(session_id) do update set revoked_at=excluded.revoked_at where session_devices.user_id=actor;
  insert into public.audit_logs(entity_type,entity_id,user_id,action,changes)
  values('AuthSession',target,actor,'REVOKE',jsonb_build_object('scope',p_action,'was_current',target=current_sid));
  delete from auth.sessions where id=target and user_id=actor;
  affected:=affected+1; current_revoked:=current_revoked or target=current_sid;
 end loop;
 return jsonb_build_object('revoked_count',affected,'current_revoked',current_revoked);
end $$;
revoke all on function public.manage_account_session(text,uuid,text) from public,anon;
grant execute on function public.manage_account_session(text,uuid,text) to authenticated;

create function public.account_security_activity(p_limit integer default 30,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.enforce_app_session();
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'Invalid activity page';end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc) from (
  select id,entity_id session_id,action,changes,created_at from public.audit_logs
  where user_id=auth.uid() and entity_type='AuthSession'
  order by created_at desc,id desc limit p_limit offset p_offset
 ) q),'[]'::jsonb);
end $$;
revoke all on function public.account_security_activity(integer,integer) from public,anon;
grant execute on function public.account_security_activity(integer,integer) to authenticated;
