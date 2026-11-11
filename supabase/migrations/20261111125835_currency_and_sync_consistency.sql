create or replace function public.manage_account(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.accounts; c text; s uuid=coalesce(p_id,gen_random_uuid()); t text; n numeric;
begin
 perform private.lock_ledger();
 select display_currency into c from public.users where id=auth.uid();
 if p_id is not null then
 select * into a from public.accounts where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Account not found' using errcode='P0002'; end if;
 if a.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') or a.is_default then raise exception 'System accounts cannot be modified'; end if;
 if p_delete then delete from public.accounts where id=p_id; return '{}'::jsonb; end if;
 if exists(select 1 from public.transactions where account_id=p_id) and (p_input ? 'balance' or (p_input ? 'type' and p_input->>'type'<>a.type)) then raise exception 'Cannot change balance or type after transactions'; end if;
 end if;
 if coalesce(p_input->>'currency',c)<>c then raise exception 'Account currency must match profile'; end if;
 t=coalesce(p_input->>'type',a.type); n=coalesce((p_input->>'balance')::numeric,a.balance,0);
 if ((p_id is null or p_input ? 'balance') and n<>round(n,2)) or abs(n)>=1000000000000 then raise exception 'Invalid balance'; end if;
 if t is null or t not in ('CASH','BANK_ACCOUNT','PREPAID_CARD','INVESTMENT','CREDIT_CARD','LOAN') then raise exception 'Invalid account type'; end if;
 if p_id is null then
 insert into public.accounts(id,user_id,name,type,currency,balance,metadata) values(s,auth.uid(),trim(p_input->>'name'),t,c,n,p_input->'metadata');
 else update public.accounts set name=coalesce(trim(p_input->>'name'),a.name),type=t,balance=n,metadata=coalesce(p_input->'metadata',a.metadata) where id=s; end if;
 return (select to_jsonb(x) from public.accounts x where id=s);
end $$;

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
 insert into public.device_commands(id,user_id,kind,payload_hash,result) values(p_id,auth.uid(),p_kind,h,result);
 return result;
end $$;
