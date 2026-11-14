alter table private.purchase_split_links add column result_split_id uuid;
update private.purchase_split_links set result_split_id=split_id;
alter table private.purchase_split_links alter column result_split_id set not null;
create or replace function public.share_recorded_purchase(p_transaction_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); old public.transactions; account public.accounts; prior private.purchase_split_links;
 key uuid:=(p_input->>'requestKey')::uuid; expected timestamptz:=(p_input->>'expectedUpdatedAt')::timestamptz;
 group_id uuid:=(p_input->>'groupId')::uuid; category uuid:=(p_input->>'categoryId')::uuid;
 description text:=trim(p_input->>'description'); share_receipts boolean:=coalesce((p_input->>'shareReceipts')::boolean,false);
 fingerprint text; result jsonb; new_id uuid; funding_id uuid; reverse_first boolean;
begin
 if actor is null or not private.session_active() then raise sqlstate 'PT401' using message='Authentication required';end if;
 if key is null or expected is null or description is null or length(description) not between 1 and 200
 or p_input->>'splitType' is null or p_input->>'splitType' not in ('EQUAL','EXACT','PERCENTAGE','SHARES') or jsonb_typeof(p_input->'participants') is distinct from 'array'
 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('requestKey','expectedUpdatedAt','groupId','categoryId','description','splitType','participants','shareReceipts'))
 then raise exception 'Invalid purchase sharing input';end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('transactionId',p_transaction_id,'expected',expected,'groupId',group_id,'categoryId',category,'description',description,'splitType',p_input->>'splitType','participants',p_input->'participants','shareReceipts',share_receipts)::text,'sha256'),'hex');
 perform private.lock_ledger();
 select * into prior from private.purchase_split_links where user_id=actor and request_key=key;
 if found then
  if prior.input_hash<>fingerprint then raise exception 'Request key was already used for another purchase allocation' using errcode='23505';end if;
  if prior.split_id is null and not exists(select 1 from public.split_expenses where id=prior.result_split_id) then raise exception 'The converted shared expense has been deleted' using errcode='23505';end if;
  return jsonb_build_object('id',prior.result_split_id,'converted',true);
 end if;
 if not exists(select 1 from jsonb_array_elements(p_input->'participants') p where (p->>'userId')::uuid<>actor) then raise exception 'Choose at least one other participant';end if;
 if exists(select 1 from private.purchase_split_links where original_transaction_id=p_transaction_id and user_id=actor) then
  raise exception 'This purchase has already been shared' using errcode='23505';
 end if;
 select * into old from public.transactions where id=p_transaction_id and user_id=actor for update;
 if old.id is null then raise exception 'Purchase not found' using errcode='P0002';end if;
 if old.source_type<>'MANUAL' or old.type<>'EXPENSE' or old.linked_transaction_id is not null or not private.valid_money(old.amount) then raise exception 'Only a complete manual expense can be shared';end if;
 if old.updated_at is distinct from expected then raise exception 'Purchase changed since review. Refresh before sharing it.' using errcode='23505';end if;
 select * into account from public.accounts where id=old.account_id and user_id=actor for update;
 if account.id is null or account.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') or
  old.balance_delta<>(case when account.type in ('CREDIT_CARD','LOAN') then old.amount else -old.amount end) then raise exception 'Original account attribution is unavailable or changed';end if;
 if exists(select 1 from public.card_installments where transaction_id=old.id)
 or exists(select 1 from public.event_transactions where transaction_id=old.id)
 or exists(select 1 from public.event_planned_costs where recorded_transaction_id=old.id) then raise exception 'Remove event or installment links before sharing this purchase';end if;
 if exists(select 1 from public.receipt_attachments where transaction_id=old.id) and not share_receipts then raise exception 'Review and approve sharing the attached receipts first';end if;
 -- Keep the original row until its references are safely moved. Only one ledger
 -- effect survives the transaction. Choose an ordering that avoids a transient
 -- account-limit overflow even though the final cash balance is unchanged.
 reverse_first:=(account.balance-old.balance_delta)>-1e12 and (account.balance-old.balance_delta)<1e12;
 if reverse_first then update public.accounts set balance=balance-old.balance_delta where id=account.id;end if;
 result:=public.create_split_expense_atomic(jsonb_build_object('groupId',group_id,'description',description,'totalAmount',old.amount,
  'splitType',p_input->>'splitType','participants',p_input->'participants','categoryId',category,
  'date',old.date_time,'payers',jsonb_build_array(jsonb_build_object('userId',actor,'amountPaid',old.amount,'accountId',old.account_id))));
 new_id:=(result->>'id')::uuid;
 if not reverse_first then update public.accounts set balance=balance-old.balance_delta where id=account.id;end if;
 select id into funding_id from public.transactions where source_type='SPLIT' and source_id=new_id and user_id=actor
  and account_id=old.account_id and type='TRANSFER' and balance_delta=old.balance_delta;
 if funding_id is null then raise exception 'Converted payment attribution failed';end if;
 update public.receipt_attachments set transaction_id=null,split_id=new_id where transaction_id=old.id;
 update public.transaction_import_entries set transaction_id=funding_id where transaction_id=old.id and user_id=actor;
 update public.transactions set tags=old.tags,notes=coalesce(old.notes,description)
  where source_type='SPLIT' and source_id=new_id and user_id=actor;
 insert into private.purchase_split_links(original_transaction_id,user_id,request_key,input_hash,split_id,result_split_id,original_snapshot)
 values(old.id,actor,key,fingerprint,new_id,new_id,to_jsonb(old));
 delete from public.transactions where id=old.id and user_id=actor;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes)
 values('PurchaseSharing',old.id,actor,'CONVERT',jsonb_build_object('splitId',new_id,'before',to_jsonb(old),'sharedReceipts',share_receipts));
 return jsonb_build_object('id',new_id,'group_id',group_id,'converted',true);
end $$;
revoke all on function public.share_recorded_purchase(uuid,jsonb) from public,anon;
grant execute on function public.share_recorded_purchase(uuid,jsonb) to authenticated;
