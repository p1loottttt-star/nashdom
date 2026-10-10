-- начисление за записку, выброшенную точно в мусорку (+3, до 10 раз в день)
create or replace function public.award(p_reason text, p_ref text) returns int
language plpgsql security definer set search_path = public as $$
declare c uuid := my_couple(); amt int; cap int; n int;
begin
  if c is null then raise exception 'no couple'; end if;
  select a, l into amt, cap from (values
    ('daily', 5, 2), ('note', 5, 3), ('photo', 2, 20), ('album', 20, 3),
    ('step', 10, 10), ('plan', 50, 2), ('watch', 30, 3), ('quiz', 10, 3), ('game', 5, 5), ('trash', 3, 10)
  ) as t(r, a, l) where r = p_reason;
  if amt is null then raise exception 'bad reason'; end if;
  perform pg_advisory_xact_lock(hashtext(c::text));
  select count(*) into n from ledger where couple_id = c and reason = p_reason and created_at > date_trunc('day', now());
  if n >= cap then return 0; end if;
  insert into ledger (couple_id, user_id, reason, ref, amount) values (c, auth.uid(), p_reason, left(p_ref, 120), amt)
  on conflict do nothing;
  return case when found then amt else 0 end;
end $$;
