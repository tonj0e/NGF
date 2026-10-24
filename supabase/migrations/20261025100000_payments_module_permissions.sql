-- One "Payments" module with five assignable parts: payChat, payHistory, payMark, payBank, payOverride.
-- Old keys are converted once, then removed:
--   upiPayments        -> Guarantor: payChat + payHistory;  staff/agents: payMark + payChat + payHistory
--   paymentChat, gp:paymentChat -> payChat + payHistory
--   gp:payments        -> payHistory
--   upiPaymentsBank    -> payBank
--   upiPaymentsOverride-> payOverride
update public.staff_access sa
set permissions = coalesce((
  select array_agg(distinct p) from unnest(
    coalesce(sa.permissions, '{}'::text[])
    || case when 'upiPayments' = any(coalesce(sa.permissions, '{}')) then
         case when u.role = 'Guarantor' then array['payChat','payHistory'] else array['payMark','payChat','payHistory'] end
       else array[]::text[] end
    || case when 'paymentChat' = any(coalesce(sa.permissions, '{}')) or 'gp:paymentChat' = any(coalesce(sa.permissions, '{}')) then array['payChat','payHistory'] else array[]::text[] end
    || case when 'gp:payments' = any(coalesce(sa.permissions, '{}')) then array['payHistory'] else array[]::text[] end
    || case when 'upiPaymentsBank' = any(coalesce(sa.permissions, '{}')) then array['payBank'] else array[]::text[] end
    || case when 'upiPaymentsOverride' = any(coalesce(sa.permissions, '{}')) then array['payOverride'] else array[]::text[] end
  ) as p
  where p not in ('upiPayments','paymentChat','gp:paymentChat','gp:payments','upiPaymentsBank','upiPaymentsOverride')
), '{}'::text[])
from public.users u
where u.user_id = sa.user_id
  and coalesce(sa.permissions, '{}') && array['upiPayments','paymentChat','gp:paymentChat','gp:payments','upiPaymentsBank','upiPaymentsOverride'];

-- Payment Chat: which collection Saturday a message belongs to, how many wrong tries it used, and typed-in IDs.
alter table public.payment_chat add column if not exists collection_day text;
alter table public.payment_chat add column if not exists wrong_count integer not null default 0;
alter table public.payment_chat add column if not exists manual boolean not null default false;
create index if not exists payment_chat_day_idx on public.payment_chat (guarantor_id, collection_day);
