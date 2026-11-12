create or replace function private.device_resource(t text,body jsonb,v uuid,expected text,remove boolean default false) returns jsonb language plpgsql set search_path='' as $$
declare k text;field text;cols text='';picks text='';updates text='';result jsonb;input jsonb;actual uuid;
begin
 if t not in ('budget_plans','budget_overrides','monthly_plans','personal_assets','asset_valuations','savings_goals','finance_events','event_planned_costs','event_transactions','reminders','card_settings','card_installments','finance_preferences') then raise exception 'Unsupported device resource';end if;
 k=case t when 'card_settings' then 'account_id' when 'finance_preferences' then 'user_id' else 'id' end;
 if v is not null then perform private.device_row_version(t,k,v,expected);end if;
 if remove then
 if v is null then raise exception 'Record ID required';end if;
 execute format('delete from public.%I where %I=$1 and user_id=$2 and xmin::text=$3 returning to_jsonb(%I)',t,k,t) into result using v,auth.uid(),expected;if result is null then raise exception 'Record changed since snapshot' using errcode='23505';end if;return result;
 end if;
 if jsonb_typeof(body)<>'object' or body='{}' then raise exception 'Choose resource fields';end if;
 for field in select jsonb_object_keys(body) loop
 if field in ('id','user_id','owner_id','creator_id','created_at','updated_at','row_version','recorded_transaction_id','deleted_at','source_type','source_id') or (field='transaction_id' and t not in ('card_installments','event_transactions')) or not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name=field) then raise exception 'Unsupported field for device resource';end if;
 if cols<>'' then cols=cols||',';picks=picks||',';updates=updates||',';end if;
 cols=cols||format('%I',field);picks=picks||format('r.%I',field);updates=updates||format('%I=r.%I',field,field);
 end loop;
 input=body||jsonb_build_object('user_id',auth.uid());
 if v is null then
 execute format('insert into public.%I (%s,user_id) select %s,r.user_id from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I)||jsonb_build_object(''row_version'',xmin::text)',t,cols,picks,t,t) into result using input;
 else
 execute format('update public.%I d set %s from jsonb_populate_record(null::public.%I,$1) r where d.%I=$2 and d.user_id=$3 and d.xmin::text=$4 returning to_jsonb(d)||jsonb_build_object(''row_version'',d.xmin::text)',t,updates,t,k) into result using input,v,auth.uid(),expected;
 end if;
 if result is null then raise exception 'Record changed since snapshot' using errcode='23505';end if;
 return result||jsonb_build_object('id',result->>k);
end $$;
