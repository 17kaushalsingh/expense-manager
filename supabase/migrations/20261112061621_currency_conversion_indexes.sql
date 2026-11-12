-- Cover currency catalog references without changing financial history.
create index currency_conversions_base_currency on public.currency_conversions(base_currency);
create index currency_conversions_original_currency on public.currency_conversions(original_currency);
