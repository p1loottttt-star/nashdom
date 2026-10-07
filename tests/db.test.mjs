// Схема облака (supabase/migrations) в PGlite — Postgres прямо в Node, без Docker.
// Заглушки повторяют то, что даёт Supabase: роли anon/authenticated, auth.uid() из JWT, realtime.send/topic, storage.
// Проверяет: изоляцию пар (RLS), вход по приглашению, баллы и покупки, квоты, закрытый канал пары, фото, удаление аккаунта.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { MIGRATIONS } from './sql.mjs';

const SUPABASE = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema realtime;
create table realtime.messages (id bigint generated always as identity primary key, topic text not null, extension text not null,
  payload jsonb, event text, private boolean default false, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
  language sql security definer as $$ insert into realtime.messages (topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private) $$;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, realtime, storage to anon, authenticated;
grant select, insert, update, delete on realtime.messages, storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

const db = await PGlite.create({ extensions: { pgcrypto } });
await db.exec(SUPABASE);
for (const m of MIGRATIONS) await db.exec(m);

// ---------- помощники ----------
const U = Object.fromEntries(['a1', 'a2', 'b1', 'b2', 'c1'].map((k) => [k, crypto.randomUUID()]));
for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, k + '@t.t', { name: k }]);
let who = null;
async function as(k, topic = '') { // k = null → anon
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('realtime.topic', $2, false)", [k ? U[k] : '', topic]);
  await db.exec(k ? 'set role authenticated' : 'set role anon');
  who = k;
}
const q = async (sql, args) => (await db.query(sql, args)).rows;
const one = async (sql, args) => Object.values((await q(sql, args))[0] || {})[0];
async function fails(sql, args, re) {
  await db.exec('savepoint t');
  try { await db.query(sql, args); } catch (e) { await db.exec('rollback to savepoint t'); assert.match(e.message, re, `${who}: ${sql}`); return; }
  await db.exec('rollback to savepoint t');
  assert.fail(`${who}: должно упасть (${re}): ${sql}`);
}
await db.exec('begin'); // savepoint работает только внутри транзакции; весь тест — одна транзакция

// ---------- пары и приглашение ----------
await as('a1'); const A = await one("select create_couple('Дом А', '2024-09-27')");
const inviteA = await one('select invite from couples');
await as('a2'); assert.equal(await one('select join_couple($1)', [inviteA.toUpperCase() + ' ']), A, 'вход по приглашению (регистр и пробелы не мешают)');
await as('c1'); await fails('select join_couple($1)', [inviteA], /couple is full/);
await fails("select join_couple('000000000000')", [], /bad invite/);
await as('b1'); const B = await one("select create_couple('Дом Б', null)");
const inviteB = await one('select invite from couples');
await as('b2'); await one('select join_couple($1)', [inviteB]);
await as('a1'); await fails("select create_couple('ещё', null)", [], /already in a couple/);
assert.equal((await q('select * from couples')).length, 1, 'видит только свой дом');
assert.deepEqual((await q('select name from profiles order by name')).map((r) => r.name), ['a1', 'a2'], 'профили — только своей пары (имя из регистрации)');

// ---------- содержимое дома: изоляция и правила ----------
await as('a1');
await q("insert into items (couple_id, kind, id, data) values ($1, 'quiz', 'who-love:a1', '{\"x\":1}')", [A]);
await fails("insert into items (couple_id, kind, id, data) values ($1, 'notes', 'a b', '{}')", [A], /check/);
await fails("insert into items (couple_id, kind, id, data) values ($1, 'Notes', 'x', '{}')", [A], /check/);
await fails("insert into items (couple_id, kind, id, data) values ($1, 'notes', 'x', '{}')", [B], /row-level security/);
await as('b1');
assert.equal((await q('select * from items')).length, 0, 'чужой дом не виден');
assert.equal((await q("update items set data = '{}' where couple_id = $1 returning id", [A])).length, 0, 'чужой дом не правится');
await as('a2');
assert.equal((await q("select data from items where kind = 'quiz'"))[0].data.x, 1, 'партнёр видит запись');

// ---------- закрытый канал пары: событие базы пришло, чужим не видно ----------
await as('a2', 'couple:' + A);
const ev = await q("select payload from realtime.messages where event = 'db' and payload->>'t' = 'items'");
assert.equal(ev.length, 1); assert.equal(ev[0].payload.row.id, 'who-love:a1'); assert.equal(ev[0].payload.row.data.x, 1);
await as('b1', 'couple:' + A);
assert.equal((await q('select * from realtime.messages')).length, 0, 'чужая пара не слушает канал');
await fails("insert into realtime.messages (topic, extension, payload) values ('couple:' || $1, 'broadcast', '{}')", [A], /row-level security/);
// большая запись уходит без данных
await as('a1');
await q("insert into items (couple_id, kind, id, data) values ($1, 'notes', 'big', jsonb_build_object('s', repeat('x', 200000)))", [A]);
const big = (await (async () => { await as('a1', 'couple:' + A); return q("select payload from realtime.messages where payload->'row'->>'id' = 'big'"); })())[0].payload.row;
assert.equal(big.big, true); assert.equal(big.data, undefined);

