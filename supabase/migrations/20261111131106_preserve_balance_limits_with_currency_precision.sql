-- Preserve the original ledger range while retaining fractional currency units.
alter table public.accounts add constraint accounts_supported_balance check(balance > -1000000000000 and balance < 1000000000000);
