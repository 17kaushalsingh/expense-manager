create or replace function public.enforce_app_session() returns void language plpgsql stable security invoker set search_path='' as $$
begin
 -- The anonymous branch never resolves or executes a private-schema function.
 if auth.jwt()->>'role'='authenticated' then
  if not private.session_active() then
   raise sqlstate 'PT401' using message='Session revoked or expired';
  end if;
 end if;
end $$;
