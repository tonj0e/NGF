-- Which reader (claude / nvidia) read each screenshot, so accuracy can be compared.
alter table public.payment_chat add column if not exists reader text;
