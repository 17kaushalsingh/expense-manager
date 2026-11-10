-- Evaluate the actor once per statement rather than once per visible reversal.
alter policy readable_reversals on public.settlement_reversals
 using (payer_id=(select auth.uid()) or payee_id=(select auth.uid()) or private.is_member(group_id));
