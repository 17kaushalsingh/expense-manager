-- Only existing private planning resources are writable here. Ledger tables are never accepted.
create function private.device_row_version(t text,k text,v uuid,expected text) returns void language plpgsql set search_path='' as $$
declare version text;
begin
 if t not in ('personal_loans','personal_bills','budget_plans','budget_overrides','monthly_plans','personal_assets','asset_valuations','savings_goals','finance_events','event_planned_costs','event_transactions','reminders','card_settings','card_installments','finance_preferences') or k not in ('id','account_id','user_id') then raise exception 'Unsupported device resource';end if;
 execute format('select xmin::text from public.%I where %I=$1 and user_id=$2',t,k) into version using v,auth.uid();
 if version is null then raise exception 'Record unavailable' using errcode='42501';end if;
 if expected is null or expected<>version then raise exception 'Record changed since the device snapshot. Refresh before replacing it.' using errcode='23505';end if;
end $$;
create function private.device_resource(t text,body jsonb,v uuid,expected text,remove boolean default false) returns jsonb language plpgsql set search_path='' as $$
declare k text;field text;cols text='';picks text='';updates text='';result jsonb;input jsonb;actual uuid;
begin
 if t not in ('budget_plans','budget_overrides','monthly_plans','personal_assets','asset_valuations','savings_goals','finance_events','event_planned_costs','event_transactions','reminders','card_settings','card_installments','finance_preferences') then raise exception 'Unsupported device resource';end if;
 k=case t when 'card_settings' then 'account_id' when 'finance_preferences' then 'user_id' else 'id' end;
 if v is not null then perform private.device_row_version(t,k,v,expected);end if;
 if remove then
 if v is null then raise exception 'Record ID required';end if;
 execute format('delete from public.%I where %I=$1 and user_id=$2 returning to_jsonb(%I)',t,k,t) into result using v,auth.uid();return result;
 end if;
 if jsonb_typeof(body)<>'object' or body='{}' then raise exception 'Choose resource fields';end if;
 for field in select jsonb_object_keys(body) loop
 if field in ('id','user_id','owner_id','creator_id','created_at','updated_at','row_version','recorded_transaction_id','deleted_at','source_type','source_id') or (field='transaction_id' and t not in ('card_installments','event_transactions')) or not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=field) then raise exception 'Unsupported field for device resource';end if;
 if cols<>'' then cols=cols||',';picks=picks||',';updates=updates||',';end if;
 cols=cols||format('%I',field);picks=picks||format('r.%I',field);updates=updates||format('%I=r.%I',field,field);
 end loop;
 input=body||jsonb_build_object('user_id',auth.uid());
 if v is null then
 execute format('insert into public.%I (%s,user_id) select %s,r.user_id from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I)||jsonb_build_object(''row_version'',xmin::text)',t,cols,picks,t,t) into result using input;
 else
 execute format('update public.%I d set %s from jsonb_populate_record(null::public.%I,$1) r where d.%I=$2 and d.user_id=$3 returning to_jsonb(d)||jsonb_build_object(''row_version'',d.xmin::text)',t,updates,t,k) into result using input,v,auth.uid();
 end if;
 return result||jsonb_build_object('id',result->>k);
end $$;
revoke all on function private.device_row_version(text,text,uuid,text),private.device_resource(text,jsonb,uuid,text,boolean) from public,anon,authenticated;

