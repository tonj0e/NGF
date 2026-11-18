-- Payment Chat poll speed (additive, safe to run more than once).
-- Earlier tries of the shown messages: status = 'Earlier try' and parent_id in (...)
create index if not exists payment_chat_earlier_parent_idx on public.payment_chat (parent_id) where status = 'Earlier try';
-- "Needs fixing" and "send again" lists of one guarantor: guarantor_id = ?, kind = 'slip', status in (...)
create index if not exists payment_chat_guarantor_kind_status_idx on public.payment_chat (guarantor_id, kind, status);
