-- Removed members can request admission again; prior approval is not membership.
create or replace function public.use_group_invitation(p_token text,p_request boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
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
 on conflict(group_id,user_id) do update set invitation_id=excluded.invitation_id,status='PENDING',created_at=now(),decided_at=null where group_join_requests.status in ('REJECTED','APPROVED');
 end if;
 select * into r from public.group_join_requests where group_id=g.id and user_id=auth.uid();
 return jsonb_build_object('valid',true,'groupId',g.id,'name',g.name,'currency',g.currency,'status',case when member then 'APPROVED' else case when r.status='APPROVED' then 'NONE' else coalesce(r.status,'NONE') end end);
end $$;

-- Group members may record a group expense without allocating a share to themselves.
-- Ad-hoc expenses still require creator involvement; membership/account checks stay intact.
create or replace function public.create_split_expense_atomic(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s uuid=coalesce(p_id,gen_random_uuid()); g uuid=(p_input->>'groupId')::uuid; c text; creator uuid=auth.uid();
 old public.split_expenses; n numeric; kind text; dt timestamptz; cat uuid; description text;
 party jsonb; uid uuid; a uuid; paid numeric; owed numeric; share numeric; sum_paid numeric=0; sum_shares numeric=0;
 count_part integer; idx integer=0; allocated numeric=0; cents numeric; remainder integer;
 before_state jsonb; affected uuid[]='{}';
begin
 perform private.lock_ledger();
 if p_id is not null then
 select * into old from public.split_expenses where id=p_id;
 if not found then raise exception 'Split not found' using errcode='P0002'; end if;
 if old.creator_id<>auth.uid() and not exists(select 1 from public.groups where id=old.group_id and owner_id=auth.uid()) then raise exception 'Forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.settlements where group_id is not distinct from old.group_id) then raise exception 'Cannot change expenses after settlement'; end if;
 before_state=to_jsonb(old); creator=old.creator_id;
 select array_agg(distinct user_id) into affected from (select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s) old_parties;
 perform private.reverse_split(s);
 if p_delete then
 delete from public.split_expenses where id=s;
 foreach uid in array affected loop perform private.reconcile_virtual(uid,old.currency,'SPLIT',s,now());end loop;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('SplitExpense',s,auth.uid(),'DELETE',before_state);
 return '{}'::jsonb;
 end if;
 if g is distinct from old.group_id then raise exception 'Cannot move an expense to another group'; end if;
 end if;
 if g is not null then
 if not private.is_member(g) then raise exception 'Group not found' using errcode='42501'; end if;
 select currency into c from public.groups where id=g;
 else select display_currency into c from public.users where id=auth.uid(); end if;
 n=(p_input->>'totalAmount')::numeric; kind=p_input->>'splitType'; dt=coalesce((p_input->>'date')::timestamptz,now());
 description=trim(p_input->>'description'); cat=(p_input->>'categoryId')::uuid;
 if not private.valid_money(n) or length(description)=0 or description is null or kind not in ('EQUAL','EXACT','PERCENTAGE','SHARES') then raise exception 'Invalid expense'; end if;
 perform private.check_category(cat,auth.uid(),'EXPENSE');
 count_part=jsonb_array_length(p_input->'participants');
 if count_part is null or count_part<1 or coalesce(jsonb_array_length(p_input->'payers'),0)<1 then raise exception 'Payers and participants are required'; end if;
 if exists(select 1 from jsonb_array_elements(p_input->'payers') p group by p->>'userId' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_input->'participants') p group by p->>'userId' having count(*)>1) then raise exception 'Duplicate parties'; end if;
 if g is null and not exists(select 1 from jsonb_array_elements((p_input->'payers')||(p_input->'participants')) p where p->>'userId'=creator::text) then raise exception 'Creator must be involved'; end if;
 for party in select value from jsonb_array_elements((p_input->'payers')||(p_input->'participants')) loop
 uid=(party->>'userId')::uuid;
 if not exists(select 1 from public.users where id=uid and display_currency=c) then raise exception 'All parties must use the same currency'; end if;
 if g is not null and not exists(select 1 from public.group_members where group_id=g and user_id=uid) then raise exception 'Party is not a group member'; end if;
 end loop;
 for party in select value from jsonb_array_elements(p_input->'payers') loop
 paid=(party->>'amountPaid')::numeric;
 if not private.valid_money(paid) then raise exception 'Invalid payer amount'; end if;
 sum_paid=sum_paid+paid;
 end loop;
 if sum_paid<>n then raise exception 'Payments must equal total'; end if;
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 share=case when kind='EQUAL' then 1 else (party->>'shareValue')::numeric end;
 if share is null or share<0 or share<>round(share,4) then raise exception 'Invalid share'; end if;
 if kind='EXACT' and share<>round(share,2) then raise exception 'Exact shares must be cents'; end if;
 sum_shares=sum_shares+share;
 end loop;
 if (kind='EXACT' and sum_shares<>n) or (kind='PERCENTAGE' and sum_shares<>100) or sum_shares<=0 then raise exception 'Invalid share total'; end if;
 if p_id is null then
 insert into public.split_expenses(id,group_id,creator_id,description,currency,total_amount,split_type,date,category_id) values(s,g,creator,description,c,n,kind,dt,cat);
 else update public.split_expenses set description=trim(p_input->>'description'),total_amount=n,split_type=kind,date=dt,category_id=cat where id=s; end if;
 -- Floor proportional allocations and distribute remaining cents by input order.
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 share=case when kind='EQUAL' then 1 else (party->>'shareValue')::numeric end;
 owed=case when kind='EXACT' then share else floor(n*100*share/sum_shares)/100 end;
 allocated=allocated+owed;
 insert into public.split_participants(split_expense_id,user_id,share_value,amount_owed) values(s,(party->>'userId')::uuid,share,owed);
 end loop;
 remainder=((n-allocated)*100)::integer;
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 if idx<remainder then update public.split_participants set amount_owed=amount_owed+0.01 where split_expense_id=s and user_id=(party->>'userId')::uuid; end if;
 idx=idx+1;
 end loop;
 for party in select value from jsonb_array_elements(p_input->'payers') loop
 uid=(party->>'userId')::uuid; paid=(party->>'amountPaid')::numeric;
 if uid=auth.uid() and party->>'accountId' is not null then
 select id into a from public.accounts where id=(party->>'accountId')::uuid and user_id=uid and currency=c and type not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE');
 if a is null then raise exception 'Payer account not found'; end if;
 elsif party->>'accountId' is not null and uid<>auth.uid() then raise exception 'Cannot choose another user account';
 else a=private.default_account(uid,'CASH',c); end if;
 insert into public.split_payers(split_expense_id,user_id,amount_paid,account_id) values(s,uid,paid,a);
 perform private.entry(uid,a,'TRANSFER',paid,case when (select type from public.accounts where id=a) in ('CREDIT_CARD','LOAN') then paid else -paid end,0,'SPLIT',s,dt,'Payment: '||description);
 end loop;
 for uid in select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s loop
 select coalesce(sum(amount_paid),0) into paid from public.split_payers where split_expense_id=s and user_id=uid;
 select coalesce(sum(amount_owed),0) into owed from public.split_participants where split_expense_id=s and user_id=uid;
 -- One personal expense record, with no duplicate cash effect.
 if owed>0 then
 a=private.default_account(uid,'CASH',c);
 perform private.entry(uid,a,'EXPENSE',owed,0,owed,'SPLIT',s,dt,'Share: '||description,case when uid=auth.uid() then cat else null end);
 end if;
 end loop;
 for uid in select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s union select unnest(affected) loop
 perform private.reconcile_virtual(uid,c,'SPLIT',s,dt);
 end loop;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('SplitExpense',s,auth.uid(),case when p_id is null then 'CREATE' else 'UPDATE' end,jsonb_build_object('before',before_state,'after',p_input));
 return (select to_jsonb(e)||jsonb_build_object('payers',(select jsonb_agg(to_jsonb(p)) from public.split_payers p where split_expense_id=s),'participants',(select jsonb_agg(to_jsonb(p)) from public.split_participants p where split_expense_id=s)) from public.split_expenses e where id=s);
end $$;