// ---------- баллы ----------
await as('a1');
assert.equal(await one("select award('note', 'n1')"), 5);
assert.equal(await one("select award('note', 'n1')"), 0, 'то же действие второй раз — 0');
await one("select award('note', 'n2')"); await one("select award('note', 'n3')");
assert.equal(await one("select award('note', 'n4')"), 0, 'дневной предел записок — 3');
await fails("select award('cheat', 'x')", [], /bad reason/);
await fails("insert into ledger (couple_id, user_id, reason, ref, amount) values ($1, $2, 'x', 'y', 1000)", [A, U.a1], /row-level security/);
await as('b1'); assert.equal(await one('select coalesce(sum(amount), 0) from ledger'), 0, 'чужие баллы не видны');

// ---------- покупки и подарки ----------
await as('a1');
await fails("select buy('ring', $1, null)", [U.a2], /not enough points/);
assert.equal(await one("select award('album', 'al1')"), 20); // 15 + 20 = 35
await fails("select buy('nope', null, null)", [], /no item/);
const gift = await one("select buy('balloon', $1, 'тебе')", [U.a2]);
await fails("select buy('balloon', $1, null)", [U.a1], /gift needs partner/);
await fails("select buy('balloon', $1, null)", [U.b1], /gift needs partner/);
await one("select buy('w_rose', null, null)");
await fails("select buy('w_rose', null, null)", [], /already owned/);
await as('a2');
await one('select open_gift($1)', [gift]);
assert.equal(await one('select opened from ledger where id = $1', [gift]), true);
await as('a1'); assert.equal(await one('select sum(amount)::int from ledger'), 15, '35 − шарик 20 − стены 0');

// ---------- квоты ----------
await as('a1');
for (let i = 0; i < 30; i++) await q("insert into messages (couple_id, text) values ($1, 'привет')", [A]);
await fails("insert into messages (couple_id, text) values ($1, 'ещё')", [A], /quota: messages/);
await as('a2'); await q("insert into messages (couple_id, text) values ($1, 'а я могу')", [A]);
await db.exec('reset role');
await db.exec('alter table items disable trigger items_quota');
await db.query("insert into items (couple_id, kind, id, data) select $1, 'fill', 'f' || g, '{}' from generate_series(1, 19997) g", [A]);
await db.exec('alter table items enable trigger items_quota');
await as('a1');
await q("insert into items (couple_id, kind, id, data) values ($1, 'notes', 'last', '{}')", [A]); // 20 000-я
await fails("insert into items (couple_id, kind, id, data) values ($1, 'notes', 'over', '{}')", [A], /quota: items/);
await q("update items set data = '{\"y\":2}' where couple_id = $1 and kind = 'notes' and id = 'last'", [A]); // правка — не новая строка

// ---------- фото: закрытая корзина ----------
await db.exec('reset role');
assert.equal(await one("select public from storage.buckets where id = 'house'"), false);
await as('a1');
await q("insert into storage.objects (bucket_id, name) values ('house', $1)", [A + '/p1.jpg']);
await fails("insert into storage.objects (bucket_id, name) values ('house', $1)", [B + '/p1.jpg'], /row-level security/);
await as('a2'); assert.equal((await q('select * from storage.objects')).length, 1, 'партнёр видит фото');
await as('b1'); assert.equal((await q('select * from storage.objects')).length, 0, 'чужая пара — нет');

// ---------- ошибки из браузера ----------
await as(null);
await q("insert into client_errors (msg, version) values ('boom', 'abc')");
assert.equal((await q('select * from client_errors')).length, 0, 'читать ошибки через API нельзя');
await fails("insert into client_errors (msg, user_id) values ('x', $1)", [U.a1], /row-level security/);
await fails('select award($1, $2)', ['note', 'x'], /permission denied/);

// ---------- удалить аккаунт ----------
await as('a2');
const before = await one('select sum(amount) from ledger');
await one('select delete_me()');
await as('a1');
assert.equal((await q('select * from members')).length, 1, 'партнёр ушёл, дом остался');
assert.equal(await one('select sum(amount) from ledger'), before, 'баланс пары не изменился');
assert.equal(await one("select count(*)::int from messages where text = 'а я могу'"), 0, 'сообщения ушедшего удалены');
assert.equal(await one('select opened from ledger where id = $1', [gift]), true);
await one('select delete_me()');
await db.exec('reset role');
assert.equal(await one('select count(*)::int from couples where id = $1', [A]), 0, 'последний ушёл — дома нет');
assert.equal(await one('select count(*)::int from items where couple_id = $1', [A]), 0);
assert.equal(await one('select count(*)::int from couples where id = $1', [B]), 1, 'чужой дом не тронут');

await db.exec('rollback');
console.log('db ok');
