-- Every guarantor gets a unique 4-digit number (like the 4 digits inside a customer's loan id, but never the same as one).
alter table public.guarantors add column if not exists guarantor_number text;

do $$
declare r record; n text;
begin
  for r in select guarantor_id from public.guarantors where guarantor_number is null order by created_at loop
    loop
      n := (1000 + floor(random() * 9000))::int::text;
      exit when not exists (select 1 from public.guarantors where guarantor_number = n)
            and not exists (select 1 from public.loans where substring(loan_id from '(\d{3,6})\s*$') = n);
    end loop;
    update public.guarantors set guarantor_number = n where guarantor_id = r.guarantor_id;
  end loop;
end $$;

create unique index if not exists guarantors_number_uniq on public.guarantors (guarantor_number) where guarantor_number is not null;
