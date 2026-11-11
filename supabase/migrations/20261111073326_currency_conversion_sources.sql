-- Original money and rates are source records; ledger amounts always use the owner's accounting currency.
create table public.currency_units(code text primary key check(code ~ '^[A-Z]{3}$'),minor_units integer not null check(minor_units between 0 and 4));
insert into public.currency_units values ('AED',2),('AFN',0),('ALL',0),('AMD',2),('ANG',2),('AOA',2),('ARS',2),('AUD',2),('AWG',2),('AZN',2),('BAM',2),('BBD',2),('BDT',2),('BGN',2),('BHD',3),('BIF',0),('BMD',2),('BND',2),('BOB',2),('BRL',2),('BSD',2),('BTN',2),('BWP',2),('BYN',2),('BZD',2),('CAD',2),('CDF',2),('CHF',2),('CLP',0),('CNY',2),('COP',0),('CRC',2),('CUC',2),('CUP',2),('CVE',2),('CZK',2),('DJF',0),('DKK',2),('DOP',2),('DZD',2),('EGP',2),('ERN',2),('ETB',2),('EUR',2),('FJD',2),('FKP',2),('GBP',2),('GEL',2),('GHS',2),('GIP',2),('GMD',2),('GNF',0),('GTQ',2),('GYD',2),('HKD',2),('HNL',2),('HRK',2),('HTG',2),('HUF',0),('IDR',0),('ILS',2),('INR',2),('IQD',0),('IRR',0),('ISK',0),('JMD',2),('JOD',3),('JPY',0),('KES',2),('KGS',2),('KHR',2),('KMF',0),('KPW',0),('KRW',0),('KWD',3),('KYD',2),('KZT',2),('LAK',0),('LBP',0),('LKR',2),('LRD',2),('LSL',2),('LYD',3),('MAD',2),('MDL',2),('MGA',0),('MKD',2),('MMK',0),('MNT',2),('MOP',2),('MRU',2),('MUR',2),('MVR',2),('MWK',2),('MXN',2),('MYR',2),('MZN',2),('NAD',2),('NGN',2),('NIO',2),('NOK',2),('NPR',2),('NZD',2),('OMR',3),('PAB',2),('PEN',2),('PGK',2),('PHP',2),('PKR',0),('PLN',2),('PYG',0),('QAR',2),('RON',2),('RSD',2),('RUB',2),('RWF',0),('SAR',2),('SBD',2),('SCR',2),('SDG',2),('SEK',2),('SGD',2),('SHP',2),('SLE',2),('SLL',0),('SOS',0),('SRD',2),('SSP',2),('STN',2),('SVC',2),('SYP',0),('SZL',2),('THB',2),('TJS',2),('TMT',2),('TND',3),('TOP',2),('TRY',2),('TTD',2),('TWD',2),('TZS',2),('UAH',2),('UGX',0),('USD',2),('UYU',2),('UZS',2),('VES',2),('VND',0),('VUV',0),('WST',2),('XAF',0),('XCD',2),('XCG',2),('XDR',2),('XOF',0),('XPF',0),('XSU',2),('YER',0),('ZAR',2),('ZMW',2),('ZWG',2),('ZWL',2);
alter table public.currency_units enable row level security;
revoke all on public.currency_units from public,anon,authenticated;
grant select on public.currency_units to authenticated;
create policy currency_catalog on public.currency_units for select to authenticated using(true);
-- Four decimal storage prevents silent truncation for currencies such as BHD and CLF.
alter table public.accounts alter column balance type numeric(18,4);
alter table public.transactions alter column amount type numeric(18,4),alter column balance_delta type numeric(18,4),alter column analytics_amount type numeric(18,4);
alter table public.transactions drop constraint transactions_source_type_check;
alter table public.transactions add constraint transactions_source_type_check check(source_type in ('MANUAL','TRANSFER','SPLIT','SETTLEMENT','PERSONAL_LOAN','PERSONAL_BILL','PERSONAL_ENTRY','CONVERSION'));
create table public.currency_conversions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users,
 transaction_id uuid unique references public.transactions on delete set null,
 original_currency text not null references public.currency_units,original_amount numeric(18,4) not null check(original_amount>0 and original_amount<1e12),
 base_currency text not null references public.currency_units,base_amount numeric(18,4) not null check(base_amount>0 and base_amount<1e12),
 exchange_rate numeric(30,16) not null check(exchange_rate>0 and exchange_rate<1e12),rate_date date not null,
 rate_source text not null check(rate_source in ('MANUAL','REFERENCE_SELECTED')),
 request_key uuid not null,deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,request_key),check(original_currency<>base_currency)
);
create index conversions_owner on public.currency_conversions(user_id);
alter table public.currency_conversions enable row level security;
revoke all on public.currency_conversions from public,anon,authenticated;
grant select on public.currency_conversions to authenticated;
create policy own_conversions on public.currency_conversions for select to authenticated using(user_id=(select auth.uid()));
create trigger audit_personal after insert or update or delete on public.currency_conversions for each row execute function private.audit_personal_record();

