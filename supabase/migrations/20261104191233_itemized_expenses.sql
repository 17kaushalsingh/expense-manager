alter table public.split_expenses add column itemization jsonb;
-- Normalizes item allocations inside the trusted accounting boundary. Client
-- supplied exact shares cannot override item totals. All arithmetic uses cents.
create function private.itemized_split_input(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare
 v jsonb=p->'itemization'; item jsonb; party jsonb; ids jsonb; uid text;
 allocations jsonb='{}'; original jsonb; result jsonb='[]';
 subtotal numeric=0; extras numeric; n numeric; base numeric; remainder integer;
 total numeric; allocated numeric=0; count_users integer;
begin
 if v is null or v='null'::jsonb then return p;end if;
 if jsonb_typeof(v)<>'object' or jsonb_typeof(v->'items') is distinct from 'array' or jsonb_array_length(v->'items') not between 1 and 100
 or jsonb_typeof(p->'participants') is distinct from 'array' or jsonb_array_length(p->'participants') not between 1 and 50 then raise exception 'Invalid itemization';end if;
 if exists(select 1 from jsonb_array_elements(p->'participants') x group by x->>'userId' having count(*)>1) then raise exception 'Duplicate itemization participants';end if;
 for party in select value from jsonb_array_elements(p->'participants') loop
 uid=party->>'userId'; if uid is null then raise exception 'Missing participant';end if;
 allocations=jsonb_set(allocations,array[uid],'0');
 end loop;
 for item in select value from jsonb_array_elements(v->'items') loop
 n=(item->>'amount')::numeric;ids=item->'participantIds';
 if not private.valid_money(n) or nullif(trim(item->>'label'),'') is null or length(item->>'label')>120
 or jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids)=0 then raise exception 'Every item needs a valid amount, name and participants';end if;
 if exists(select 1 from jsonb_array_elements_text(ids) x where not allocations ? x)
 or (select count(*)<>count(distinct x) from jsonb_array_elements_text(ids) x) then raise exception 'Invalid or duplicate item participants';end if;
 count_users=jsonb_array_length(ids);base=floor(n*100/count_users);remainder=(n*100-base*count_users)::integer;
 for party in select value from jsonb_array_elements(p->'participants') loop
 uid=party->>'userId';
 if ids ? uid then
 allocations=jsonb_set(allocations,array[uid],to_jsonb((allocations->>uid)::numeric+base+case when remainder>0 then 1 else 0 end));remainder=remainder-1;
 end if;
 end loop;
 subtotal=subtotal+n*100;
 end loop;
 extras=coalesce((v->>'tax')::numeric,0)+coalesce((v->>'tip')::numeric,0);
 if coalesce((v->>'tax')::numeric,0)<0 or coalesce((v->>'tip')::numeric,0)<0
 or coalesce((v->>'tax')::numeric,0)<>round(coalesce((v->>'tax')::numeric,0),2)
 or coalesce((v->>'tip')::numeric,0)<>round(coalesce((v->>'tip')::numeric,0),2) then raise exception 'Tax and tip must be nonnegative cents';end if;
 extras=extras*100;total=(subtotal+extras)/100;
 if not private.valid_money(total) or total is distinct from (p->>'totalAmount')::numeric then raise exception 'Items, tax and tip must equal the expense total';end if;
 original=allocations;
 for party in select value from jsonb_array_elements(p->'participants') loop
 uid=party->>'userId';n=floor(extras*(original->>uid)::numeric/subtotal);allocated=allocated+n;
 allocations=jsonb_set(allocations,array[uid],to_jsonb((allocations->>uid)::numeric+n));
 end loop;
 remainder=(extras-allocated)::integer;
 for party in select value from jsonb_array_elements(p->'participants') loop
 uid=party->>'userId';
 if remainder>0 and (original->>uid)::numeric>0 then allocations=jsonb_set(allocations,array[uid],to_jsonb((allocations->>uid)::numeric+1));remainder=remainder-1;end if;
 result=result||jsonb_build_array(jsonb_build_object('userId',uid,'shareValue',(allocations->>uid)::numeric/100));
 end loop;
 return jsonb_set(jsonb_set(p,'{participants}',result),'{splitType}','"EXACT"');
