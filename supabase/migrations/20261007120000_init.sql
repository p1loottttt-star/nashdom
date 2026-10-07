-- «Наш дом» — схема Supabase (первая миграция). Применяется `npx supabase db push`.
-- Изоляция пар: каждая таблица видна только участникам своего дома (RLS через my_couple()).
-- Живые обновления — realtime.send из триггеров в закрытый канал пары couple:<id>.

create extension if not exists pgcrypto;

-- ---------- таблицы ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '' check (length(name) <= 40),
  emoji text not null default '🙂' check (length(emoji) <= 8),
  color text not null default '#ef6f8c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  avatar text check (length(avatar) <= 500),
  birthday date,
  about text not null default '' check (length(about) <= 300),
  city jsonb check (pg_column_size(city) < 2000), -- город для погоды за окном: { name, region, lat, lon }
  created_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Наш дом' check (length(title) <= 60),
  started date,
  invite text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table public.members (
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null unique references auth.users on delete cascade, -- один дом на человека
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

-- всё содержимое дома: записки, фото, альбомы, планы, тесты, игры… (вид/id/json — как в store.js; правила — rules.js)
create table public.items (
  couple_id uuid not null references public.couples on delete cascade,
  kind text not null check (kind ~ '^[a-z]{2,20}$'),
  id text not null check (id ~ '^[A-Za-z0-9_:.-]{1,120}$'),
  data jsonb, -- null = удалено (так удаление приходит партнёру)
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (couple_id, kind, id),
  check (pg_column_size(data) < 1000000)
);

create table public.messages (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  room text not null default 'tube' check (room ~ '^[a-z]{2,20}$'),
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_couple_time on public.messages (couple_id, created_at desc);
create index messages_user_time on public.messages (user_id, created_at desc);

-- копилка пары: начисления (+) и покупки/подарки (−) одной лентой; баланс = сумма amount.
-- Автор удалил аккаунт — строка остаётся без автора, баланс пары не меняется.
create table public.ledger (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid references auth.users on delete set null,
  reason text not null,
  ref text not null,
  amount int not null,
  item text,
  to_user uuid references auth.users on delete set null,
  note text check (length(note) <= 200),
  opened boolean not null default false,
  created_at timestamptz not null default now(),
  unique (couple_id, reason, ref) -- одно и то же действие не начисляется дважды
);
create index ledger_daily on public.ledger (couple_id, reason, created_at);

-- каталог магазина: здесь только цены (их проверяет buy); вид и названия — в catalog.js
-- вид: style — стены/пол/стол (раз и навсегда), decor — вещь в комнату (сколько угодно), gift — подарок партнёру
create table public.shop (
  id text primary key,
  kind text not null check (kind in ('decor', 'gift', 'style')),
  price int not null check (price >= 0)
);
insert into public.shop (id, kind, price) values
  ('w_rose', 'style', 0), ('w_cream', 'style', 0), ('w_sage', 'style', 0), ('w_sky', 'style', 0), ('w_lavender', 'style', 30), ('w_peach', 'style', 30),
  ('w_night', 'style', 45), ('wp_stripes', 'style', 60), ('wp_dots', 'style', 60), ('wp_hearts', 'style', 70), ('wp_checks', 'style', 70), ('wp_flowers', 'style', 90),
  ('f_oak', 'style', 0), ('f_light', 'style', 0), ('f_walnut', 'style', 60), ('f_herring', 'style', 90), ('f_tiles', 'style', 80), ('f_carpet', 'style', 70),
  ('d_classic', 'style', 0), ('d_compact', 'style', 80), ('d_scandi', 'style', 120), ('d_shelves', 'style', 160), ('d_worker', 'style', 180), ('d_loft', 'style', 200),
  ('frame', 'decor', 70), ('poster_paris', 'decor', 50), ('poster_mountains', 'decor', 50), ('poster_cat', 'decor', 50), ('poster_abstract', 'decor', 50), ('poster_moon', 'decor', 50),
  ('clock', 'decor', 60), ('mirror', 'decor', 90), ('neon', 'decor', 120), ('lights', 'decor', 110), ('shelf_s', 'decor', 40), ('shelf_l', 'decor', 70),
  ('cactus', 'decor', 40), ('succulent', 'decor', 30), ('candles', 'decor', 50), ('globe', 'decor', 90), ('books', 'decor', 35), ('vase_tulips', 'decor', 55),
  ('lava', 'decor', 85), ('jar_lights', 'decor', 60), ('cat_fig', 'decor', 45), ('heart_fig', 'decor', 40), ('dino', 'decor', 45), ('photo_stand', 'decor', 40),
  ('radio', 'decor', 75), ('lamp', 'decor', 140), ('pouf', 'decor', 160), ('side_table', 'decor', 90), ('monstera', 'decor', 150), ('tree', 'decor', 220),
  ('balloon', 'gift', 20), ('choco', 'gift', 30), ('flowers', 'gift', 45), ('teddy', 'gift', 70), ('ring', 'gift', 150)
on conflict (id) do update set kind = excluded.kind, price = excluded.price;

-- ошибки из браузера (смотреть в панели Supabase); писать могут все, читать — никто через API
create table public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  version text check (length(version) <= 40),
  user_id uuid default auth.uid(),
  msg text not null check (length(msg) <= 500),
  stack text check (length(stack) <= 4000),
  url text check (length(url) <= 300),
  ua text check (length(ua) <= 300)
);
create index client_errors_at on public.client_errors (at);

-- ---------- помощники ----------
create or replace function public.my_couple() returns uuid
language sql stable security definer set search_path = public as
$$ select couple_id from members where user_id = auth.uid() $$;

create or replace function public.server_now() returns double precision
language sql volatile as $$ select extract(epoch from clock_timestamp()) * 1000 $$;

-- профиль заводится сам при регистрации
create or replace function public.on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name) values (new.id, coalesce(left(new.raw_user_meta_data ->> 'name', 40), ''))
  on conflict do nothing;
  return new;
