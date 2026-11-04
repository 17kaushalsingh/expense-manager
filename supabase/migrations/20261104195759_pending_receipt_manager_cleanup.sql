-- Current expense managers must be able to discover/remove abandoned uploads,
-- including an upload started by another manager. Ordinary readers still only
-- see READY receipts. INSERT remains restricted to the original uploader.
create or replace function private.receipt_access(p_path text,p_write boolean default false,p_upload boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.receipt_attachments r where r.object_path=p_path
 and private.receipt_target_access(r.transaction_id,r.split_id,p_write)
 and (not p_upload or (r.status='PENDING' and r.uploader_id=auth.uid()))
 and (p_write or r.status='READY' or r.uploader_id=auth.uid()
      or private.receipt_target_access(r.transaction_id,r.split_id,true)))
$$;
alter policy readable_receipts on public.receipt_attachments using(
 private.receipt_target_access(transaction_id,split_id)
 and (status='READY' or uploader_id=(select auth.uid()) or private.receipt_target_access(transaction_id,split_id,true))
);