end $$;
revoke all on function private.itemized_split_input(jsonb) from public,anon,authenticated;

create or replace function public.create_split_expense_atomic(p_input jsonb,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s uuid=coalesce(p_id,gen_random_uuid()); g uuid=(p_input->>'groupId')::uuid; c text; creator uuid=auth.uid();
 old public.split_expenses; n numeric; kind text; dt timestamptz; cat uuid; description text;
 party jsonb; uid uuid; a uuid; paid numeric; owed numeric; share numeric; sum_paid numeric=0; sum_shares numeric=0;
 count_part integer; idx integer=0; allocated numeric=0; cents numeric; remainder integer;
 before_state jsonb; affected uuid[]='{}';
begin
 perform private.lock_ledger();
 p_input=private.itemized_split_input(p_input);
 if p_id is not null then
 select * into old from public.split_expenses where id=p_id;
 if not found then raise exception 'Split not found' using errcode='P0002'; end if;
 if old.creator_id<>auth.uid() and not exists(select 1 from public.groups where id=old.group_id and owner_id=auth.uid()) then raise exception 'Forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.settlements where group_id is not distinct from old.group_id) then raise exception 'Cannot change expenses after settlement'; end if;
 before_state=to_jsonb(old); creator=old.creator_id;
 select array_agg(distinct user_id) into affected from (select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s) old_parties;
 perform private.reverse_split(s);
 if p_delete then
 if exists(select 1 from public.receipt_attachments where split_id=s) then raise exception 'Remove the receipts before deleting this split';end if;
 delete from public.split_expenses where id=s;
 foreach uid in array affected loop perform private.reconcile_virtual(uid,old.currency,'SPLIT',s,now());end loop;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('SplitExpense',s,auth.uid(),'DELETE',before_state);
 return '{}'::jsonb;
 end if;
 if g is distinct from old.group_id then raise exception 'Cannot move an expense to another group'; end if;
 end if;
 if g is not null then
 if not private.is_member(g) then raise exception 'Group not found' using errcode='42501'; end if;
 select currency into c from public.groups where id=g;
 else select display_currency into c from public.users where id=auth.uid(); end if;
 n=(p_input->>'totalAmount')::numeric; kind=p_input->>'splitType'; dt=coalesce((p_input->>'date')::timestamptz,now());
 description=trim(p_input->>'description'); cat=(p_input->>'categoryId')::uuid;
 if not private.valid_money(n) or length(description)=0 or description is null or kind not in ('EQUAL','EXACT','PERCENTAGE','SHARES') then raise exception 'Invalid expense'; end if;
 perform private.check_category(cat,auth.uid(),'EXPENSE');
 count_part=jsonb_array_length(p_input->'participants');
 if count_part is null or count_part<1 or coalesce(jsonb_array_length(p_input->'payers'),0)<1 then raise exception 'Payers and participants are required'; end if;
 if exists(select 1 from jsonb_array_elements(p_input->'payers') p group by p->>'userId' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_input->'participants') p group by p->>'userId' having count(*)>1) then raise exception 'Duplicate parties'; end if;
 if g is null and not exists(select 1 from jsonb_array_elements((p_input->'payers')||(p_input->'participants')) p where p->>'userId'=creator::text) then raise exception 'Creator must be involved'; end if;
 for party in select value from jsonb_array_elements((p_input->'payers')||(p_input->'participants')) loop
 uid=(party->>'userId')::uuid;
 if not exists(select 1 from public.users where id=uid and display_currency=c) then raise exception 'All parties must use the same currency'; end if;
 if g is not null and not exists(select 1 from public.group_members where group_id=g and user_id=uid) then raise exception 'Party is not a group member'; end if;
 end loop;
 for party in select value from jsonb_array_elements(p_input->'payers') loop
 paid=(party->>'amountPaid')::numeric;
 if not private.valid_money(paid) then raise exception 'Invalid payer amount'; end if;
 sum_paid=sum_paid+paid;
 end loop;
 if sum_paid<>n then raise exception 'Payments must equal total'; end if;
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 share=case when kind='EQUAL' then 1 else (party->>'shareValue')::numeric end;
 if share is null or share<0 or share<>round(share,4) then raise exception 'Invalid share'; end if;
 if kind='EXACT' and share<>round(share,2) then raise exception 'Exact shares must be cents'; end if;
 sum_shares=sum_shares+share;
 end loop;
 if (kind='EXACT' and sum_shares<>n) or (kind='PERCENTAGE' and sum_shares<>100) or sum_shares<=0 then raise exception 'Invalid share total'; end if;
 if p_id is null then
 insert into public.split_expenses(id,group_id,creator_id,description,currency,total_amount,split_type,date,category_id,itemization) values(s,g,creator,description,c,n,kind,dt,cat,p_input->'itemization');
 else update public.split_expenses set description=trim(p_input->>'description'),total_amount=n,split_type=kind,date=dt,category_id=cat,itemization=p_input->'itemization' where id=s; end if;
 -- Floor proportional allocations and distribute remaining cents by input order.
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 share=case when kind='EQUAL' then 1 else (party->>'shareValue')::numeric end;
 owed=case when kind='EXACT' then share else floor(n*100*share/sum_shares)/100 end;
 allocated=allocated+owed;
 insert into public.split_participants(split_expense_id,user_id,share_value,amount_owed) values(s,(party->>'userId')::uuid,share,owed);
 end loop;
 remainder=((n-allocated)*100)::integer;
 for party in select value from jsonb_array_elements(p_input->'participants') loop
 if idx<remainder then update public.split_participants set amount_owed=amount_owed+0.01 where split_expense_id=s and user_id=(party->>'userId')::uuid; end if;
 idx=idx+1;
 end loop;
 for party in select value from jsonb_array_elements(p_input->'payers') loop
 uid=(party->>'userId')::uuid; paid=(party->>'amountPaid')::numeric;
 if uid=auth.uid() and party->>'accountId' is not null then
 select id into a from public.accounts where id=(party->>'accountId')::uuid and user_id=uid and currency=c and type not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE');
 if a is null then raise exception 'Payer account not found'; end if;
 elsif party->>'accountId' is not null and uid<>auth.uid() then raise exception 'Cannot choose another user account';
 else a=private.default_account(uid,'CASH',c); end if;
 insert into public.split_payers(split_expense_id,user_id,amount_paid,account_id) values(s,uid,paid,a);
 perform private.entry(uid,a,'TRANSFER',paid,case when (select type from public.accounts where id=a) in ('CREDIT_CARD','LOAN') then paid else -paid end,0,'SPLIT',s,dt,'Payment: '||description);
 end loop;
 for uid in select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s loop
 select coalesce(sum(amount_paid),0) into paid from public.split_payers where split_expense_id=s and user_id=uid;
 select coalesce(sum(amount_owed),0) into owed from public.split_participants where split_expense_id=s and user_id=uid;
 -- One personal expense record, with no duplicate cash effect.
 if owed>0 then
 a=private.default_account(uid,'CASH',c);
 perform private.entry(uid,a,'EXPENSE',owed,0,owed,'SPLIT',s,dt,'Share: '||description,case when uid=auth.uid() then cat else null end);
 end if;
 end loop;
 for uid in select user_id from public.split_payers where split_expense_id=s union select user_id from public.split_participants where split_expense_id=s union select unnest(affected) loop
 perform private.reconcile_virtual(uid,c,'SPLIT',s,dt);
 end loop;
 insert into public.audit_logs(entity_type,entity_id,user_id,action,changes) values('SplitExpense',s,auth.uid(),case when p_id is null then 'CREATE' else 'UPDATE' end,jsonb_build_object('before',before_state,'after',p_input));
 return (select to_jsonb(e)||jsonb_build_object('payers',(select jsonb_agg(to_jsonb(p)) from public.split_payers p where split_expense_id=s),'participants',(select jsonb_agg(to_jsonb(p)) from public.split_participants p where split_expense_id=s)) from public.split_expenses e where id=s);
end $$;
