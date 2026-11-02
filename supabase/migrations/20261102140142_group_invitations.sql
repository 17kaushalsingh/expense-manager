-- Bearer invitation tokens are stored only as SHA-256 hashes. No anonymous reads.
create table public.group_invitations (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups on delete cascade,
 token_hash text not null unique, created_by uuid not null references public.users,
 expires_at timestamptz not null default now()+interval '7 days', revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index invitations_group on public.group_invitations(group_id);
create index invitations_creator on public.group_invitations(created_by);
create table public.group_join_requests (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups on delete cascade,
 user_id uuid not null references public.users, invitation_id uuid not null references public.group_invitations,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 created_at timestamptz not null default now(), decided_at timestamptz, unique(group_id,user_id)
);
create index requests_user on public.group_join_requests(user_id);
create index requests_invitation on public.group_join_requests(invitation_id);
create table private.invitation_limits(user_id uuid primary key references public.users on delete cascade, window_start timestamptz not null, lookups int not null default 0, requests int not null default 0);
alter table private.invitation_limits enable row level security;
create function private.invitation_limit(is_request boolean) returns void language plpgsql set search_path='' as $$
declare r private.invitation_limits;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 insert into private.invitation_limits(user_id,window_start) values(auth.uid(),now()) on conflict do nothing;
 select * into r from private.invitation_limits where user_id=auth.uid() for update;
 if r.window_start < now()-interval '1 minute' then r.lookups=0; r.requests=0; r.window_start=now(); end if;
 -- Keep rejected attempts committed by returning a rate-limited response at the API boundary.
 if r.lookups>=60 or (is_request and r.requests>=10) then raise exception 'Too many invitation requests; try again in a minute' using errcode='P0001'; end if;
 update private.invitation_limits set window_start=r.window_start,lookups=r.lookups+1,requests=r.requests+case when is_request then 1 else 0 end where user_id=auth.uid();
end $$;
create function public.manage_group_invitation(p_group_id uuid,p_action text default 'LIST',p_token text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 perform private.lock_ledger();
 if not exists(select 1 from public.groups where id=p_group_id and owner_id=auth.uid()) then raise exception 'Only the owner can manage invitations' using errcode='42501'; end if;
 if p_action in ('CREATE','REVOKE') then
 update public.group_invitations set revoked_at=now() where group_id=p_group_id and revoked_at is null;
 if p_action='CREATE' then
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token'; end if;
 insert into public.group_invitations(group_id,created_by,token_hash) values(p_group_id,auth.uid(),encode(sha256(convert_to(p_token,'UTF8')),'hex')) returning id into v;
 end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('GroupInvitation',p_group_id,auth.uid(),p_action);
 end if;
 return jsonb_build_object('invitation',(select jsonb_build_object('id',id,'expiresAt',expires_at,'revokedAt',revoked_at) from public.group_invitations where group_id=p_group_id and revoked_at is null order by created_at desc limit 1),'requests',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'userId',r.user_id,'name',u.name,'status',r.status,'createdAt',r.created_at) order by r.created_at desc),'[]') from public.group_join_requests r join public.users u on u.id=r.user_id where r.group_id=p_group_id));
end $$;
create function public.use_group_invitation(p_token text,p_request boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.group_invitations; g public.groups; r public.group_join_requests; member boolean;
begin
 perform private.lock_ledger(); perform private.invitation_limit(p_request);
 select * into i from public.group_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and revoked_at is null and expires_at>now();
 -- Invalid tokens return normally so rate counters persist.
 if not found then return jsonb_build_object('valid',false); end if;
 select * into g from public.groups where id=i.group_id;
 member=exists(select 1 from public.group_members where group_id=g.id and user_id=auth.uid());
 if p_request and not member then
 insert into public.group_join_requests(group_id,user_id,invitation_id) values(g.id,auth.uid(),i.id)
 on conflict(group_id,user_id) do update set invitation_id=excluded.invitation_id,status='PENDING',created_at=now(),decided_at=null where group_join_requests.status='REJECTED';
 end if;
 select * into r from public.group_join_requests where group_id=g.id and user_id=auth.uid();
 return jsonb_build_object('valid',true,'groupId',g.id,'name',g.name,'currency',g.currency,'status',case when member then 'APPROVED' else coalesce(r.status,'NONE') end);
end $$;
create function public.decide_group_join_request(p_group_id uuid,p_request_id uuid,p_decision text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.group_join_requests; g public.groups;
begin
 perform private.lock_ledger();
 select * into g from public.groups where id=p_group_id and owner_id=auth.uid();
 if not found then raise exception 'Only the owner can decide requests' using errcode='42501'; end if;
 select * into r from public.group_join_requests where id=p_request_id and group_id=p_group_id for update;
 if not found then raise exception 'Request not found' using errcode='P0002'; end if;
 if p_decision not in ('APPROVE','REJECT') then raise exception 'Invalid decision'; end if;
 if r.status='APPROVED' then return to_jsonb(r); end if;
 if r.status<>'PENDING' then raise exception 'Request is no longer pending'; end if;
 if p_decision='APPROVE' then
 if not exists(select 1 from public.users where id=r.user_id and display_currency=g.currency) then raise exception 'Currency mismatch: ask the member to update their currency in Settings'; end if;
 insert into public.group_members(group_id,user_id) values(g.id,r.user_id) on conflict do nothing;
 end if;
 update public.group_join_requests set status=case when p_decision='APPROVE' then 'APPROVED' else 'REJECTED' end,decided_at=now() where id=r.id returning * into r;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('GroupJoinRequest',r.id,auth.uid(),p_decision);
 return to_jsonb(r);
end $$;
alter table public.group_invitations enable row level security;
alter table public.group_join_requests enable row level security;
revoke all on public.group_invitations,public.group_join_requests from anon,authenticated;
grant select(id,group_id,created_by,expires_at,revoked_at,created_at) on public.group_invitations to authenticated;
grant select on public.group_join_requests to authenticated;
create policy owner_invitations on public.group_invitations for select to authenticated using(exists(select 1 from public.groups where id=group_id and owner_id=(select auth.uid())));
create policy own_requests on public.group_join_requests for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.groups where id=group_id and owner_id=(select auth.uid())));
revoke all on function private.invitation_limit(boolean) from public,anon,authenticated;
revoke all on function public.manage_group_invitation(uuid,text,text),public.use_group_invitation(text,boolean),public.decide_group_join_request(uuid,uuid,text) from public,anon;
grant execute on function public.manage_group_invitation(uuid,text,text),public.use_group_invitation(text,boolean),public.decide_group_join_request(uuid,uuid,text) to authenticated;
