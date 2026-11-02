-- No persistent fixtures or helper functions. All mutations roll back.
begin;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$
declare g uuid;t uuid;s uuid;d uuid;p jsonb;posted uuid;v jsonb;date_before date;idx_before int;
begin
 g=(public.manage_group('{"name":"Recurring rollback","memberIds":["66666666-6666-4666-8666-666666666666"]}')->>'id')::uuid;
 p=jsonb_build_object('description','Recurring rent','totalAmount',10.01,'splitType','EQUAL','payers',jsonb_build_array(jsonb_build_object('userId',auth.uid(),'amountPaid',10.01)),'participants',jsonb_build_array(jsonb_build_object('userId',auth.uid()),jsonb_build_object('userId','66666666-6666-4666-8666-666666666666')));
 t=(public.manage_split_template(g,jsonb_build_object('name','Rent','payload',p))->>'id')::uuid;
 s=(public.manage_expense_schedule(jsonb_build_object('templateId',t,'frequency','MONTHLY','startDate',(now() at time zone 'UTC')::date,'timezone','UTC'))->>'id')::uuid;
 update public.expense_schedules set start_date='2024-01-31',end_date='2024-03-31' where id=s;
 perform private.generate_expense_drafts('2024-04-01T00:00:00Z');
 perform private.generate_expense_drafts('2024-04-01T00:00:00Z');
 if (select count(*) from public.expense_drafts where schedule_id=s)<>3 then raise exception 'Duplicate catch-up drafts';end if;
 if (select array_agg(due_date order by due_date) from public.expense_drafts where schedule_id=s)<>array['2024-01-31'::date,'2024-02-29'::date,'2024-03-31'::date] then raise exception 'Month-end anchor lost';end if;
 if exists(select 1 from public.split_expenses where group_id=g) then raise exception 'Drafts affected ledger';end if;
 select id into d from public.expense_drafts where schedule_id=s order by due_date limit 1;
 begin
 perform public.mutate_expense_draft(d,'POST',p||jsonb_build_object('categoryId',g));raise exception 'Bad category accepted';
 exception when raise_exception then if sqlerrm='Bad category accepted' then raise;end if;end;
 if (select status from public.expense_drafts where id=d)<>'DRAFT' or exists(select 1 from public.split_expenses where group_id=g) then raise exception 'Posting failure did not roll back';end if;
 posted=(public.mutate_expense_draft(d,'POST',p)->>'id')::uuid;
 if (public.mutate_expense_draft(d,'POST',p)->>'id')::uuid<>posted or (select count(*) from public.split_expenses where group_id=g)<>1 then raise exception 'Posting duplicated expense';end if;
 if (select sum(amount_owed) from public.split_participants where split_expense_id=posted)<>10.01 then raise exception 'Rounding not conserved';end if;
 perform public.manage_split_template(g,jsonb_build_object('name','Updated','payload',p||'{"description":"New rent"}'),t);
 if exists(select 1 from public.expense_drafts where schedule_id=s and payload->>'description'<>'Recurring rent') then raise exception 'Snapshot changed';end if;
 perform set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
 begin perform public.mutate_expense_draft(d,'SKIP');raise exception 'Unauthorized review';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
 if private.occurrence_date('2024-02-29','YEARLY',1)<>'2025-02-28'::date or private.occurrence_date('2024-02-29','YEARLY',4)<>'2028-02-29'::date then raise exception 'Leap-year anchor lost';end if;
 -- Resume skips past dates without generating them.
 update public.expense_schedules set start_date=(now() at time zone 'UTC')::date-interval '28 days',end_date=null,frequency='WEEKLY',status='PAUSED',next_index=0 where id=s;
 perform public.manage_expense_schedule('{"status":"ACTIVE"}',s);
 if (select next_index from public.expense_schedules where id=s)<>4 then raise exception 'Resume did not skip paused periods';end if;
 -- Local midnight across DST: never generate tomorrow's occurrence early.
 update public.expense_schedules set start_date='2026-03-08',frequency='WEEKLY',timezone='America/New_York',next_index=0,end_date='2026-03-08' where id=s;
 perform private.generate_expense_drafts('2026-03-08T04:59:00Z');
 if exists(select 1 from public.expense_drafts where schedule_id=s and due_date='2026-03-08') then raise exception 'Generated before local midnight';end if;
 perform private.generate_expense_drafts('2026-03-08T05:00:00Z');
 if not exists(select 1 from public.expense_drafts where schedule_id=s and due_date='2026-03-08') then raise exception 'Did not generate on local date';end if;
-- Owner can post a complete draft whose parties do not include the owner.
 p=jsonb_build_object('description','Bob-only expense','totalAmount',3,'splitType','EQUAL','payers',jsonb_build_array(jsonb_build_object('userId','66666666-6666-4666-8666-666666666666','amountPaid',3)),'participants',jsonb_build_array(jsonb_build_object('userId','66666666-6666-4666-8666-666666666666')));
 t=(public.manage_split_template(g,jsonb_build_object('name','Owner review','payload',p))->>'id')::uuid;
 s=(public.manage_expense_schedule(jsonb_build_object('templateId',t,'frequency','MONTHLY','startDate',(now() at time zone 'UTC')::date,'timezone','UTC'))->>'id')::uuid;
 perform private.generate_expense_drafts();
 select id into d from public.expense_drafts where schedule_id=s;
 v=public.mutate_expense_draft(d,'POST',p);
 if v->>'creator_id'<>auth.uid()::text then raise exception 'Posting did not preserve authenticated actor';end if;
end $$;
rollback;
