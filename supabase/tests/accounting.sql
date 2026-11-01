-- Run against a disposable/test project through MCP execute_sql or psql.
-- Every fixture and financial mutation is rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','ledger-a@example.invalid','{"name":"Alice"}'),
 ('22222222-2222-4222-8222-222222222222','ledger-b@example.invalid','{"name":"Bob"}'),
 ('33333333-3333-4333-8333-333333333333','ledger-c@example.invalid','{"name":"Cara"}'),
 ('44444444-4444-4444-8444-444444444444','ledger-d@example.invalid','{"name":"Outsider"}');
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Assertion failed: %',message; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$
declare a jsonb; b jsonb; g jsonb; s jsonb; v jsonb; n numeric;
begin
 a=public.manage_account('{"name":"Checking","type":"BANK_ACCOUNT","balance":100}');
 b=public.manage_account('{"name":"Savings","type":"BANK_ACCOUNT","balance":0}');
 perform set_config('test.account',a->>'id',true);
 perform public.transfer_accounts_atomic(jsonb_build_object('sourceAccountId',a->>'id','targetAccountId',b->>'id','amount',20,'dateTime',now()));
 perform pg_temp.assert((select balance=80 from public.accounts where id=(a->>'id')::uuid),'transfer source');
 perform pg_temp.assert((select balance=20 from public.accounts where id=(b->>'id')::uuid),'transfer destination');
 perform pg_temp.assert((select count(*)=1 from public.transactions where linked_transaction_id is not null),'linked transfer');
 v=public.mutate_transaction_atomic(jsonb_build_object('accountId',a->>'id','type','EXPENSE','amount',10,'dateTime',now()));
 v=public.mutate_transaction_atomic(jsonb_build_object('accountId',b->>'id','type','INCOME','amount',15,'dateTime',now()),(v->>'id')::uuid);
 perform pg_temp.assert((select balance=80 from public.accounts where id=(a->>'id')::uuid),'edit reverses old account');
 perform pg_temp.assert((select balance=35 from public.accounts where id=(b->>'id')::uuid),'edit applies new account');
 perform public.mutate_transaction_atomic('{}',(v->>'id')::uuid,true);
 perform pg_temp.assert((select balance=20 from public.accounts where id=(b->>'id')::uuid),'delete reverses');
 begin
 perform public.transfer_accounts_atomic(jsonb_build_object('sourceAccountId',a->>'id','targetAccountId','44444444-4444-4444-8444-444444444444','amount',5,'dateTime',now()));
 raise exception 'Expected invalid transfer to fail';
 exception when raise_exception then if sqlerrm='Expected invalid transfer to fail' then raise; end if; end;
 perform pg_temp.assert((select balance=80 from public.accounts where id=(a->>'id')::uuid),'failed transfer rollback');
 g=public.manage_group('{"name":"Trip","memberIds":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"]}');
 perform set_config('test.group',g->>'id',true);
 v=jsonb_build_object('groupId',g->>'id','description','Dinner','totalAmount',90,'splitType','EQUAL','payers',jsonb_build_array(jsonb_build_object('userId',auth.uid(),'amountPaid',90,'accountId',a->>'id')),'participants','[{"userId":"11111111-1111-4111-8111-111111111111"},{"userId":"22222222-2222-4222-8222-222222222222"},{"userId":"33333333-3333-4333-8333-333333333333"}]'::jsonb);
 s=public.create_split_expense_atomic(v);
 perform set_config('test.split',s->>'id',true);
 perform pg_temp.assert((select balance=-10 from public.accounts where id=(a->>'id')::uuid),'split cash outflow once');
 perform pg_temp.assert((select sum(analytics_amount)=30 from public.transactions where source_type='SPLIT'),'personal expense counted once');
 perform pg_temp.assert((select balance=60 from public.accounts where type='ACCOUNTS_RECEIVABLE'),'receivable balance');
 -- Valid replacement reverses and reapplies with the same source ID.
 s=public.create_split_expense_atomic(jsonb_set(v,'{description}','"Updated dinner"'),(s->>'id')::uuid);
 perform pg_temp.assert((select balance=-10 from public.accounts where id=(a->>'id')::uuid),'valid split replacement has no duplicate balance effect');
 begin
 perform public.mutate_transaction_atomic('{}',(select id from public.transactions where source_type='SPLIT' limit 1),true);
 raise exception 'Expected generated entry guard';
 exception when raise_exception then if sqlerrm='Expected generated entry guard' then raise;end if;end;
 -- An invalid replacement must roll back its reversal too.
 begin
 perform public.create_split_expense_atomic(jsonb_set(v,'{totalAmount}','100'),(s->>'id')::uuid);
 raise exception 'Expected invalid replacement to fail';
 exception when raise_exception then if sqlerrm='Expected invalid replacement to fail' then raise; end if; end;
 perform pg_temp.assert((select balance=-10 from public.accounts where id=(a->>'id')::uuid),'failed replacement rollback');
 perform public.create_split_expense_atomic('{}',(s->>'id')::uuid,true);
 perform pg_temp.assert((select balance=80 from public.accounts where id=(a->>'id')::uuid),'split deletion reverses cash');
 s=public.create_split_expense_atomic(v);
 perform set_config('test.split',s->>'id',true);
 -- Reciprocal group expenses must net within virtual accounts too.
 v=jsonb_build_object('groupId',g->>'id','description','Bob paid dinner','totalAmount',90,'splitType','EQUAL','payers','[{"userId":"22222222-2222-4222-8222-222222222222","amountPaid":90}]'::jsonb,'participants','[{"userId":"11111111-1111-4111-8111-111111111111"},{"userId":"22222222-2222-4222-8222-222222222222"},{"userId":"33333333-3333-4333-8333-333333333333"}]'::jsonb);
 s=public.create_split_expense_atomic(v);
 perform pg_temp.assert((select balance=30 from public.accounts where type='ACCOUNTS_RECEIVABLE'),'reciprocal expenses net receivables');
 perform pg_temp.assert((select balance=0 from public.accounts where type='ACCOUNTS_PAYABLE'),'reciprocal expenses avoid gross payable');
 perform public.create_split_expense_atomic('{}',(s->>'id')::uuid,true);
 perform pg_temp.assert((select balance=60 from public.accounts where type='ACCOUNTS_RECEIVABLE'),'reciprocal reversal restores receivables');
 -- Two payers with exact shares, including a payer owing more than they paid.
 v=jsonb_build_object('groupId',g->>'id','description','Multi payer','totalAmount',100,'splitType','EXACT','payers','[{"userId":"11111111-1111-4111-8111-111111111111","amountPaid":60},{"userId":"22222222-2222-4222-8222-222222222222","amountPaid":40}]'::jsonb,'participants','[{"userId":"11111111-1111-4111-8111-111111111111","shareValue":70},{"userId":"22222222-2222-4222-8222-222222222222","shareValue":30}]'::jsonb);
 s=public.create_split_expense_atomic(v);
 perform pg_temp.assert((select sum((p->>'amount_paid')::numeric)=100 from jsonb_array_elements(s->'payers') p),'multi payer total');
 perform pg_temp.assert((select sum((p->>'amount_owed')::numeric)=100 from jsonb_array_elements(s->'participants') p),'exact shares total');
 perform public.create_split_expense_atomic('{}',(s->>'id')::uuid,true);
 -- Floor and remainder allocation for all proportional modes.
 for n in 1..3 loop
 v=jsonb_build_object('groupId',g->>'id','description','Rounding','totalAmount',10,'splitType',case n when 1 then 'EQUAL' when 2 then 'PERCENTAGE' else 'SHARES' end,'payers','[{"userId":"11111111-1111-4111-8111-111111111111","amountPaid":10}]'::jsonb,'participants',case when n=2 then '[{"userId":"11111111-1111-4111-8111-111111111111","shareValue":33.3333},{"userId":"22222222-2222-4222-8222-222222222222","shareValue":33.3333},{"userId":"33333333-3333-4333-8333-333333333333","shareValue":33.3334}]'::jsonb else '[{"userId":"11111111-1111-4111-8111-111111111111","shareValue":1},{"userId":"22222222-2222-4222-8222-222222222222","shareValue":1},{"userId":"33333333-3333-4333-8333-333333333333","shareValue":1}]'::jsonb end);
 s=public.create_split_expense_atomic(v);
 perform pg_temp.assert((select sum((p->>'amount_owed')::numeric)=10 from jsonb_array_elements(s->'participants') p),'cent conservation');
 perform public.create_split_expense_atomic('{}',(s->>'id')::uuid,true);
 end loop;