create function public.mutate_currency_conversion(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.currency_conversions; old public.transactions; a public.accounts; units integer; original_units integer; n numeric; original_n numeric; rate numeric; d numeric; t text; dt timestamptz; cat uuid; v uuid; tx uuid; orig text; base text; rd date; provenance text;
begin
 perform private.lock_ledger();
 if p_id is not null then
 select * into c from public.currency_conversions where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Conversion not found' using errcode='P0002';end if;
 if c.deleted_at is not null then
 if p_delete then return to_jsonb(c);end if;
 raise exception 'This conversion was deleted';end if;
 select * into old from public.transactions where id=c.transaction_id and user_id=auth.uid();
 if not found then raise exception 'Conversion ledger record missing';end if;
 elsif not p_delete then
 select * into c from public.currency_conversions where user_id=auth.uid() and request_key=(p_input->>'requestKey')::uuid;
 if found then return to_jsonb(c);end if;
 end if;
 if p_delete then
 if p_id is null then raise exception 'Conversion ID is required';end if;
 if exists(select 1 from public.receipt_attachments where transaction_id=old.id) then raise exception 'Remove receipts before deleting';end if;
 update public.accounts set balance=balance-old.balance_delta where id=old.account_id;
 delete from public.transactions where id=old.id;
 update public.currency_conversions set deleted_at=now(),updated_at=now() where id=c.id returning * into c;
 return to_jsonb(c);
 end if;
 select * into a from public.accounts where id=(p_input->>'accountId')::uuid and user_id=auth.uid();
 if not found or a.type in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') then raise exception 'Account not found or reserved';end if;
 select display_currency into base from public.users where id=auth.uid();
 if a.currency<>base then raise exception 'Accounting currency mismatch';end if;
 orig=p_input->>'originalCurrency';original_n=(p_input->>'originalAmount')::numeric;rate=(p_input->>'exchangeRate')::numeric;
 select minor_units into units from public.currency_units where code=base;
 select minor_units into original_units from public.currency_units where code=orig;
 if units is null or original_units is null or orig=base then raise exception 'Choose distinct supported currencies';end if;
 if original_n is null or original_n<=0 or original_n>=1e12 or original_n<>round(original_n,original_units) or rate is null or rate<=0 or rate>=1e12 or rate<>round(rate,16) then raise exception 'Invalid original amount or exchange rate';end if;
 n=round(original_n*rate,units);
 if n<=0 or n>=1e12 then raise exception 'Converted amount is outside supported range';end if;
 rd=(p_input->>'rateDate')::date;provenance=p_input->>'rateSource';t=p_input->>'type';dt=(p_input->>'dateTime')::timestamptz;cat=(p_input->>'categoryId')::uuid;
 if rd is null or not isfinite(rd) or rd>current_date or provenance is null or provenance not in ('MANUAL','REFERENCE_SELECTED') or t is null or t not in ('INCOME','EXPENSE') or dt is null or not isfinite(dt) then raise exception 'Invalid conversion details';end if;
 perform private.check_category(cat,auth.uid(),t);
 d=case when (t='INCOME')<>(a.type in ('CREDIT_CARD','LOAN')) then n else -n end;
 if p_id is null then
 insert into public.currency_conversions(user_id,original_currency,original_amount,base_currency,base_amount,exchange_rate,rate_date,rate_source,request_key)
 values(auth.uid(),orig,original_n,base,n,rate,rd,provenance,(p_input->>'requestKey')::uuid) returning * into c;
 tx=private.entry(auth.uid(),a.id,t,n,d,n,'CONVERSION',c.id,dt,p_input->>'notes',cat);
 update public.currency_conversions set transaction_id=tx where id=c.id returning * into c;
 else
 tx=old.id;
 update public.accounts set balance=balance-old.balance_delta where id=old.account_id;
 update public.accounts set balance=balance+d where id=a.id;
 update public.transactions set account_id=a.id,category_id=cat,type=t,amount=n,balance_delta=d,analytics_amount=n,date_time=dt,notes=p_input->>'notes',tags=coalesce(p_input->'tags',tags) where id=tx;
 update public.currency_conversions set original_currency=orig,original_amount=original_n,base_amount=n,exchange_rate=rate,rate_date=rd,rate_source=provenance,updated_at=now() where id=c.id returning * into c;
 end if;
 update public.transactions set tags=coalesce(p_input->'tags',tags) where id=tx;
 return to_jsonb(c);
end $$;
revoke all on function public.mutate_currency_conversion(jsonb,uuid,boolean) from public,anon;
grant execute on function public.mutate_currency_conversion(jsonb,uuid,boolean) to authenticated;
create or replace function private.receipt_target_access(t uuid,s uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from public.transactions where id=t and user_id=auth.uid() and source_type in ('MANUAL','PERSONAL_ENTRY','PERSONAL_BILL','PERSONAL_LOAN','CONVERSION'))
 or (s is not null and case when write_access then exists(select 1 from public.split_expenses e where e.id=s and (e.creator_id=auth.uid() or exists(select 1 from public.groups g where g.id=e.group_id and g.owner_id=auth.uid()))) else private.can_read_split(s) end))
$$;
