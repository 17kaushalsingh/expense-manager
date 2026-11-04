-- Normalize download names at the database boundary, including direct RPC calls.
-- Files are always downloaded as attachments and use the registered media suffix.
create function private.receipt_filename() returns trigger language plpgsql set search_path='' as $$
declare ext text; base text;
begin
 ext=case new.mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'application/pdf' then 'pdf' end;
 base=left(regexp_replace(regexp_replace(new.file_name,'[[:cntrl:]/\\]','_','g'),'\.[^.]*$',''),140);
 new.file_name=coalesce(nullif(trim(base),''),'receipt')||'.'||ext;
 return new;
end $$;
revoke all on function private.receipt_filename() from public,anon,authenticated;
create trigger normalize_receipt_filename before insert on public.receipt_attachments for each row execute function private.receipt_filename();
alter policy readable_receipts on public.receipt_attachments using(private.receipt_target_access(transaction_id,split_id) and (status='READY' or uploader_id=(select auth.uid())));
alter table public.split_expenses add constraint itemization_size check(itemization is null or (jsonb_typeof(itemization)='object' and octet_length(itemization::text)<=200000));

create or replace function public.import_transactions_atomic(p_input jsonb,p_preview boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a public.accounts; batch uuid=(p_input->>'batchId')::uuid; previous public.transaction_imports;
 payload_hash text=encode(sha256(convert_to(p_input::text,'UTF8')),'hex'); row jsonb; prepared jsonb; rows jsonb='[]'; outcome jsonb;
 fingerprints text[]='{}'; fp text; dt timestamptz; n numeric; cat uuid; kind text; tz text;
 duplicate boolean; allow_duplicates boolean=coalesce((p_input->>'allowDuplicates')::boolean,false);
 created integer=0; skipped integer=0; tx jsonb;
begin
 perform private.lock_ledger();
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>512000 then raise exception 'Import payload is too large or invalid';end if;
 if batch is null then raise exception 'Import batch ID is required';end if;
 select * into previous from public.transaction_imports where id=batch;
 if found then
 if previous.user_id<>auth.uid() then raise exception 'Forbidden import batch' using errcode='42501';end if;
 if previous.payload_hash<>payload_hash then raise exception 'This import ID was already used for different rows';end if;
 return previous.result;
 end if;
 select timezone into tz from public.users where id=auth.uid();
 if tz is distinct from p_input->>'timezone' then raise exception 'Your timezone changed. Preview the import again';end if;
 select * into a from public.accounts where id=(p_input->>'accountId')::uuid and user_id=auth.uid();
 if not found or a.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') then raise exception 'Choose an owned cash, bank, card or other ordinary account' using errcode='42501';end if;
 if jsonb_typeof(p_input->'rows') is distinct from 'array' or jsonb_array_length(p_input->'rows') not between 1 and 500 then raise exception 'Import between 1 and 500 rows';end if;
 -- Validate the entire batch before writing. The same validation runs on preview
 -- and commit; a failed accounting operation rolls back all entries and balances.
 for row in select value from jsonb_array_elements(p_input->'rows') loop
 n=(row->>'amount')::numeric;kind=row->>'type';cat=(row->>'categoryId')::uuid;
 if not private.valid_money(n) or kind is null or kind not in ('INCOME','EXPENSE') then raise exception 'Invalid import amount or type';end if;
 if row->>'currency' is not null and row->>'currency'<>a.currency then raise exception 'Imported currency must match the selected account';end if;
 if length(coalesce(row->>'notes',''))>500 then raise exception 'Imported notes must be at most 500 characters';end if;
 if row->>'localDate' is not null then
 if row->>'localDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid import date';end if;
 dt=((row->>'localDate')::date+time '12:00') at time zone tz;
 if (dt at time zone tz)::date::text<>row->>'localDate' then raise exception 'This date does not exist in your timezone';end if;
 else
 if row->>'dateTime' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Import timestamps must have an explicit offset';end if;
 dt=(row->>'dateTime')::timestamptz;
 end if;
 if dt is null or not isfinite(dt) then raise exception 'Invalid import date';end if;
 perform private.check_category(cat,auth.uid(),kind);
 fp=encode(sha256(convert_to(jsonb_build_array(a.id,kind,round(n,2),to_char(dt at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),cat,coalesce(row->>'notes',''))::text,'UTF8')),'hex');
 duplicate=fp=any(fingerprints) or exists(select 1 from public.transaction_import_entries where user_id=auth.uid() and fingerprint=fp)
 or exists(select 1 from public.transactions t where t.user_id=auth.uid() and t.account_id=a.id and t.type=kind and t.amount=n and t.date_time=dt and t.category_id is not distinct from cat and coalesce(t.notes,'')=coalesce(row->>'notes',''));
 fingerprints=array_append(fingerprints,fp);
 prepared=jsonb_build_object('accountId',a.id,'currency',a.currency,'type',kind,'amount',n,'dateTime',dt,'categoryId',cat,'notes',coalesce(row->>'notes',''),'rowNumber',row->'rowNumber','fingerprint',fp,'duplicate',duplicate);
 rows=rows||jsonb_build_array(prepared);
 end loop;
 if p_preview then return jsonb_build_object('rows',rows,'timezone',tz);end if;
 insert into public.transaction_imports(id,user_id,payload_hash,result) values(batch,auth.uid(),payload_hash,'{}');
 for row in select value from jsonb_array_elements(rows) loop
 if (row->>'duplicate')::boolean and not allow_duplicates then skipped=skipped+1;continue;end if;
 tx=public.mutate_transaction_atomic(row);
 insert into public.transaction_import_entries(import_id,user_id,transaction_id,fingerprint) values(batch,auth.uid(),(tx->>'id')::uuid,row->>'fingerprint');
 created=created+1;
 end loop;
 outcome=jsonb_build_object('id',batch,'created',created,'skipped',skipped);
 update public.transaction_imports set result=outcome where id=batch;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('TransactionImport',batch,auth.uid(),'IMPORT',outcome);
 return outcome;
end $$;
revoke all on function public.import_transactions_atomic(jsonb,boolean) from public,anon;
grant execute on function public.import_transactions_atomic(jsonb,boolean) to authenticated;