end $$;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select pg_temp.assert((select count(*)=0 from public.accounts),'private accounts hidden');
select pg_temp.assert((select count(*)=0 from public.groups),'outsider groups hidden');
select pg_temp.assert((select count(*)=0 from public.split_expenses),'outsider splits hidden');
select pg_temp.assert((select count(*)=0 from public.transactions),'private transactions hidden');
do $$ begin
 begin perform public.simplify_debts(current_setting('test.group')::uuid);raise exception 'Expected unauthorized RPC failure';
 exception when insufficient_privilege then null; end;
 begin update public.accounts set balance=1000;raise exception 'Expected direct balance write failure';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ declare a jsonb; v jsonb; begin
 perform pg_temp.assert((select count(*)=1 from public.groups),'member can read group');
 perform pg_temp.assert((select count(*)=1 from public.users),'member cannot read other profiles');
 begin perform public.manage_group('{"name":"Hijack"}',current_setting('test.group')::uuid);raise exception 'Expected owner check';
 exception when insufficient_privilege then null;end;
 a=public.manage_account('{"name":"Bob cash","type":"CASH","balance":100}');
 v=jsonb_build_object('groupId',current_setting('test.group'),'payeeId','11111111-1111-4111-8111-111111111111','accountId',a->>'id','amount',10);
 perform public.execute_settlement_atomic(v);
 perform pg_temp.assert((public.simplify_debts(current_setting('test.group')::uuid)->'groupBalances'->>auth.uid()::text)::numeric=-20,'partial settlement changes graph');
 perform pg_temp.assert((select balance=90 from public.accounts where id=(a->>'id')::uuid),'settlement cash out');
 perform pg_temp.assert((select balance=20 from public.accounts where type='ACCOUNTS_PAYABLE'),'settlement reduces payable');
 perform public.execute_settlement_atomic(jsonb_set(v,'{amount}','20'));
 perform pg_temp.assert((public.simplify_debts(current_setting('test.group')::uuid)->'groupBalances'->>auth.uid()::text)::numeric=0,'full settlement clears debtor');
 begin perform public.execute_settlement_atomic(v);raise exception 'Expected overpayment failure';
 exception when raise_exception then if sqlerrm='Expected overpayment failure' then raise;end if;end;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
 begin perform public.create_split_expense_atomic('{}',current_setting('test.split')::uuid,true);raise exception 'Expected settlement history guard';
 exception when raise_exception then if sqlerrm='Expected settlement history guard' then raise;end if;end;
 perform pg_temp.assert((select balance=30 from public.accounts where type='ACCOUNTS_RECEIVABLE'),'settlement reduces receivable');
