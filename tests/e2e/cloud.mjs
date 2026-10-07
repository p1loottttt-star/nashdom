// Сквозная проверка облака на локальном Supabase (CI: `supabase start`, миграции применяются сами).
// Две пары по две учётки через supabase-js: события базы приходят партнёру через закрытый канал,
// чужая пара их не слышит; тесты (id с ':'), игры, записки, баллы, подарок, чат; фото по подписанной ссылке.
// Запуск: node --env-file=.env.e2e tests/e2e/cloud.mjs  (переменные из `supabase status -o env`)
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.API_URL, KEY = process.env.ANON_KEY || process.env.PUBLISHABLE_KEY;
assert.ok(URL_ && KEY, 'нужны API_URL и ANON_KEY (supabase status -o env)');
const ok = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function user(name) {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
  const email = `${name}-${Date.now()}@e2e.test`;
  ok(await sb.auth.signUp({ email, password: 'password-123', options: { data: { name } } }), 'signUp ' + name);
  const { data: { user: u } } = await sb.auth.getUser();
  return { sb, id: u.id, name };
}
// подписка на канал пары; events — всё, что пришло событием db
async function listen(u, couple) {
  await u.sb.realtime.setAuth();
  const events = [];
  const ch = u.sb.channel('couple:' + couple, { config: { private: true } }).on('broadcast', { event: 'db' }, ({ payload }) => events.push(payload));
  const status = await new Promise((done) => { const t = setTimeout(() => done('TIMEOUT'), 10000); ch.subscribe((s) => { if (s !== 'JOINING') { clearTimeout(t); done(s); } }); });
  return { events, status, ch };
}
async function got(l, pred, what, ms = 8000) {
  for (let t = 0; t < ms; t += 100) { const e = l.events.find(pred); if (e) return e; await wait(100); }
  assert.fail(`не пришло: ${what}; пришло: ${JSON.stringify(l.events.map((e) => [e.t, e.row?.id || e.row?.kind]))}`);
}

const [a1, a2, b1, b2] = await Promise.all(['a1', 'a2', 'b1', 'b2'].map(user));
const A = ok(await a1.sb.rpc('create_couple', { p_title: 'Дом А', p_started: '2024-09-27' }), 'create A');
const inviteA = ok(await a1.sb.from('couples').select('invite').single(), 'invite').invite;
assert.equal(ok(await a2.sb.rpc('join_couple', { p_invite: inviteA }), 'join A'), A);
const B = ok(await b1.sb.rpc('create_couple', { p_title: 'Дом Б', p_started: null }), 'create B');
ok(await b2.sb.rpc('join_couple', { p_invite: ok(await b1.sb.from('couples').select('invite').single(), 'invite B').invite }), 'join B');

const la2 = await listen(a2, A);
assert.equal(la2.status, 'SUBSCRIBED', 'партнёр подписан на канал пары');
const lb1 = await listen(b1, A); // чужой: не должен ничего получить
console.log('чужая пара на канале А:', lb1.status);

// тест с ':' в id, игра, записка — приходят партнёру
const put = (u, kind, id, data) => u.sb.from('items').upsert({ couple_id: A, kind, id, data, updated_by: u.id, updated_at: new Date().toISOString() });
ok(await put(a1, 'quiz', `who-love:${a1.id}`, { test: 'who-love', answers: [1, 2] }), 'quiz');
assert.deepEqual((await got(la2, (e) => e.t === 'items' && e.row.kind === 'quiz', 'тест')).row.data.answers, [1, 2]);
ok(await put(a1, 'game', 'g1', { kind: 'ttt', players: [a1.id, a2.id], turn: a2.id }), 'game');
assert.equal((await got(la2, (e) => e.t === 'items' && e.row.id === 'g1', 'ход в игре')).row.data.turn, a2.id);
ok(await put(a1, 'notes', 'n1', { text: 'привет', from: 'a1' }), 'note');
await got(la2, (e) => e.t === 'items' && e.row.id === 'n1', 'записка');

// баллы, подарок, чат
assert.equal(ok(await a1.sb.rpc('award', { p_reason: 'note', p_ref: 'n1' }), 'award'), 5);
assert.equal(ok(await a1.sb.rpc('award', { p_reason: 'album', p_ref: 'al1' }), 'award album'), 20);
await got(la2, (e) => e.t === 'ledger' && e.row.reason === 'album', 'начисление');
const gift = ok(await a1.sb.rpc('buy', { p_item: 'balloon', p_to: a2.id, p_note: 'тебе' }), 'buy gift');
await got(la2, (e) => e.t === 'ledger' && e.row.id === gift && e.row.to_user === a2.id, 'подарок');
ok(await a1.sb.from('messages').insert({ couple_id: A, room: 'tube', text: 'смотрим?' }), 'message');
await got(la2, (e) => e.t === 'messages' && e.row.text === 'смотрим?', 'сообщение чата');

// большая запись — без данных, партнёр дочитывает
ok(await put(a1, 'notes', 'big', { s: 'x'.repeat(150000) }), 'big');
const big = await got(la2, (e) => e.t === 'items' && e.row.id === 'big', 'большая запись');
assert.equal(big.row.big, true);
assert.equal(ok(await a2.sb.from('items').select('data').eq('couple_id', A).eq('kind', 'notes').eq('id', 'big').single(), 'read big').data.s.length, 150000);

await wait(1500);
assert.equal(lb1.events.length, 0, 'чужая пара не получила ни одного события дома А');
assert.equal(ok(await b1.sb.from('items').select('id').eq('couple_id', A), 'b1 read').length, 0, 'чужая пара не читает дом А');

// фото: закрытая корзина
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const path = `${A}/${crypto.randomUUID()}.jpg`;
ok(await a1.sb.storage.from('house').upload(path, jpg, { contentType: 'image/jpeg' }), 'upload');
const signed = ok(await a2.sb.storage.from('house').createSignedUrl(path, 60), 'partner sign').signedUrl;
assert.equal((await fetch(signed)).status, 200, 'партнёр открывает фото');
const pub = `${URL_}/storage/v1/object/public/house/${path}`;
assert.notEqual((await fetch(pub)).status, 200, 'публичного адреса нет');
assert.ok((await b1.sb.storage.from('house').createSignedUrl(path, 60)).error, 'чужая пара не подписывает фото');
await assert.rejects(async () => ok(await b1.sb.storage.from('house').upload(`${A}/x.jpg`, jpg, { contentType: 'image/jpeg' }), 'upload'), 'чужая пара не кладёт фото в дом А');

// удалить аккаунт: партнёр уходит — дом и баланс остаются
const before = ok(await a1.sb.from('ledger').select('amount'), 'ledger').reduce((s, r) => s + r.amount, 0);
ok(await a2.sb.rpc('delete_me'), 'delete_me');
assert.equal(ok(await a1.sb.from('members').select('user_id'), 'members').length, 1);
assert.equal(ok(await a1.sb.from('ledger').select('amount'), 'ledger after').reduce((s, r) => s + r.amount, 0), before);

for (const u of [a1, a2, b1, b2]) await u.sb.removeAllChannels();
console.log('cloud e2e ok');
process.exit(0);
