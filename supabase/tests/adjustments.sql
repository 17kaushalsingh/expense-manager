-- Privileged database test only. Synthetic identities, sessions, scheduler writes
-- and accounting effects all roll back; real Auth/REST checks live in Vitest.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid();
 g uuid; t uuid; s uuid; d uuid; expense uuid; v jsonb; p jsonb; before_balance numeric; cash uuid; command uuid:=gen_random_uuid(); command_payload jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
  (a,a::text||'@example.invalid','{"name":"Adjustment SQL Alice"}'),
  (b,b::text||'@example.invalid','{"name":"Adjustment SQL Bob"}'),
  (c,c::text||'@example.invalid','{"name":"Adjustment SQL Cara"}');
 insert into auth.sessions(id,user_id,not_after) values(sid,a,now()+interval '1 hour');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid)::text,true);
 perform set_config('request.jwt.claim.sub',a::text,true);
 g:=(public.manage_group(jsonb_build_object('name','Adjustment rollback','memberIds',jsonb_build_array(b,c)))->>'id')::uuid;
 cash:=(public.manage_account('{"name":"Adjustment SQL cash","type":"CASH","balance":100}')->>'id')::uuid;
 p:=jsonb_build_object('description','Adjusted rent','totalAmount',10.01,'splitType','ADJUSTMENT',
  'participants',jsonb_build_array(jsonb_build_object('userId',a,'shareValue',1),jsonb_build_object('userId',b,'shareValue',0),jsonb_build_object('userId',c,'shareValue',-1)),
  'payers',jsonb_build_array(jsonb_build_object('userId',a,'amountPaid',10.01)));
 t:=(public.manage_split_template(g,jsonb_build_object('name','Adjusted month end','payload',p))->>'id')::uuid;
 s:=(public.manage_expense_schedule(jsonb_build_object('templateId',t,'frequency','MONTHLY','startDate',(now() at time zone 'UTC')::date,'timezone','Asia/Kolkata'))->>'id')::uuid;
 update public.expense_schedules set start_date='2024-01-31',end_date='2024-03-31',next_index=0 where id=s;
 perform private.generate_expense_drafts('2024-04-01T00:00:00Z');
 perform private.generate_expense_drafts('2024-04-01T00:00:00Z');
 if (select array_agg(due_date order by due_date) from public.expense_drafts where schedule_id=s)<>array['2024-01-31'::date,'2024-02-29'::date,'2024-03-31'::date] then raise exception 'Adjustment schedule lost month-end anchor or duplicated';end if;
 if exists(select 1 from public.split_expenses where group_id=g) then raise exception 'Unposted adjustment drafts affected the ledger';end if;
 perform public.manage_split_template(g,jsonb_build_object('name','Changed future','payload',p||'{"description":"Future description"}'),t);
 if exists(select 1 from public.expense_drafts where schedule_id=s and payload->>'description'<>'Adjusted rent') then raise exception 'Template mutation changed existing adjustment snapshots';end if;
 select id into d from public.expense_drafts where schedule_id=s order by due_date limit 1;
 p:=p||jsonb_build_object('payers',jsonb_build_array(jsonb_build_object('userId',a,'amountPaid',10.01,'accountId',cash)));
 select balance into before_balance from public.accounts where id=cash;
 begin
  perform public.mutate_expense_draft(d,'POST',p||jsonb_build_object('participants',jsonb_build_array(jsonb_build_object('userId',a,'shareValue',-100),jsonb_build_object('userId',b,'shareValue',0))));
  raise exception 'Invalid adjustment draft posted';
 exception when raise_exception then if sqlerrm='Invalid adjustment draft posted' then raise;end if;end;
 if (select status from public.expense_drafts where id=d)<>'DRAFT' or (select balance from public.accounts where id=cash)<>before_balance then raise exception 'Failed adjustment draft did not roll back';end if;
 v:=public.mutate_expense_draft(d,'POST',p);expense:=(v->>'id')::uuid;
 if v->>'split_type'<>'ADJUSTMENT' or v->'adjustments' is distinct from p->'participants' then raise exception 'Draft posting lost signed adjustment intent';end if;
 if (public.mutate_expense_draft(d,'POST',p)->>'id')::uuid<>expense or (select count(*) from public.split_expenses where group_id=g)<>1 then raise exception 'Adjustment posting retry duplicated expense';end if;
 if (select balance from public.accounts where id=cash)<>before_balance-10.01 then raise exception 'Adjustment payer cash was counted incorrectly';end if;
 if (select amount_owed from public.split_participants where split_expense_id=expense and user_id=a)<>4.34
 or (select amount_owed from public.split_participants where split_expense_id=expense and user_id=b)<>3.34
 or (select amount_owed from public.split_participants where split_expense_id=expense and user_id=c)<>2.33 then raise exception 'Draft cent normalization differs';end if;
 if (select sum(analytics_amount) from public.transactions where source_type='SPLIT' and source_id=expense)<>10.01 then raise exception 'Adjustment analytics duplicated or omitted personal spending';end if;
 command_payload:=jsonb_build_object('input',p||jsonb_build_object('groupId',g,'date',now()));
 v:=public.execute_device_command(command,'SPLIT_CREATE',command_payload);
 if v->>'split_type'<>'ADJUSTMENT' or v->'adjustments' is distinct from p->'participants' then raise exception 'Offline command lost adjustment intent';end if;
 if public.execute_device_command(command,'SPLIT_CREATE',command_payload)->>'id'<>v->>'id' or (select count(*) from public.split_expenses where group_id=g)<>2 then raise exception 'Offline adjustment retry duplicated';end if;
end $$;
rollback;