end $$;
-- Ad-hoc obligations must agree from both sides without disclosing unrelated edges.
do $$ declare v jsonb; begin
 v=public.create_split_expense_atomic('{"description":"Ad hoc lunch","totalAmount":12,"splitType":"EQUAL","payers":[{"userId":"11111111-1111-4111-8111-111111111111","amountPaid":12}],"participants":[{"userId":"11111111-1111-4111-8111-111111111111"},{"userId":"22222222-2222-4222-8222-222222222222"},{"userId":"33333333-3333-4333-8333-333333333333"}]}');
 perform set_config('test.adhoc',v->>'id',true);
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ declare a uuid; begin
 perform pg_temp.assert(jsonb_array_length(public.simplify_debts()->'simplifiedTransactions')=1,'ad hoc exposes own bilateral edges only');
 select id into a from public.accounts where user_id=auth.uid() and type='CASH' and not is_default limit 1;
 perform public.execute_settlement_atomic(jsonb_build_object('payeeId','11111111-1111-4111-8111-111111111111','accountId',a,'amount',2));
 perform pg_temp.assert((public.simplify_debts()->'groupBalances'->>auth.uid()::text)::numeric=-2,'ad hoc debtor view updates');
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select pg_temp.assert((public.simplify_debts()->'groupBalances'->>'22222222-2222-4222-8222-222222222222')::numeric=-2,'ad hoc creditor agrees');
rollback;