end $$;
create trigger on_signup after insert on auth.users for each row execute function public.on_signup();

-- ---------- квоты ----------
-- ponytail: count(*) по индексу пары на каждую вставку; при сотнях тысяч строк на пару — счётчик в couples
create or replace function public.items_quota() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from items where couple_id = new.couple_id) >= 20000 then raise exception 'quota: items'; end if;
  return new;
end $$;
create trigger items_quota before insert on public.items for each row execute function public.items_quota();

create or replace function public.messages_quota() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages where user_id = new.user_id and created_at > now() - interval '1 minute') >= 30
    then raise exception 'quota: messages'; end if;
  return new;
end $$;
create trigger messages_quota before insert on public.messages for each row execute function public.messages_quota();

-- ошибки: не больше 300 в минуту на всё; старше 30 дней изредка вычищаются здесь же (без pg_cron)
create or replace function public.errors_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from client_errors where at > now() - interval '1 minute') >= 300 then return null; end if;
  if random() < 0.01 then delete from client_errors where at < now() - interval '30 days'; end if;
  return new;
end $$;
create trigger errors_guard before insert on public.client_errors for each row execute function public.errors_guard();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.members enable row level security;
alter table public.items enable row level security;
alter table public.messages enable row level security;
alter table public.ledger enable row level security;
alter table public.shop enable row level security;
alter table public.client_errors enable row level security;

-- (select my_couple()) — считается один раз на запрос, а не на каждую строку
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or id in (select user_id from members where couple_id = (select my_couple())));
create policy "profiles insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles write" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "couples read" on public.couples for select to authenticated using (id = (select my_couple()));
create policy "couples write" on public.couples for update to authenticated
  using (id = (select my_couple())) with check (id = (select my_couple()));

create policy "members read" on public.members for select to authenticated using (couple_id = (select my_couple()));

create policy "items all" on public.items for all to authenticated
  using (couple_id = (select my_couple())) with check (couple_id = (select my_couple()));

