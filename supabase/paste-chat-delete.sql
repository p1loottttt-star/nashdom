create policy "messages delete own" on public.messages for delete to authenticated
  using (couple_id = (select my_couple()) and user_id = auth.uid());
create or replace function public.message_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('lr.bulk', true), '') <> 'on' then
    perform to_couple(old.couple_id, jsonb_build_object('t', 'messages', 'op', 'DELETE', 'row', jsonb_build_object('id', old.id, 'room', old.room)));
  end if;
  return null;
end $$;
create trigger messages_gone after delete on public.messages for each row execute function public.message_gone();
create or replace function public.clear_chat(p_room text) returns int
language plpgsql security definer set search_path = public as $$
declare c uuid := my_couple(); n int;
begin
  if c is null then raise exception 'no couple'; end if;
  perform set_config('lr.bulk', 'on', true);
  delete from messages where couple_id = c and room = p_room;
  get diagnostics n = row_count;
  perform set_config('lr.bulk', 'off', true);
  perform to_couple(c, jsonb_build_object('t', 'messages', 'op', 'CLEAR', 'row', jsonb_build_object('room', p_room)));
  return n;
end $$;
revoke execute on function public.clear_chat from anon, public;
grant execute on function public.clear_chat to authenticated;
