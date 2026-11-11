alter table public.categories add column parent_id uuid references public.categories on delete set null;
create index categories_parent on public.categories(parent_id);
create function private.validate_category_parent() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(821141009);
 if new.parent_id is not null then
 if new.parent_id=new.id or not exists(select 1 from public.categories p where p.id=new.parent_id and p.parent_id is null and p.type=new.type and (p.user_id is null or p.user_id=auth.uid())) or exists(select 1 from public.categories where parent_id=new.id) then raise exception 'Choose an accessible top-level category of the same type';end if;
 end if;
 if tg_op='UPDATE' and new.type<>old.type and (exists(select 1 from public.categories where parent_id=new.id) or exists(select 1 from public.transactions where category_id=new.id) or exists(select 1 from public.budgets where category_id=new.id) or exists(select 1 from public.budget_plans where category_id=new.id)) then raise exception 'Category type cannot change while referenced';end if;
 return new;
end $$;
create trigger validate_parent before insert or update on public.categories for each row execute function private.validate_category_parent();
create function private.normalize_transaction_labels() returns trigger language plpgsql set search_path='' as $$
begin
 if new.tags is null then return new;end if;
 if jsonb_typeof(new.tags)<>'array' then raise exception 'Labels must be an array';end if;
 if jsonb_array_length(new.tags)>20 or exists(select 1 from jsonb_array_elements(new.tags) t where jsonb_typeof(t)<>'string' or length(trim(t#>>'{}')) not between 1 and 40) then raise exception 'Use at most 20 labels, each 1 to 40 characters';end if;
 select coalesce(jsonb_agg(t order by t),'[]') into new.tags from(select distinct lower(trim(t)) t from jsonb_array_elements_text(new.tags) t) x;
 return new;
end $$;
create trigger normalize_labels before insert or update of tags on public.transactions for each row execute function private.normalize_transaction_labels();
create function public.transaction_labels() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(label order by label),'[]') from(select distinct t.label from public.transactions x cross join lateral jsonb_array_elements_text(case when jsonb_typeof(x.tags)='array' then x.tags else '[]' end) t(label) where user_id=auth.uid()) q
$$;
create function public.bulk_manual_transactions(p_ids uuid[],p_input jsonb default '{}',p_delete boolean default false) returns int language plpgsql security definer set search_path='' as $$
declare t public.transactions;n int=0;
begin
 perform private.lock_ledger();
 if coalesce(cardinality(p_ids),0) not between 1 and 100 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'Choose 1 to 100 distinct entries';end if;
 if (select count(*) from public.transactions where id=any(p_ids) and user_id=auth.uid() and source_type='MANUAL')<>cardinality(p_ids) then raise exception 'Choose only your manual entries' using errcode='42501';end if;
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('categoryId','tags','notes')) then raise exception 'Unsupported bulk field';end if;
 for t in select * from public.transactions where id=any(p_ids) and user_id=auth.uid() order by id loop
 if p_delete then perform public.mutate_transaction_atomic('{}',t.id,true);
 else
 if p_input ? 'categoryId' then perform private.check_category((p_input->>'categoryId')::uuid,auth.uid(),t.type);end if;
 update public.transactions set category_id=case when p_input ? 'categoryId' then (p_input->>'categoryId')::uuid else category_id end,tags=case when p_input ? 'tags' then p_input->'tags' else tags end,notes=case when p_input ? 'notes' then p_input->>'notes' else notes end where id=t.id;
 insert into public.audit_logs(user_id,entity_type,entity_id,action,changes) values(auth.uid(),'Transaction',t.id,'BULK_UPDATE',p_input);
 end if;n=n+1;
 end loop;return n;
end $$;
alter table public.transactions drop constraint transactions_source_type_check;
alter table public.transactions add constraint transactions_source_type_check check(source_type in ('MANUAL','TRANSFER','SPLIT','SETTLEMENT','PERSONAL_LOAN','PERSONAL_BILL','PERSONAL_ENTRY'));
create table public.personal_entries (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 type text not null check(type in ('INCOME','EXPENSE')),total_amount numeric(14,2) not null check(total_amount>0),
 currency text not null,category_id uuid references public.categories on delete set null,date_time timestamptz not null,
 notes text not null default '' check(length(notes)<=2000),tags jsonb not null default '[]',
 request_key uuid not null,unique(user_id,request_key),deleted_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index personal_entries_owner on public.personal_entries(user_id);
create index personal_entries_category on public.personal_entries(category_id);
alter table public.personal_entries enable row level security;
revoke all on public.personal_entries from public,anon,authenticated;
grant select on public.personal_entries to authenticated;
create policy own_entries on public.personal_entries for select to authenticated using(user_id=(select auth.uid()));
create trigger touch_updated before update on public.personal_entries for each row execute function private.touch_updated();
create trigger audit_personal after insert or update or delete on public.personal_entries for each row execute function private.audit_personal_record();
create function public.mutate_personal_entry(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.personal_entries;r record;part jsonb;tx jsonb;n numeric;total numeric=0;c text;v uuid=coalesce(p_id,gen_random_uuid());
begin
 perform private.lock_ledger();
 if p_id is null then
 select * into e from public.personal_entries where user_id=auth.uid() and request_key=(p_input->>'requestKey')::uuid;
 if found then return to_jsonb(e);end if;
 else
 select * into e from public.personal_entries where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Personal entry not found' using errcode='P0002';end if;
 if e.deleted_at is not null then
 if p_delete then return to_jsonb(e);end if;raise exception 'This entry was deleted';end if;
 if exists(select 1 from public.receipt_attachments a join public.transactions t on t.id=a.transaction_id where t.source_type='PERSONAL_ENTRY' and t.source_id=e.id) then raise exception 'Remove receipts before replacing or deleting this entry';end if;
 if exists(select 1 from public.event_transactions a join public.transactions t on t.id=a.transaction_id where t.source_type='PERSONAL_ENTRY' and t.source_id=e.id) then raise exception 'Unlink event expenses before replacing or deleting this entry';end if;
 end if;
 if not p_delete then
 select display_currency into c from public.users where id=auth.uid();
 if jsonb_typeof(p_input->'allocations') is distinct from 'array' then raise exception 'Provide account allocations';end if;
 if jsonb_array_length(p_input->'allocations') not between 1 and 20 or (select count(distinct x->>'accountId') from jsonb_array_elements(p_input->'allocations') x)<>jsonb_array_length(p_input->'allocations') then raise exception 'Choose 1 to 20 distinct payment accounts';end if;
 for part in select * from jsonb_array_elements(p_input->'allocations') loop
 n=(part->>'amount')::numeric;if not private.valid_money(n) then raise exception 'Invalid account amount';end if;total=total+n;
 if not exists(select 1 from public.accounts where id=(part->>'accountId')::uuid and user_id=auth.uid() and currency=c and type not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE')) then raise exception 'Choose your own payment accounts';end if;
 end loop;
 if not private.valid_money(total) or total is distinct from (p_input->>'totalAmount')::numeric or p_input->>'currency' is distinct from c or p_input->>'type' not in ('INCOME','EXPENSE') then raise exception 'Account allocations must equal the total in your currency';end if;
 perform private.check_category((p_input->>'categoryId')::uuid,auth.uid(),p_input->>'type');
 end if;
 if p_id is not null then
 for r in select account_id,sum(balance_delta) delta from public.transactions where source_type='PERSONAL_ENTRY' and source_id=e.id and user_id=auth.uid() group by account_id loop update public.accounts set balance=balance-r.delta where id=r.account_id and user_id=auth.uid();end loop;
 delete from public.transactions where source_type='PERSONAL_ENTRY' and source_id=e.id and user_id=auth.uid();
 if p_delete then update public.personal_entries set deleted_at=now() where id=e.id returning * into e;return to_jsonb(e);end if;
 end if;
 if p_id is null then
 insert into public.personal_entries(id,user_id,type,total_amount,currency,category_id,date_time,notes,tags,request_key) values(v,auth.uid(),p_input->>'type',total,c,(p_input->>'categoryId')::uuid,(p_input->>'dateTime')::timestamptz,coalesce(p_input->>'notes',''),coalesce(p_input->'tags','[]'),(p_input->>'requestKey')::uuid) returning * into e;
 else update public.personal_entries set type=p_input->>'type',total_amount=total,category_id=(p_input->>'categoryId')::uuid,date_time=(p_input->>'dateTime')::timestamptz,notes=coalesce(p_input->>'notes',''),tags=coalesce(p_input->'tags','[]') where id=v returning * into e;end if;
 for part in select * from jsonb_array_elements(p_input->'allocations') loop
 tx=public.mutate_transaction_atomic(jsonb_build_object('accountId',part->>'accountId','amount',(part->>'amount')::numeric,'type',e.type,'categoryId',e.category_id,'dateTime',e.date_time,'notes',e.notes,'tags',e.tags));
 update public.transactions set source_type='PERSONAL_ENTRY',source_id=e.id where id=(tx->>'id')::uuid;
 end loop;
 -- Return the same canonical labels stored on component entries.
 update public.personal_entries set tags=(select tags from public.transactions where source_type='PERSONAL_ENTRY' and source_id=e.id limit 1) where id=e.id returning * into e;
 return to_jsonb(e);
end $$;
create or replace function private.receipt_target_access(t uuid,s uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from public.transactions where id=t and user_id=auth.uid() and source_type in ('MANUAL','PERSONAL_ENTRY','PERSONAL_BILL','PERSONAL_LOAN')) or (s is not null and case when write_access then exists(select 1 from public.split_expenses e where e.id=s and (e.creator_id=auth.uid() or exists(select 1 from public.groups g where g.id=e.group_id and g.owner_id=auth.uid()))) else private.can_read_split(s) end))
$$;
revoke all on function private.validate_category_parent(),private.normalize_transaction_labels() from public,anon,authenticated;
revoke all on function public.transaction_labels(),public.bulk_manual_transactions(uuid[],jsonb,boolean),public.mutate_personal_entry(jsonb,uuid,boolean) from public,anon;
grant execute on function public.transaction_labels(),public.bulk_manual_transactions(uuid[],jsonb,boolean),public.mutate_personal_entry(jsonb,uuid,boolean) to authenticated;
