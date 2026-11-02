create or replace function public.mutate_split_comment(p_split_id uuid default null,p_body text default null,p_id uuid default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.split_comments;g uuid;v uuid=coalesce(p_id,gen_random_uuid());n text;
begin
 perform private.lock_ledger();
 if p_delete and p_id is null then raise exception 'Comment ID required';end if;
 if p_id is not null then
 select * into c from public.split_comments where id=p_id;
 if not found then raise exception 'Comment not found' using errcode='P0002';end if;
 g=c.group_id;
 if not private.is_member(g) or (c.user_id<>auth.uid() and not(p_delete and exists(select 1 from public.groups where id=g and owner_id=auth.uid()))) then raise exception 'Only the author can edit; owners may moderate deletion' using errcode='42501';end if;
 if c.deleted_at is not null then return to_jsonb(c);end if;
 else
 select group_id into g from public.split_expenses where id=p_split_id;
 if g is null or not private.is_member(g) then raise exception 'Group expense not found' using errcode='42501';end if;
 end if;
 if p_delete then
 update public.split_comments set body='[Deleted]',deleted_at=now() where id=v;
 elsif nullif(trim(p_body),'') is null or length(trim(p_body))>2000 then raise exception 'Comments must contain 1 to 2000 characters';
 elsif p_id is null then
 select name into n from public.users where id=auth.uid();
 insert into public.split_comments(id,split_expense_id,group_id,user_id,author_name,body) values(v,p_split_id,g,auth.uid(),n,trim(p_body));
 else update public.split_comments set body=trim(p_body) where id=v;end if;
 insert into public.audit_logs(entity_type,entity_id,user_id,action) values('SplitComment',v,auth.uid(),case when p_delete then 'DELETE' when p_id is null then 'CREATE' else 'UPDATE' end);
 insert into public.group_activity(group_id,actor_id,actor_name,action,entity_type,entity_id,summary) select g,auth.uid(),name,case when p_delete then 'DELETE' when p_id is null then 'INSERT' else 'UPDATE' end,'split_comments',v,case when p_delete then 'Comment removed' else 'Comment on an expense' end from public.users where id=auth.uid();
 return (select to_jsonb(x) from public.split_comments x where id=v);
end $$;
