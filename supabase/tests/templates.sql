begin;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
create temporary table template_test(g uuid,t uuid,p jsonb);
insert into template_test(g) select (public.manage_group('{"name":"Templates rollback","memberIds":["66666666-6666-4666-8666-666666666666"]}')->>'id')::uuid;
update template_test set p=jsonb_build_object('description','Rent','totalAmount',10.01,'splitType','EQUAL','payers',jsonb_build_array(jsonb_build_object('userId',auth.uid(),'amountPaid',10.01)),'participants',jsonb_build_array(jsonb_build_object('userId',auth.uid()),jsonb_build_object('userId','66666666-6666-4666-8666-666666666666')));
update template_test set t=(public.manage_split_template(g,jsonb_build_object('name','Rent','payload',p))->>'id')::uuid;
do $$ declare s text; payload jsonb; begin
 foreach s in array array['EXACT','PERCENTAGE','SHARES'] loop
 select jsonb_set(jsonb_set(p,'{splitType}',to_jsonb(s)),'{participants}',jsonb_build_array(jsonb_build_object('userId',auth.uid(),'shareValue',case s when 'EXACT' then 5 else 50 end),jsonb_build_object('userId','66666666-6666-4666-8666-666666666666','shareValue',case s when 'EXACT' then 5.01 else 50 end))) into payload from template_test;
 perform public.manage_split_template((select g from template_test),jsonb_build_object('name',s,'payload',payload));
 end loop;
 begin perform public.manage_split_template((select g from template_test),jsonb_build_object('name','Bad','payload',(select p from template_test)||jsonb_build_object('categoryId',gen_random_uuid())));raise exception 'Private fields accepted';exception when raise_exception then if sqlerrm='Private fields accepted' then raise;end if;end;
 if exists(select 1 from public.split_expenses where group_id=(select g from template_test)) then raise exception 'Templates changed ledger';end if;
end $$;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ begin
 begin perform public.manage_split_template((select g from template_test),'{}',(select t from template_test),true);raise exception 'Unauthorized archive';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select public.manage_group(jsonb_build_object('userId','66666666-6666-4666-8666-666666666666'),g,'REMOVE_MEMBER') from template_test;
do $$ begin if not (public.list_split_templates((select g from template_test))->0->>'needsCorrection')::boolean then raise exception 'Missing correction flag';end if;end $$;
rollback;
