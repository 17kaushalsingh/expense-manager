begin;
-- Reserved disposable identities; this entire test rolls back.
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
create temporary table invite_test_state(g uuid, r uuid);
insert into invite_test_state(g) select (public.manage_group('{"name":"Invitation rollback test"}')->>'id')::uuid;
select public.manage_group_invitation((select g from invite_test_state),'CREATE',repeat('a',64));
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ declare v jsonb; begin
 v=public.use_group_invitation(repeat('a',64),true);
 if v->>'status'<>'PENDING' or v ? 'members' then raise exception 'Request/preview failed'; end if;
 perform public.use_group_invitation(repeat('a',64),true);
 if (select count(*) from public.group_join_requests where group_id=(select g from invite_test_state))<>1 then raise exception 'Duplicate request'; end if;
 begin perform public.manage_group_invitation((select g from invite_test_state)); raise exception 'Owner restriction failed'; exception when insufficient_privilege then null; end;
end $$;
update invite_test_state set r=(select id from public.group_join_requests where group_id=g);
grant select on invite_test_state to authenticated;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.groups where id=(select g from invite_test_state)) then raise exception 'Outsider can read group'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select public.decide_group_join_request(g,r,'APPROVE') from invite_test_state;
select public.decide_group_join_request(g,r,'APPROVE') from invite_test_state;
do $$ begin
 if (select count(*) from public.group_members where group_id=(select g from invite_test_state))<>2 then raise exception 'Duplicate approval'; end if;
end $$;
select public.manage_group_invitation(g,'CREATE',repeat('b',64)) from invite_test_state;
do $$ begin
 if public.use_group_invitation(repeat('a',64))->>'valid'<>'false' then raise exception 'Regeneration failed'; end if;
end $$;
update public.group_invitations set expires_at=now()-interval '1 second' where group_id=(select g from invite_test_state);
do $$ begin if public.use_group_invitation(repeat('b',64))->>'valid'<>'false' then raise exception 'Expiration failed'; end if; end $$;
rollback;
