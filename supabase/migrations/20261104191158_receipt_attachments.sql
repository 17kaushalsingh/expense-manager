-- Private receipt metadata is separate from financial entries. Financial records
-- with receipts cannot be deleted until their files are explicitly removed.
create table public.receipt_attachments (
 id uuid primary key default gen_random_uuid(), uploader_id uuid not null references public.users,
 transaction_id uuid references public.transactions, split_id uuid references public.split_expenses,
 file_name text not null check(length(file_name) between 1 and 160),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 byte_size integer not null check(byte_size between 1 and 5242880),
 object_path text not null unique, status text not null default 'PENDING' check(status in ('PENDING','READY')),
 created_at timestamptz not null default now(), check(num_nonnulls(transaction_id,split_id)=1)
);
create index receipts_transaction on public.receipt_attachments(transaction_id);
create index receipts_split on public.receipt_attachments(split_id);
create index receipts_uploader on public.receipt_attachments(uploader_id);
alter table public.receipt_attachments enable row level security;
revoke all on public.receipt_attachments from public,anon,authenticated;
grant select on public.receipt_attachments to authenticated;

create function private.receipt_target_access(t uuid,s uuid,write_access boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 exists(select 1 from public.transactions where id=t and user_id=auth.uid() and source_type='MANUAL')
 or (s is not null and case when write_access then exists(
 select 1 from public.split_expenses e where e.id=s and (e.creator_id=auth.uid() or exists(select 1 from public.groups g where g.id=e.group_id and g.owner_id=auth.uid())))
 else private.can_read_split(s) end))
$$;
create function private.receipt_access(p_path text,p_write boolean default false,p_upload boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.receipt_attachments r where r.object_path=p_path
 and private.receipt_target_access(r.transaction_id,r.split_id,p_write)
 and (not p_upload or (r.status='PENDING' and r.uploader_id=auth.uid()))
 and (p_write or r.status='READY' or r.uploader_id=auth.uid()))
