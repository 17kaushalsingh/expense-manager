alter table public.receipt_attachments add column request_key uuid;
create unique index receipt_device_request on public.receipt_attachments(uploader_id,request_key) where request_key is not null;
create or replace function public.manage_receipt(p_action text,p_input jsonb default '{}',p_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.receipt_attachments; v uuid=gen_random_uuid(); t uuid; s uuid; ext text; mime text;
begin
 perform private.lock_ledger();
 if p_action='CREATE' then
 t=(p_input->>'transactionId')::uuid;s=(p_input->>'splitId')::uuid;
 if num_nonnulls(t,s)<>1 or not private.receipt_target_access(t,s,true) then raise exception 'Receipt target not found or forbidden' using errcode='42501';end if;
 if p_input->>'requestKey' is not null then
 select * into r from public.receipt_attachments where uploader_id=auth.uid() and request_key=(p_input->>'requestKey')::uuid;
 if found then
 if r.transaction_id is distinct from t or r.split_id is distinct from s or r.file_name is distinct from p_input->>'fileName' or r.mime_type is distinct from p_input->>'mimeType' or r.byte_size is distinct from (p_input->>'byteSize')::integer then raise exception 'Receipt request key was used for different data' using errcode='23505';end if;
 return to_jsonb(r);
 end if;
 end if;
 if (select count(*) from public.receipt_attachments where transaction_id=t or split_id=s)>=10 then raise exception 'An expense can have at most 10 receipts';end if;
 mime=p_input->>'mimeType';ext=case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'application/pdf' then 'pdf' end;
 if ext is null then raise exception 'Use a JPEG, PNG, WebP or PDF receipt';end if;
 insert into public.receipt_attachments(id,uploader_id,transaction_id,split_id,file_name,mime_type,byte_size,object_path,request_key)
 values(v,auth.uid(),t,s,p_input->>'fileName',mime,(p_input->>'byteSize')::integer,auth.uid()::text||'/'||v::text||'/receipt.'||ext,(p_input->>'requestKey')::uuid) returning * into r;
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

create or replace function public.export_device_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t text; rows jsonb; result jsonb='{}'; total bigint=0;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 foreach t in array array['accounts','asset_valuations','audit_logs','bill_occurrences','budget_overrides','budget_plans','budgets','card_installments','card_settings','categories','currency_conversions','event_planned_costs','event_transactions','expense_drafts','expense_schedules','finance_events','finance_preferences','group_activity','group_join_requests','group_members','group_preferences','group_split_defaults','groups','loan_payments','monthly_plans','personal_assets','personal_bills','personal_entries','personal_loans','receipt_attachments','reminders','savings_goals','settlement_reversals','settlements','split_comments','split_expenses','split_participants','split_payers','split_templates','transaction_import_entries','transaction_imports','transactions','users'] loop
 if t='currency_conversions' then
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('exchange_rate',c.exchange_rate::text,'original_amount',c.original_amount::text,'base_amount',c.base_amount::text)),'[]') into rows from public.currency_conversions c;
 elsif t='users' then select coalesce(jsonb_agg(to_jsonb(u)),'[]') into rows from public.users u where id=auth.uid();
 else execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from (select * from public.%I limit 20001) r',t) into rows;end if;
 if jsonb_array_length(rows)>20000 then raise exception 'Snapshot exceeds 20000 records in %. No partial backup was produced',t;end if;
 total=total+octet_length(rows::text);if total>67108864 then raise exception 'Snapshot exceeds 64 MiB. No partial backup was produced';end if;
 result=result||jsonb_build_object(t,rows);
 end loop;
 -- Tokens/hashes are deliberately absent from the portable invitation metadata.
 rows=private.device_invitation_metadata();
 return jsonb_build_object('version',1,'ownerId',auth.uid(),'createdAt',now(),'tables',result||jsonb_build_object('group_invitations',rows));
end $$;
