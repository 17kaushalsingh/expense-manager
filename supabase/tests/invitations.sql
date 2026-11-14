begin;
-- SQL-only sessions exercise the same active-session policy as REST. These
-- rows and claim constructors exist only inside this rollback transaction.
insert into auth.sessions(id,user_id,not_after)
select md5('sql-rollback-'||id::text)::uuid,id,now()+interval '1 hour'
from auth.users where id in ('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777');
create function pg_temp.test_actor(actor uuid) returns void language plpgsql set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',md5('sql-rollback-'||actor::text)::uuid)::text,true);
end $$;

-- Reserved disposable identities; this entire test rolls back.
select pg_temp.test_actor('55555555-5555-4555-8555-555555555555');
create temporary table invite_test_state(g uuid, r uuid);
insert into invite_test_state(g) select (public.manage_group('{"name":"Invitation rollback test"}')->>'id')::uuid;
select public.manage_group_invitation((select g from invite_test_state),'CREATE',repeat('a',64));
select pg_temp.test_actor('66666666-6666-4666-8666-666666666666');
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
select pg_temp.test_actor('55555555-5555-4555-8555-555555555555');
select public.decide_group_join_request(g,r,'APPROVE') from invite_test_state;
select public.decide_group_join_request(g,r,'APPROVE') from invite_test_state;
do $$ begin
 if (select count(*) from public.group_members where group_id=(select g from invite_test_state))<>2 then raise exception 'Duplicate approval'; end if;
end $$;
select public.manage_group('{"userId":"66666666-6666-4666-8666-666666666666"}',g,'REMOVE_MEMBER') from invite_test_state;
select pg_temp.test_actor('66666666-6666-4666-8666-666666666666');
do $$ begin
 if public.use_group_invitation(repeat('a',64))->>'status'<>'NONE' then raise exception 'Removed member kept approval';end if;
 if public.use_group_invitation(repeat('a',64),true)->>'status'<>'PENDING' then raise exception 'Cannot request rejoining';end if;
end $$;
select pg_temp.test_actor('55555555-5555-4555-8555-555555555555');
select public.manage_group_invitation(g,'CREATE',repeat('b',64)) from invite_test_state;
do $$ begin
 if public.use_group_invitation(repeat('a',64))->>'valid'<>'false' then raise exception 'Regeneration failed'; end if;
end $$;
update public.group_invitations set expires_at=now()-interval '1 second' where group_id=(select g from invite_test_state);
do $$ begin if public.use_group_invitation(repeat('b',64))->>'valid'<>'false' then raise exception 'Expiration failed'; end if; end $$;
-- Currency mismatch must not add membership, and rejection can be resubmitted.
select public.manage_group_invitation(g,'CREATE',repeat('c',64)) from invite_test_state;
select pg_temp.test_actor('77777777-7777-4777-8777-777777777777');
select public.use_group_invitation(repeat('c',64),true);
update public.users set display_currency='INR' where id=auth.uid();
select pg_temp.test_actor('55555555-5555-4555-8555-555555555555');
do $$ declare req uuid;begin
 select id into req from public.group_join_requests where group_id=(select g from invite_test_state) and user_id='77777777-7777-4777-8777-777777777777';
 begin perform public.decide_group_join_request((select g from invite_test_state),req,'APPROVE');raise exception 'Currency mismatch accepted';exception when raise_exception then if sqlerrm='Currency mismatch accepted' then raise;end if;end;
 if exists(select 1 from public.group_members where group_id=(select g from invite_test_state) and user_id='77777777-7777-4777-8777-777777777777') then raise exception 'Failed approval added membership';end if;
 perform public.decide_group_join_request((select g from invite_test_state),req,'REJECT');
end $$;
select pg_temp.test_actor('77777777-7777-4777-8777-777777777777');
do $$ begin if public.use_group_invitation(repeat('c',64),true)->>'status'<>'PENDING' then raise exception 'Rejected request cannot retry';end if;end $$;
-- All invalid-token lookups also count toward the database-enforced limit.
do $$ declare i int;limited boolean=false;begin
 for i in 1..61 loop
 begin perform public.use_group_invitation(repeat('d',64));exception when raise_exception then if sqlerrm like 'Too many invitation requests%' then limited=true;exit;else raise;end if;end;
 end loop;
 if not limited then raise exception 'Rate limit was bypassed';end if;
end $$;
rollback;