create policy "messages read" on public.messages for select to authenticated using (couple_id = (select my_couple()));
create policy "messages write" on public.messages for insert to authenticated
  with check (couple_id = (select my_couple()) and user_id = auth.uid());

create policy "ledger read" on public.ledger for select to authenticated using (couple_id = (select my_couple()));

create policy "shop read" on public.shop for select to authenticated using (true);

create policy "errors write" on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- ---------- действия (только через них: создать/войти в дом, баллы, покупки, удалить себя) ----------
create or replace function public.create_couple(p_title text, p_started date) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if my_couple() is not null then raise exception 'already in a couple'; end if;
  insert into couples (title, started) values (coalesce(nullif(left(p_title, 60), ''), 'Наш дом'), p_started) returning id into c;
  insert into members (couple_id, user_id) values (c, auth.uid());
  return c;
end $$;

create or replace function public.join_couple(p_invite text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if my_couple() is not null then raise exception 'already in a couple'; end if;
  select id into c from couples where invite = lower(trim(p_invite)) for update;
  if c is null then raise exception 'bad invite'; end if;
  if (select count(*) from members where couple_id = c) >= 2 then raise exception 'couple is full'; end if;
  insert into members (couple_id, user_id) values (c, auth.uid());
  return c;
end $$;

-- начисление: сумму задаёт сервер по причине, ref не даёт начислить дважды, у частых действий дневной предел
-- ponytail: сервер не проверяет сам факт действия (фильм досмотрен?) — баллы без денег, накрутить можно только себе
create or replace function public.award(p_reason text, p_ref text) returns int
language plpgsql security definer set search_path = public as $$
declare c uuid := my_couple(); amt int; cap int; n int;
begin
  if c is null then raise exception 'no couple'; end if;
  select a, l into amt, cap from (values
    ('daily', 5, 2), ('note', 5, 3), ('photo', 2, 20), ('album', 20, 3),
    ('step', 10, 10), ('plan', 50, 2), ('watch', 30, 3), ('quiz', 10, 3), ('game', 5, 5)
  ) as t(r, a, l) where r = p_reason;
  if amt is null then raise exception 'bad reason'; end if;
  perform pg_advisory_xact_lock(hashtext(c::text));
  select count(*) into n from ledger where couple_id = c and reason = p_reason and created_at > date_trunc('day', now());
  if n >= cap then return 0; end if;
  insert into ledger (couple_id, user_id, reason, ref, amount) values (c, auth.uid(), p_reason, left(p_ref, 120), amt)
  on conflict do nothing;
  return case when found then amt else 0 end;
end $$;

-- покупка в дом (p_to = null) или подарок партнёру
create or replace function public.buy(p_item text, p_to uuid, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare c uuid := my_couple(); s shop; bal int; rid bigint;
begin
  if c is null then raise exception 'no couple'; end if;
  perform pg_advisory_xact_lock(hashtext(c::text)); -- до проверок: двойной клик не купит вещь дважды
  select * into s from shop where id = p_item;
  if s.id is null then raise exception 'no item'; end if;
  if s.kind = 'gift' and (p_to is null or p_to = auth.uid() or not exists (select 1 from members where couple_id = c and user_id = p_to))
    then raise exception 'gift needs partner'; end if;
  -- стиль (стены, пол, стол) у каждого свой и покупается один раз; декора можно сколько угодно
  if s.kind = 'style' and exists (select 1 from ledger where couple_id = c and user_id = auth.uid() and reason = 'style' and item = p_item)
    then raise exception 'already owned'; end if;
  select coalesce(sum(amount), 0) into bal from ledger where couple_id = c;
  if bal < s.price then raise exception 'not enough points'; end if;
  insert into ledger (couple_id, user_id, reason, ref, amount, item, to_user, note)
  values (c, auth.uid(), s.kind, gen_random_uuid()::text, -s.price, p_item, case when s.kind = 'gift' then p_to end, left(p_note, 200))
  returning id into rid;
  return rid;
end $$;

create or replace function public.open_gift(p_id bigint) returns void
language sql security definer set search_path = public as
$$ update ledger set opened = true where id = p_id and to_user = auth.uid() $$;

-- удалить свой аккаунт: профиль, членство и сообщения — каскадом; баллы остаются паре без автора.
-- Последний в доме — дом удаляется целиком (файлы папки пары клиент удаляет до вызова, через Storage API).
create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = public, auth as $$
declare c uuid := my_couple();
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if c is not null and (select count(*) from members where couple_id = c) <= 1 then delete from couples where id = c; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.create_couple, public.join_couple, public.award, public.buy, public.open_gift, public.delete_me from anon, public;
grant execute on function public.create_couple, public.join_couple, public.award, public.buy, public.open_gift, public.delete_me, public.server_now, public.my_couple to authenticated;

-- ---------- Realtime: изменения — в закрытый канал пары ----------
-- событие 'db': { t: таблица, op, row }. Большая запись items уходит без data (big: true) — клиент дочитывает сам.
create or replace function public.to_couple(c uuid, body jsonb) returns void
language sql security definer set search_path = public, realtime as
$$ select realtime.send(body, 'db', 'couple:' || c::text, true) where c is not null $$;
revoke execute on function public.to_couple from anon, authenticated, public;

create or replace function public.broadcast_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old); body jsonb;
begin
  if tg_table_name = 'items' then
    body := jsonb_build_object('kind', r.kind, 'id', r.id, 'updated_by', r.updated_by, 'updated_at', r.updated_at);
    body := body || case when octet_length(r.data::text) > 100000 then jsonb_build_object('big', true) else jsonb_build_object('data', r.data) end;
  else
    body := to_jsonb(r);
  end if;
  perform to_couple(r.couple_id, jsonb_build_object('t', tg_table_name, 'op', tg_op, 'row', body));
  return null;
end $$;
create trigger items_live after insert or update on public.items for each row execute function public.broadcast_row();
create trigger messages_live after insert on public.messages for each row execute function public.broadcast_row();
create trigger ledger_live after insert or update on public.ledger for each row execute function public.broadcast_row();
create trigger members_live after insert or delete on public.members for each row execute function public.broadcast_row();

-- профиль и дом: партнёру достаточно знать, что люди поменялись (он перечитает)
create or replace function public.broadcast_people() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform to_couple(case when tg_table_name = 'couples' then new.id else (select couple_id from members where user_id = new.id) end,
    jsonb_build_object('t', 'people', 'op', tg_op));
  return null;
end $$;
create trigger profiles_live after update on public.profiles for each row execute function public.broadcast_people();
create trigger couples_live after update on public.couples for each row execute function public.broadcast_people();

-- закрытый канал пары (присутствие, «печатает», плеер, события базы): слушать и писать могут только участники
create policy "couple channel read" on realtime.messages for select to authenticated
  using (realtime.topic() = 'couple:' || (select my_couple())::text);
create policy "couple channel write" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'couple:' || (select my_couple())::text);

-- ---------- Storage: фото, закрытая корзина ----------
-- путь <couple_id>/<uuid>.jpg; читают по подписанным ссылкам только участники пары
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('house', 'house', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "house read" on storage.objects for select to authenticated
  using (bucket_id = 'house' and (storage.foldername(name))[1] = (select my_couple())::text);
-- сколько файлов у моей пары (своя функция: политика не может читать ту же таблицу — рекурсия)
create or replace function public.house_files() returns int
language sql stable security definer set search_path = public, storage as
$$ select count(*)::int from storage.objects where bucket_id = 'house' and name like my_couple()::text || '/%' $$;
revoke execute on function public.house_files from anon, public;
grant execute on function public.house_files to authenticated;

create policy "house upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'house' and (storage.foldername(name))[1] = (select my_couple())::text and (select house_files()) < 3000);
create policy "house delete" on storage.objects for delete to authenticated
  using (bucket_id = 'house' and (storage.foldername(name))[1] = (select my_couple())::text);