create or replace function public.execute_device_command(p_id uuid,p_kind text,p_payload jsonb,p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.device_commands; h text; result jsonb; v uuid=(p_payload->>'id')::uuid; body jsonb=coalesce(p_payload->'input','{}'); expected timestamptz; target text; row_owner uuid; cat public.categories;
begin
 perform private.lock_ledger();
 if (p_kind like '%_UPDATE' or p_kind like '%_DELETE') and v is null then raise exception 'Record ID is required';end if;
 if p_kind like '%_CREATE' and v is not null then raise exception 'New operations cannot replace an existing ID';end if;
 if p_id is null or octet_length(p_payload::text)>524288 then raise exception 'Invalid device command';end if;
 h=encode(sha256(convert_to(p_kind||p_payload::text||coalesce(p_expected_updated_at::text,''),'UTF8')),'hex');
 select * into prior from public.device_commands where user_id=auth.uid() and id=p_id;
 if found then if prior.payload_hash<>h then raise exception 'Operation ID was already used for different data' using errcode='23505';end if;return prior.result;end if;
 if v is not null then
 target=case when p_kind like 'TX_%' then 'transactions' when p_kind like 'ACCOUNT_%' then 'accounts' when p_kind like 'CATEGORY_%' then 'categories' when p_kind like 'CONVERSION_%' then 'currency_conversions' when p_kind like 'PERSONAL_ENTRY_%' then 'personal_entries' when p_kind like 'SPLIT_%' then 'split_expenses' end;
 if target is not null then
 if target='split_expenses' then select updated_at into expected from public.split_expenses where id=v and private.can_read_split(id);
 else execute format('select updated_at from public.%I where id=$1 and user_id=$2',target) into expected using v,auth.uid();end if;
 if expected is null then raise exception 'Record unavailable' using errcode='42501';end if;
 if p_expected_updated_at is null or p_expected_updated_at<>expected then raise exception 'Record changed since the device snapshot. Review the latest version before retrying.' using errcode='23505';end if;
 end if;
 end if;
 case p_kind
 when 'RESOURCE_SAVE' then result=private.device_resource(p_payload->>'table',body,v,p_payload->>'expectedVersion');
 when 'RESOURCE_DELETE' then result=private.device_resource(p_payload->>'table','{}',v,p_payload->>'expectedVersion',true);
 when 'LOAN_CREATE' then result=public.manage_personal_loan(body||jsonb_build_object('requestKey',p_id));
 when 'LOAN_ARCHIVE' then
 perform private.device_row_version('personal_loans','id',v,p_payload->>'expectedVersion');
 result=public.manage_personal_loan(body||jsonb_build_object('archived',true),v);
 when 'LOAN_PAY' then result=public.record_loan_payment(v,body||jsonb_build_object('requestKey',p_id));
 when 'LOAN_REVERSE' then result=public.reverse_loan_payment(v);
 when 'BILL_CREATE' then result=public.manage_personal_bill(body);
 when 'BILL_UPDATE' then
 perform private.device_row_version('personal_bills','id',v,p_payload->>'expectedVersion');
 result=public.manage_personal_bill(body,v);
 when 'BILL_REFRESH' then result=jsonb_build_object('generated',public.refresh_personal_bills());
 when 'BILL_RECORD','BILL_SKIP','BILL_REVERSE','BILL_POSTPONE' then
 select id into v from public.bill_occurrences where user_id=auth.uid() and bill_id=(p_payload->>'billId')::uuid and occurrence_index=(p_payload->>'occurrenceIndex')::int;
 if v is null then raise exception 'Refresh bill drafts before posting this occurrence';end if;
 result=public.review_bill_occurrence(v,substring(p_kind from 6),body);
 when 'TX_CREATE' then result=public.mutate_transaction_atomic(body);
 when 'TX_UPDATE' then result=public.mutate_transaction_atomic(body,v);
 when 'TX_DELETE' then result=public.mutate_transaction_atomic('{}',v,true);
 when 'ACCOUNT_CREATE' then result=public.manage_account(body);
 when 'ACCOUNT_UPDATE' then result=public.manage_account(body,v);
 when 'ACCOUNT_DELETE' then result=public.manage_account('{}',v,true);
 when 'TRANSFER' then result=public.transfer_accounts_atomic(body);
 when 'CONVERSION_CREATE' then result=public.mutate_currency_conversion(body||jsonb_build_object('requestKey',p_id));
 when 'CONVERSION_UPDATE' then result=public.mutate_currency_conversion(body,v);
 when 'CONVERSION_DELETE' then result=public.mutate_currency_conversion('{}',v,true);
 when 'PERSONAL_ENTRY_CREATE' then result=public.mutate_personal_entry(body||jsonb_build_object('requestKey',p_id));
 when 'PERSONAL_ENTRY_UPDATE' then result=public.mutate_personal_entry(body,v);
 when 'PERSONAL_ENTRY_DELETE' then result=public.mutate_personal_entry('{}',v,true);
 when 'SPLIT_CREATE' then result=public.create_split_expense_atomic(body);
 when 'SPLIT_UPDATE' then result=public.create_split_expense_atomic(body,v);
 when 'SPLIT_DELETE' then result=public.create_split_expense_atomic('{}',v,true);
 when 'SETTLEMENT' then result=public.execute_settlement_atomic(body);
 when 'CATEGORY_CREATE' then
 if length(trim(body->>'name')) not between 1 and 120 then raise exception 'Invalid category name';end if;
 if body->>'type' is null or body->>'type' not in ('INCOME','EXPENSE','TRANSFER') then raise exception 'Invalid category';end if;
 insert into public.categories(user_id,name,type,parent_id) values(auth.uid(),trim(body->>'name'),body->>'type',(body->>'parentId')::uuid) returning * into cat;result=to_jsonb(cat);
 when 'CATEGORY_UPDATE' then
 if length(trim(body->>'name')) not between 1 and 120 then raise exception 'Invalid category name';end if;
 update public.categories set name=trim(body->>'name'),type=body->>'type',parent_id=(body->>'parentId')::uuid where id=v and user_id=auth.uid() returning * into cat;
 if not found then raise exception 'Category unavailable' using errcode='42501';end if;result=to_jsonb(cat);
 when 'CATEGORY_DELETE' then
 delete from public.categories where id=v and user_id=auth.uid();if not found then raise exception 'Category unavailable' using errcode='42501';end if;result='{}';
 else raise exception 'This operation requires the online editor';
 end case;
 if p_kind in ('LOAN_CREATE','LOAN_ARCHIVE') then result=result||(select jsonb_build_object('row_version',xmin::text) from public.personal_loans where id=(result->>'id')::uuid and user_id=auth.uid());end if;
 if p_kind in ('BILL_CREATE','BILL_UPDATE') then result=result||(select jsonb_build_object('row_version',xmin::text) from public.personal_bills where id=(result->>'id')::uuid and user_id=auth.uid());end if;
 insert into public.device_commands(id,user_id,kind,payload_hash,result) values(p_id,auth.uid(),p_kind,h,result);
 return result;
end $$;

create or replace function public.export_device_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t text; rows jsonb; result jsonb='{}'; total bigint=0;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 foreach t in array array['accounts','asset_valuations','audit_logs','bill_occurrences','budget_overrides','budget_plans','budgets','card_installments','card_settings','categories','currency_conversions','event_planned_costs','event_transactions','expense_drafts','expense_schedules','finance_events','finance_preferences','group_activity','group_join_requests','group_members','group_preferences','group_split_defaults','groups','loan_payments','monthly_plans','personal_assets','personal_bills','personal_entries','personal_loans','receipt_attachments','reminders','savings_goals','settlement_reversals','settlements','split_comments','split_expenses','split_participants','split_payers','split_templates','transaction_import_entries','transaction_imports','transactions','users'] loop
 if t='currency_conversions' then
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('row_version',c.xmin::text,'exchange_rate',c.exchange_rate::text,'original_amount',c.original_amount::text,'base_amount',c.base_amount::text)),'[]') into rows from public.currency_conversions c;
 elsif t='users' then select coalesce(jsonb_agg(to_jsonb(u)||jsonb_build_object('row_version',u.xmin::text)),'[]') into rows from public.users u where id=auth.uid();
 else execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from (select *,xmin::text as row_version from public.%I limit 20001) r',t) into rows;end if;
 if jsonb_array_length(rows)>20000 then raise exception 'Snapshot exceeds 20000 records in %. No partial backup was produced',t;end if;
 total=total+octet_length(rows::text);if total>67108864 then raise exception 'Snapshot exceeds 64 MiB. No partial backup was produced';end if;
 result=result||jsonb_build_object(t,rows);
 end loop;
 -- Tokens/hashes are deliberately absent from the portable invitation metadata.
 rows=private.device_invitation_metadata();
 return jsonb_build_object('version',1,'ownerId',auth.uid(),'createdAt',now(),'tables',result||jsonb_build_object('group_invitations',rows));
end $$;
