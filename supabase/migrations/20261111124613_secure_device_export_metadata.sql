create function private.device_invitation_metadata() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(i)-'token_hash'),'[]') from public.group_invitations i join public.groups g on g.id=i.group_id where g.owner_id=(select auth.uid())
$$;
revoke all on function private.device_invitation_metadata() from public,anon;
grant execute on function private.device_invitation_metadata() to authenticated;
create or replace function public.export_device_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
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
 rows=private.device_invitation_metadata();
 return jsonb_build_object('version',1,'ownerId',auth.uid(),'createdAt',now(),'tables',result||jsonb_build_object('group_invitations',rows));
end $$;
