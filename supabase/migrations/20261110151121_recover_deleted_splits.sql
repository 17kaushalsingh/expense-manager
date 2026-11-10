-- Private snapshots include financial account attribution and are never exposed.
create table private.deleted_splits (
 id uuid primary key, group_id uuid, creator_id uuid not null,
 party_ids uuid[] not null, snapshot jsonb not null,
 deleted_by uuid not null, deleted_at timestamptz not null default now(), restored_at timestamptz
);
alter table private.deleted_splits enable row level security;
revoke all on private.deleted_splits from public,anon,authenticated;
create index deleted_splits_parties on private.deleted_splits using gin(party_ids);
create index deleted_splits_creator on private.deleted_splits(creator_id);
-- Retain the existing trusted accounting implementation behind an auth-checking wrapper.
alter function public.create_split_expense_atomic(jsonb,uuid,boolean) set schema private;
revoke all on function private.create_split_expense_atomic(jsonb,uuid,boolean) from public,anon,authenticated;
create function public.create_split_expense_atomic(p_input jsonb,p_id uuid default null,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.split_expenses; saved jsonb; parties uuid[];
begin
 perform private.lock_ledger();
 if p_delete and p_id is not null then
  select * into s from public.split_expenses where id=p_id;
  if s.id is not null then
   select array_agg(distinct user_id) into parties from (select user_id from public.split_payers where split_expense_id=p_id union select user_id from public.split_participants where split_expense_id=p_id) p;
   saved=jsonb_build_object('expense',to_jsonb(s),
    'payers',coalesce((select jsonb_agg(to_jsonb(p)) from public.split_payers p where split_expense_id=p_id),'[]'),
    'participants',coalesce((select jsonb_agg(to_jsonb(p)) from public.split_participants p where split_expense_id=p_id),'[]'),
    'comments',coalesce((select jsonb_agg(to_jsonb(c)) from public.split_comments c where split_expense_id=p_id),'[]'),
    'entries',coalesce((select jsonb_agg(to_jsonb(t)) from public.transactions t join public.accounts a on a.id=t.account_id where t.source_type='SPLIT' and t.source_id=p_id and a.type not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE')),'[]'));
   -- Authorization and settlement restrictions run in the original engine; any
   -- failure rolls back this snapshot along with the attempted financial change.
   insert into private.deleted_splits(id,group_id,creator_id,party_ids,snapshot,deleted_by)
   values(p_id,s.group_id,s.creator_id,parties,saved,auth.uid())
   on conflict(id) do update set snapshot=excluded.snapshot,party_ids=excluded.party_ids,deleted_by=excluded.deleted_by,deleted_at=now(),restored_at=null;
  end if;
 end if;
 return private.create_split_expense_atomic(p_input,p_id,p_delete);
end $$;
create function public.deleted_split_expenses(p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501';end if;
 if p_limit not between 1 and 100 or p_offset not between 0 and 1000000 then raise exception 'Invalid pagination';end if;
 with visible as (
 select d.* from private.deleted_splits d where restored_at is null
 and (group_id is null or private.is_member(group_id))
 and (creator_id=auth.uid() or auth.uid()=any(party_ids) or exists(select 1 from public.groups g where g.id=d.group_id and g.owner_id=auth.uid()))
 ) select (select count(*) from visible),coalesce((select jsonb_agg(x) from (
 select id,group_id,snapshot->'expense'->>'description' description,snapshot->'expense'->>'currency' currency,
 (snapshot->'expense'->>'total_amount')::numeric total_amount,deleted_at from visible order by deleted_at desc,id limit p_limit offset p_offset
 ) x),'[]') into total,result;
 return jsonb_build_object('items',result,'total',total);
end $$;
create function public.restore_split_expense_atomic(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.deleted_splits; s public.split_expenses; p jsonb; t public.transactions; a public.accounts; uid uuid; cat uuid;
begin
 perform private.lock_ledger();
 select * into d from private.deleted_splits where id=p_id;
 if d.id is null then raise exception 'Deleted expense not found' using errcode='P0002';end if;
 if not (d.creator_id=auth.uid() or auth.uid()=any(d.party_ids) or exists(select 1 from public.groups where id=d.group_id and owner_id=auth.uid()))
 or (d.group_id is not null and not private.is_member(d.group_id)) then raise exception 'Expense recovery permission required' using errcode='42501';end if;
 if d.restored_at is not null then return jsonb_build_object('id',p_id,'restored',true);end if;
 s=jsonb_populate_record(null::public.split_expenses,d.snapshot->'expense');
 if d.group_id is not null and not exists(select 1 from public.groups where id=d.group_id and currency=s.currency) then raise exception 'Original group or currency is unavailable';end if;
 if exists(select 1 from public.settlements where group_id is not distinct from d.group_id) then raise exception 'Cannot restore expenses after settlement';end if;
 foreach uid in array d.party_ids loop
  if not exists(select 1 from public.users where id=uid and display_currency=s.currency) then raise exception 'An original participant has an incompatible currency';end if;
  if d.group_id is not null and not exists(select 1 from public.group_members where group_id=d.group_id and user_id=uid) then raise exception 'An original participant is no longer a group member';end if;
 end loop;
 -- Every original nonvirtual account must still exist with its original owner.
 for p in select value from jsonb_array_elements(d.snapshot->'entries') loop
  t=jsonb_populate_record(null::public.transactions,p);
  select * into a from public.accounts where id=t.account_id and user_id=t.user_id and currency=s.currency and type not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE');
  if a.id is null then raise exception 'An original account is unavailable; recovery cannot change account attribution';end if;
 end loop;
 if not exists(select 1 from public.categories where id=s.category_id) then s.category_id=null;end if;
 insert into public.split_expenses select s.*;
 insert into public.split_payers select * from jsonb_populate_recordset(null::public.split_payers,d.snapshot->'payers');
 insert into public.split_participants select * from jsonb_populate_recordset(null::public.split_participants,d.snapshot->'participants');
 insert into public.split_comments select * from jsonb_populate_recordset(null::public.split_comments,d.snapshot->'comments');
 for p in select value from jsonb_array_elements(d.snapshot->'entries') loop
  t=jsonb_populate_record(null::public.transactions,p);
  cat=t.category_id;if not exists(select 1 from public.categories where id=cat) then cat=null;end if;
  perform private.entry(t.user_id,t.account_id,t.type,t.amount,t.balance_delta,t.analytics_amount,'SPLIT',p_id,t.date_time,t.notes,cat);
 end loop;
 foreach uid in array d.party_ids loop perform private.reconcile_virtual(uid,s.currency,'SPLIT',p_id,now());end loop;
 update private.deleted_splits set restored_at=now() where id=p_id;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('SplitExpense',p_id,auth.uid(),'RESTORE');
 return jsonb_build_object('id',p_id,'restored',true);
end $$;
revoke all on function public.create_split_expense_atomic(jsonb,uuid,boolean),public.deleted_split_expenses(integer,integer),public.restore_split_expense_atomic(uuid) from public,anon;
grant execute on function public.create_split_expense_atomic(jsonb,uuid,boolean),public.deleted_split_expenses(integer,integer),public.restore_split_expense_atomic(uuid) to authenticated;