$$;
revoke all on function private.receipt_target_access(uuid,uuid,boolean),private.receipt_access(text,boolean,boolean) from public,anon;
grant execute on function private.receipt_target_access(uuid,uuid,boolean),private.receipt_access(text,boolean,boolean) to authenticated;
create policy readable_receipts on public.receipt_attachments for select to authenticated
using(private.receipt_target_access(transaction_id,split_id) and (status='READY' or uploader_id=auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receipts','receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy receipt_objects_read on storage.objects for select to authenticated
using(bucket_id='receipts' and private.receipt_access(name));
create policy receipt_objects_insert on storage.objects for insert to authenticated
with check(bucket_id='receipts' and private.receipt_access(name,true,true));
create policy receipt_objects_delete on storage.objects for delete to authenticated
using(bucket_id='receipts' and private.receipt_access(name,true));

create function public.manage_receipt(p_action text,p_input jsonb default '{}',p_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.receipt_attachments; v uuid=gen_random_uuid(); t uuid; s uuid; ext text; mime text;
begin
 perform private.lock_ledger();
 if p_action='CREATE' then
 t=(p_input->>'transactionId')::uuid;s=(p_input->>'splitId')::uuid;
 if num_nonnulls(t,s)<>1 or not private.receipt_target_access(t,s,true) then raise exception 'Receipt target not found or forbidden' using errcode='42501';end if;
 if (select count(*) from public.receipt_attachments where transaction_id=t or split_id=s)>=10 then raise exception 'An expense can have at most 10 receipts';end if;
 mime=p_input->>'mimeType';ext=case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'application/pdf' then 'pdf' end;
 if ext is null then raise exception 'Use a JPEG, PNG, WebP or PDF receipt';end if;
 insert into public.receipt_attachments(id,uploader_id,transaction_id,split_id,file_name,mime_type,byte_size,object_path)
 values(v,auth.uid(),t,s,p_input->>'fileName',mime,(p_input->>'byteSize')::integer,auth.uid()::text||'/'||v::text||'/receipt.'||ext) returning * into r;
 else
 select * into r from public.receipt_attachments where id=p_id;
 if not found or not private.receipt_target_access(r.transaction_id,r.split_id,true) then raise exception 'Receipt not found or forbidden' using errcode='42501';end if;
 if p_action='COMPLETE' then
 if r.uploader_id<>auth.uid() then raise exception 'Only the uploader can complete a receipt' using errcode='42501';end if;
 if not exists(select 1 from storage.objects where bucket_id='receipts' and name=r.object_path and (metadata->>'size')::bigint=r.byte_size and metadata->>'mimetype'=r.mime_type) then raise exception 'Upload is missing or does not match the registered file';end if;
 update public.receipt_attachments set status='READY' where id=r.id returning * into r;
 elsif p_action='DELETE' then
 if exists(select 1 from storage.objects where bucket_id='receipts' and name=r.object_path) then raise exception 'Remove the stored file before deleting its receipt metadata';end if;
 delete from public.receipt_attachments where id=r.id;
 else raise exception 'Unknown receipt operation';end if;
 end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('Receipt',r.id,auth.uid(),p_action);
 return to_jsonb(r);
end $$;
revoke all on function public.manage_receipt(text,jsonb,uuid) from public,anon;
grant execute on function public.manage_receipt(text,jsonb,uuid) to authenticated;

-- Update in place: deleting/recreating an edited transaction would break receipt
-- foreign keys and import provenance. All validation precedes balance changes.
create or replace function public.mutate_transaction_atomic(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.transactions; a public.accounts; n numeric; t text; d numeric; tx uuid; cat uuid; dt timestamptz;
begin
 perform private.lock_ledger();
 if p_id is not null then
 select * into old from public.transactions where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Transaction not found' using errcode='P0002';end if;
 if old.source_type<>'MANUAL' then raise exception 'Generated entries must be changed through their source';end if;
 end if;
 if p_delete then
 if p_id is null then raise exception 'Transaction ID is required';end if;
 if exists(select 1 from public.receipt_attachments where transaction_id=p_id) then raise exception 'Remove the receipts before deleting this transaction';end if;
 update public.accounts set balance=balance-old.balance_delta where id=old.account_id;
 delete from public.transactions where id=p_id;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('Transaction',p_id,auth.uid(),'DELETE');
 return '{}'::jsonb;
 end if;
 select * into a from public.accounts where id=(p_input->>'accountId')::uuid and user_id=auth.uid();
 if not found or a.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') then raise exception 'Account not found or reserved';end if;
 n=(p_input->>'amount')::numeric;t=p_input->>'type';cat=(p_input->>'categoryId')::uuid;dt=(p_input->>'dateTime')::timestamptz;
 if not private.valid_money(n) or t is null or t not in ('INCOME','EXPENSE') or dt is null or not isfinite(dt) then raise exception 'Invalid manual transaction';end if;
 perform private.check_category(cat,auth.uid(),t);
 d=case when (t='INCOME')<>(a.type in ('CREDIT_CARD','LOAN')) then n else -n end;
 if p_id is null then
 tx=private.entry(auth.uid(),a.id,t,n,d,n,'MANUAL',null,dt,p_input->>'notes',cat);
 update public.transactions set tags=p_input->'tags',attachments=p_input->'attachments' where id=tx;
 else
 tx=p_id;
 update public.accounts set balance=balance-old.balance_delta where id=old.account_id;
 update public.accounts set balance=balance+d where id=a.id;
 update public.transactions set account_id=a.id,category_id=cat,type=t,amount=n,balance_delta=d,analytics_amount=n,date_time=dt,notes=p_input->>'notes',tags=coalesce(p_input->'tags',tags),attachments=coalesce(p_input->'attachments',attachments) where id=tx;
 end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('Transaction',tx,auth.uid(),case when p_id is null then 'CREATE' else 'UPDATE' end);
 return (select to_jsonb(x) from public.transactions x where id=tx);
end $$;
