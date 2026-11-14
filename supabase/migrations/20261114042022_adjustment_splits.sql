alter table public.split_expenses drop constraint split_expenses_split_type_check;
alter table public.split_expenses add constraint split_expenses_split_type_check
 check(split_type in ('EQUAL','EXACT','PERCENTAGE','SHARES','ADJUSTMENT'));
alter table public.split_expenses add column adjustments jsonb
 check(adjustments is null or jsonb_typeof(adjustments)='array');
alter table public.split_expenses add constraint adjustment_intent_required
 check(split_type<>'ADJUSTMENT' or adjustments is not null);

-- The client supplies signed extras; SQL independently derives exact shares.
-- Equal common portion = (total - sum(extras)) / participant count.
create function private.adjusted_split_input(p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
 total numeric:=(p->>'totalAmount')::numeric; parties jsonb:=p->'participants';
 party jsonb; uid uuid; extra numeric; count_users integer; extra_cents numeric:=0;
 numerator numeric; common_cents numeric; owed numeric; allocated numeric:=0;
 remainder integer; result jsonb:='[]'; i integer:=0;
begin
 if p->>'splitType' is distinct from 'ADJUSTMENT' then return p;end if;
 if not private.valid_money(total) or jsonb_typeof(parties) is distinct from 'array'
 or jsonb_array_length(parties) not between 1 and 100
 or (p->'itemization' is not null and p->'itemization'<>'null'::jsonb)
 then raise exception 'Adjustment splits need a valid total and unique participants; itemization cannot be combined';end if;
 count_users:=jsonb_array_length(parties);
 if exists(select 1 from jsonb_array_elements(parties) x group by x->>'userId' having count(*)>1) then raise exception 'Duplicate adjustment participants';end if;
 for party in select value from jsonb_array_elements(parties) loop
  uid:=(party->>'userId')::uuid; extra:=coalesce((party->>'shareValue')::numeric,0);
  if uid is null or abs(extra)>=1e12 or extra<>round(extra,2)
   or exists(select 1 from jsonb_object_keys(party) k where k not in ('userId','shareValue'))
  then raise exception 'Adjustments must contain participants and signed cent amounts only';end if;
  extra_cents:=extra_cents+extra*100;
 end loop;
 common_cents:=total*100-extra_cents;
 for party in select value from jsonb_array_elements(parties) loop
  extra:=coalesce((party->>'shareValue')::numeric,0);
  numerator:=common_cents+extra*100*count_users;
  if numerator<0 then raise exception 'Adjustments cannot make anyone''s final share negative';end if;
  owed:=floor(numerator/count_users);allocated:=allocated+owed;
  result:=result||jsonb_build_array(jsonb_build_object('userId',party->>'userId','shareValue',owed/100));
 end loop;
 remainder:=(total*100-allocated)::integer;
 for i in 0..count_users-1 loop
  if i<remainder then result:=jsonb_set(result,array[i::text,'shareValue'],to_jsonb((result->i->>'shareValue')::numeric+0.01));end if;
 end loop;
 return jsonb_set(jsonb_set(p,'{participants}',result),'{splitType}','"EXACT"');
end $$;
revoke all on function private.adjusted_split_input(jsonb) from public,anon,authenticated;

-- Retain the existing permission, recovery and settlement-history checks.
alter function public.create_split_expense_atomic(jsonb,uuid,boolean) rename to save_split_with_recovery;
alter function public.save_split_with_recovery(jsonb,uuid,boolean) set schema private;
revoke all on function private.save_split_with_recovery(jsonb,uuid,boolean) from public,anon,authenticated;
create function public.create_split_expense_atomic(p_input jsonb,p_id uuid default null,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; intent jsonb; normalized jsonb; expense_id uuid;
begin
 if auth.uid() is null or not private.session_active() then raise sqlstate 'PT401' using message='Authentication required';end if;
 perform private.lock_ledger();
 if p_delete then return private.save_split_with_recovery(p_input,p_id,true);end if;
 normalized:=private.adjusted_split_input(p_input);
 result:=private.save_split_with_recovery(normalized,p_id,false);
 expense_id:=(result->>'id')::uuid;
 if p_input->>'splitType'='ADJUSTMENT' then
  select jsonb_agg(jsonb_build_object('userId',p->>'userId','shareValue',coalesce((p->>'shareValue')::numeric,0)) order by n)
   into intent from jsonb_array_elements(p_input->'participants') with ordinality x(p,n);
  update public.split_expenses set split_type='ADJUSTMENT',adjustments=intent where id=expense_id;
  insert into public.audit_logs(entity_type,entity_id,user_id,action,changes)
   values('SplitAllocation',expense_id,auth.uid(),'ADJUSTMENT',jsonb_build_object('participants',intent,'totalAmount',p_input->'totalAmount'));
 else update public.split_expenses set adjustments=null where id=expense_id;end if;
 return result||jsonb_build_object('split_type',case when intent is null then result->>'split_type' else 'ADJUSTMENT' end,'adjustments',intent);
end $$;
revoke all on function public.create_split_expense_atomic(jsonb,uuid,boolean) from public,anon;
grant execute on function public.create_split_expense_atomic(jsonb,uuid,boolean) to authenticated;

-- Templates retain signed intent, including when a total is supplied later.
create or replace function private.validate_template(g uuid,p jsonb,complete boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare c text; n numeric:=(p->>'totalAmount')::numeric; k text:=p->>'splitType'; v jsonb; uid uuid; w numeric; total numeric:=0; paid numeric:=0; parties jsonb:='[]'; payers jsonb:='[]';
begin
 select currency into c from public.groups where id=g;
 if c is null then raise exception 'Group not found';end if;
 if coalesce(p->>'currency',c)<>c then raise exception 'Currency mismatch';end if;
 if nullif(trim(p->>'description'),'') is null or k is null or k not in ('EQUAL','EXACT','PERCENTAGE','SHARES','ADJUSTMENT') then raise exception 'Invalid template description or split mode';end if;
 if n is not null and not private.valid_money(n) then raise exception 'Invalid total';end if;
 if complete and n is null then raise exception 'A complete total is required';end if;
 if jsonb_typeof(p->'participants') is distinct from 'array' or jsonb_typeof(p->'payers') is distinct from 'array'
 or jsonb_array_length(p->'participants') not between 1 and 100 or jsonb_array_length(p->'payers') not between 1 and 100 then raise exception 'Participants and payers are required';end if;
 if exists(select 1 from jsonb_array_elements(p->'participants') x group by x->>'userId' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p->'payers') x group by x->>'userId' having count(*)>1) then raise exception 'Duplicate parties';end if;
 for v in select value from jsonb_array_elements((p->'participants')||(p->'payers')) loop
  uid:=(v->>'userId')::uuid;
  if not exists(select 1 from public.group_members m join public.users u on u.id=m.user_id where m.group_id=g and m.user_id=uid and u.display_currency=c) then raise exception 'A saved party is no longer a compatible group member';end if;
  if v ? 'accountId' or v ? 'categoryId' then raise exception 'Private account/category IDs cannot be saved in templates';end if;
 end loop;
 if p ? 'categoryId' or p ? 'accountId' then raise exception 'Private account/category IDs cannot be saved in templates';end if;
 for v in select value from jsonb_array_elements(p->'participants') loop
  w:=case when k='EQUAL' then 1 when k='ADJUSTMENT' then coalesce((v->>'shareValue')::numeric,0) else (v->>'shareValue')::numeric end;
  if w is null or abs(w)>=1e12 or (k<>'ADJUSTMENT' and w<0) or w<>round(w,4) or (k in ('EXACT','ADJUSTMENT') and w<>round(w,2)) then raise exception 'Invalid share';end if;
  total:=total+w;parties:=parties||jsonb_build_object('userId',v->>'userId','shareValue',w);
 end loop;
 if (k<>'ADJUSTMENT' and total<=0) or (k='PERCENTAGE' and total<>100) or (k='EXACT' and n is not null and total<>n) then raise exception 'Invalid allocation total';end if;
 if k='ADJUSTMENT' and n is not null then perform private.adjusted_split_input(p);end if;
 for v in select value from jsonb_array_elements(p->'payers') loop
  w:=(v->>'amountPaid')::numeric;
  if w is not null and not private.valid_money(w) then raise exception 'Invalid payer amount';end if;
  if n is not null and w is null then raise exception 'Payer amounts are required with a total';end if;
  paid:=paid+coalesce(w,0);payers:=payers||jsonb_strip_nulls(jsonb_build_object('userId',v->>'userId','amountPaid',w));
 end loop;
 if n is not null and paid<>n then raise exception 'Payments must equal total';end if;
 return jsonb_build_object('groupId',g,'currency',c,'description',trim(p->>'description'),'totalAmount',n,'splitType',k,'participants',parties,'payers',payers);
end $$;

-- Purchase conversion uses the same signed-adjustment review and accounting boundary.
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
 or p_input->>'splitType' is null or p_input->>'splitType' not in ('EQUAL','EXACT','PERCENTAGE','SHARES','ADJUSTMENT') or jsonb_typeof(p_input->'participants') is distinct from 'array'
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
