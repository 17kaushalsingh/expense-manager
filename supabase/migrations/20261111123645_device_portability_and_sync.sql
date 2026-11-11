-- RLS remains in force while exporting. A stable function uses one statement snapshot.
create function public.export_device_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t text; rows jsonb; result jsonb='{}'; total bigint=0;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 foreach t in array array['accounts','asset_valuations','audit_logs','bill_occurrences','budget_overrides','budget_plans','budgets','card_installments','card_settings','categories','currency_conversions','event_planned_costs','event_transactions','expense_drafts','expense_schedules','finance_events','finance_preferences','group_activity','group_join_requests','group_members','group_preferences','group_split_defaults','groups','loan_payments','monthly_plans','personal_assets','personal_bills','personal_entries','personal_loans','receipt_attachments','reminders','savings_goals','settlement_reversals','settlements','split_comments','split_expenses','split_participants','split_payers','split_templates','transaction_import_entries','transaction_imports','transactions','users'] loop
 if t='users' then select coalesce(jsonb_agg(to_jsonb(u)),'[]') into rows from public.users u where id=auth.uid();
 else execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]'') from (select * from public.%I limit 20001) r',t) into rows;end if;
 if jsonb_array_length(rows)>20000 then raise exception 'Snapshot exceeds 20000 records in %. No partial backup was produced',t;end if;
 total=total+octet_length(rows::text);if total>67108864 then raise exception 'Snapshot exceeds 64 MiB. No partial backup was produced';end if;
 result=result||jsonb_build_object(t,rows);
 end loop;
 -- Tokens/hashes are deliberately absent from the portable invitation metadata.
 select coalesce(jsonb_agg(to_jsonb(i)-'token_hash'),'[]') into rows from public.group_invitations i;
 return jsonb_build_object('version',1,'ownerId',auth.uid(),'createdAt',now(),'tables',result||jsonb_build_object('group_invitations',rows));
end $$;
revoke all on function public.export_device_snapshot() from public,anon;
grant execute on function public.export_device_snapshot() to authenticated;

create table public.device_commands(id uuid not null,user_id uuid not null references public.users,kind text not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(user_id,id));
alter table public.device_commands enable row level security;
revoke all on public.device_commands from public,anon,authenticated;
grant select on public.device_commands to authenticated;
create policy own_device_commands on public.device_commands for select to authenticated using(user_id=(select auth.uid()));
-- Commands are only committed with their ledger result. An ambiguous network retry is safe.
create function public.execute_device_command(p_id uuid,p_kind text,p_payload jsonb,p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.device_commands; h text; result jsonb; v uuid=(p_payload->>'id')::uuid; body jsonb=coalesce(p_payload->'input','{}'); expected timestamptz; target text; row_owner uuid; cat public.categories;
begin
 perform private.lock_ledger();
 if p_id is null or octet_length(p_payload::text)>524288 then raise exception 'Invalid device command';end if;
 h=encode(sha256(convert_to(p_kind||p_payload::text||coalesce(p_expected_updated_at::text,''),'UTF8')),'hex');
 select * into prior from public.device_commands where user_id=auth.uid() and id=p_id;
 if found then if prior.payload_hash<>h then raise exception 'Operation ID was already used for different data' using errcode='23505';end if;return prior.result;end if;
 if v is not null then
 target=case when p_kind like 'TX_%' then 'transactions' when p_kind like 'ACCOUNT_%' then 'accounts' when p_kind like 'CATEGORY_%' then 'categories' when p_kind like 'CONVERSION_%' then 'currency_conversions' when p_kind like 'SPLIT_%' then 'split_expenses' end;
 if target is not null then
 if target='split_expenses' then select updated_at into expected from public.split_expenses where id=v and private.can_read_split(id);
 else execute format('select updated_at from public.%I where id=$1 and user_id=$2',target) into expected using v,auth.uid();end if;
 if expected is null then raise exception 'Record unavailable' using errcode='42501';end if;
 if p_expected_updated_at is null or p_expected_updated_at<>expected then raise exception 'Record changed since the device snapshot. Review the latest version before retrying.' using errcode='23505';end if;
 end if;
 end if;
 case p_kind
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
 if body->>'type' is null or body->>'type' not in ('INCOME','EXPENSE','TRANSFER') then raise exception 'Invalid category';end if;
 insert into public.categories(user_id,name,type,parent_id) values(auth.uid(),trim(body->>'name'),body->>'type',(body->>'parentId')::uuid) returning * into cat;result=to_jsonb(cat);
 when 'CATEGORY_UPDATE' then
 update public.categories set name=trim(body->>'name'),type=body->>'type',parent_id=(body->>'parentId')::uuid where id=v and user_id=auth.uid() returning * into cat;
 if not found then raise exception 'Category unavailable' using errcode='42501';end if;result=to_jsonb(cat);
 when 'CATEGORY_DELETE' then
 delete from public.categories where id=v and user_id=auth.uid();if not found then raise exception 'Category unavailable' using errcode='42501';end if;result='{}';
 else raise exception 'This operation requires the online editor';
 end case;
 insert into public.device_commands(id,user_id,kind,payload_hash,result) values(p_id,auth.uid(),p_kind,h,result);
 return result;
end $$;
revoke all on function public.execute_device_command(uuid,text,jsonb,timestamptz) from public,anon;
grant execute on function public.execute_device_command(uuid,text,jsonb,timestamptz) to authenticated;
