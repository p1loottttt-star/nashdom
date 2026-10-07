-- «Наш дом» — схема Supabase. Вставить целиком в SQL Editor и нажать Run.
-- Повторный запуск безопасен: всё через if not exists / or replace / drop policy if exists.
-- Изоляция пар: каждая таблица видна только участникам своего дома (RLS через my_couple()).

create extension if not exists pgcrypto;

-- ---------- таблицы ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '' check (length(name) <= 40),
  emoji text not null default '🙂' check (length(emoji) <= 8),
  color text not null default '#ef6f8c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  avatar text check (length(avatar) <= 500),
  birthday date,
  about text not null default '' check (length(about) <= 300),
  created_at timestamptz not null default now()
);
-- город для погоды за окном: { name, region, lat, lon }
alter table public.profiles add column if not exists city jsonb check (pg_column_size(city) < 2000);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Наш дом' check (length(title) <= 60),
  started date,
  invite text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null unique references auth.users on delete cascade, -- один дом на человека
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

-- всё содержимое дома: записки, фото, альбомы, планы… (вид/id/json — как в store.js)
create table if not exists public.items (
  couple_id uuid not null references public.couples on delete cascade,
  kind text not null check (kind ~ '^[a-z]{2,20}$'),
  id text not null check (id ~ '^[A-Za-z0-9_:.-]{1,120}$'),
  data jsonb, -- null = удалено (так удаление приходит партнёру через Realtime с проверкой RLS)
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (couple_id, kind, id),
  check (pg_column_size(data) < 1000000)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  room text not null default 'tube' check (room ~ '^[a-z]{2,20}$'),
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_couple_time on public.messages (couple_id, created_at desc);

-- копилка пары: начисления (+) и покупки/подарки (−) одной лентой; баланс = сумма amount
create table if not exists public.ledger (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
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

-- каталог магазина: здесь только цены (их проверяет buy); вид и названия — в catalog.js
create table if not exists public.shop (
  id text primary key,
  kind text not null,
  price int not null check (price >= 0)
);
-- вид: style — стены/пол/стол (раз и навсегда), decor — вещь в комнату (сколько угодно), gift — подарок партнёру
alter table public.shop drop constraint if exists shop_kind_check;
alter table public.shop add constraint shop_kind_check check (kind in ('decor', 'gift', 'style'));
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
drop trigger if exists on_signup on auth.users;
create trigger on_signup after insert on auth.users for each row execute function public.on_signup();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.members enable row level security;
alter table public.items enable row level security;
alter table public.messages enable row level security;
alter table public.ledger enable row level security;
alter table public.shop enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or id in (select user_id from members where couple_id = my_couple()));
drop policy if exists "profiles insert" on public.profiles;
create policy "profiles insert" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles write" on public.profiles;
create policy "profiles write" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "couples read" on public.couples;
create policy "couples read" on public.couples for select to authenticated using (id = my_couple());
drop policy if exists "couples write" on public.couples;
create policy "couples write" on public.couples for update to authenticated
  using (id = my_couple()) with check (id = my_couple());

drop policy if exists "members read" on public.members;
create policy "members read" on public.members for select to authenticated using (couple_id = my_couple());

drop policy if exists "items all" on public.items;
create policy "items all" on public.items for all to authenticated
  using (couple_id = my_couple()) with check (couple_id = my_couple());

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated using (couple_id = my_couple());
drop policy if exists "messages write" on public.messages;
create policy "messages write" on public.messages for insert to authenticated
  with check (couple_id = my_couple() and user_id = auth.uid());

drop policy if exists "ledger read" on public.ledger;
create policy "ledger read" on public.ledger for select to authenticated using (couple_id = my_couple());

drop policy if exists "shop read" on public.shop;
create policy "shop read" on public.shop for select to authenticated using (true);

-- ---------- действия (только через них: создать/войти в дом, баллы, покупки) ----------
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

revoke execute on function public.create_couple, public.join_couple, public.award, public.buy, public.open_gift from anon, public;
grant execute on function public.create_couple, public.join_couple, public.award, public.buy, public.open_gift, public.server_now, public.my_couple to authenticated;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['items', 'messages', 'ledger', 'profiles', 'couples', 'members'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- закрытый канал пары (присутствие, «печатает», плеер, реакции): слушать и писать могут только участники
drop policy if exists "couple channel read" on realtime.messages;
create policy "couple channel read" on realtime.messages for select to authenticated
  using (realtime.topic() = 'couple:' || my_couple()::text);
drop policy if exists "couple channel write" on realtime.messages;
create policy "couple channel write" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'couple:' || my_couple()::text);

-- ---------- Storage: фото ----------
-- ponytail: корзина публичная, адреса неугадываемые (uuid) — как было на Vercel Blob; нужна полная закрытость → private + signed URLs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('house', 'house', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "house upload" on storage.objects;
create policy "house upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'house' and (storage.foldername(name))[1] = my_couple()::text);
drop policy if exists "house delete" on storage.objects;
create policy "house delete" on storage.objects for delete to authenticated
  using (bucket_id = 'house' and (storage.foldername(name))[1] = my_couple()::text);
