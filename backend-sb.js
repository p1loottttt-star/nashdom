// Облачный режим: Supabase напрямую из браузера. Защита — RLS (supabase/schema.sql): пара видит только свой дом.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { signIn, onboard, offerMigration } from './auth.js';

let sb, H, uid, cid, chan, offset = 0, mine = {};
let people = { me: null, partner: null, couple: null };
const ERR = { 'not enough points': 'Не хватает баллов', 'already owned': 'Это у тебя уже есть', 'gift needs partner': 'Подарок можно отправить, когда партнёр присоединится', 'no item': 'Такой вещи нет' };
const check = ({ data, error }) => {
  if (error) { const k = Object.keys(ERR).find((x) => error.message?.includes(x)); throw new Error(k ? ERR[k] : error.message); }
  return data;
};
const PROFILE = 'id,name,emoji,color,avatar,birthday,about,city';

async function loadPeople() {
  const [c, m] = await Promise.all([
    sb.from('couples').select('id,title,started,invite').eq('id', cid).single().then(check),
    sb.from('members').select('user_id').eq('couple_id', cid).then(check),
  ]);
  const ids = m.map((x) => x.user_id);
  const ps = check(await sb.from('profiles').select(PROFILE).in('id', ids));
  people = { couple: c, me: ps.find((p) => p.id === uid), partner: ps.find((p) => p.id !== uid) || null };
  return people;
}

// все строки таблицы пары постранично (PostgREST отдаёт не больше 1000 за раз; без порядка страницы путаются)
async function loadAll(table, cols, order, more = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = more(sb.from(table).select(cols).eq('couple_id', cid));
    for (const o of order) q = q.order(o);
    const page = check(await q.range(from, from + 999));
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
const loadItems = async () => {
  const data = {};
  for (const r of await loadAll('items', 'kind,id,data', ['kind', 'id'], (q) => q.not('data', 'is', null))) (data[r.kind] ||= {})[r.id] = r.data;
  return data;
};

// пока грузим дом, события Realtime копим и применяем поверх загруженного — иначе правки партнёра в эти секунды теряются
let ready = false, queue = [];
const last = {}; // мои последние записи: эхо своей старой правки не должно затирать новую
const hold = (fn) => (...a) => (ready ? fn(...a) : queue.push([fn, a]));

export async function init(hooks, cfg) {
  H = hooks;
  sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
  let { data: { session } } = await sb.auth.getSession();
  if (!session) session = await signIn(sb);
  uid = session.user.id;

  cid = check(await sb.rpc('my_couple'));
  if (!cid) cid = await onboard(sb, uid);
  await loadPeople();
  if (!people.me?.name) { await onboard(sb, uid, { nameOnly: true }); await loadPeople(); }

  await subscribe();
  let data = await loadItems();
  if (!Object.keys(data).length && await offerMigration(sb, { put: (k, i, v) => put(k, i, v), upload: uploadBlob })) data = await loadItems();
  let ledger = await loadAll('ledger', '*', ['id']);

  // часы сервера: смещение с поправкой на половину пути запроса
  const t0 = Date.now(), srv = check(await sb.rpc('server_now')), t1 = Date.now();
  offset = srv - (t0 + t1) / 2;

  // события, пришедшие во время загрузки, — поверх загруженного
  const hooksNow = H;
  H = {
    ...hooksNow,
    item: (k, i, v) => { if (v == null) delete data[k]?.[i]; else (data[k] ||= {})[i] = v; },
    ledger: (r) => { ledger = ledger.filter((x) => x.id !== r.id).concat(r); },
  };
  for (const [fn, a] of queue) fn(...a);
  H = hooksNow; queue = []; ready = true;
  return { data, people, ledger };
}

const onItem = hold(async ({ new: r, errors }) => {
  if (!r?.kind) return;
  if (r.updated_by === uid && Date.parse(r.updated_at) <= Date.parse(last[r.kind + '/' + r.id] || 0)) return; // эхо моей же записи
  if (errors?.length) { // слишком большая запись пришла без данных — дочитываем сами
    const { data } = await sb.from('items').select('data').eq('couple_id', cid).eq('kind', r.kind).eq('id', r.id).maybeSingle();
    r.data = data?.data ?? null;
  }
  H.item(r.kind, r.id, r.data);
});

function joined(name) {
  return (s, e) => { if (s !== 'SUBSCRIBED') console.warn(`realtime ${name}:`, s, e || ''); };
}

async function subscribe() {
  await sb.realtime.setAuth(); // каналам нужен токен пользователя, а не anon — иначе RLS молча отсечёт все события
  const f = `couple_id=eq.${cid}`;
  const reloadPeople = () => loadPeople().then(H.people).catch(console.warn);
  await new Promise((done) => {
    const t = setTimeout(done, 6000); // Realtime не ответил — дом всё равно открываем
    sb.channel('db:' + cid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: f }, onItem)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: f }, ({ new: m }) => H.message(m))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger', filter: f }, hold(({ new: r }) => r?.id && H.ledger(r)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: f }, reloadPeople)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, reloadPeople)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couples' }, reloadPeople)
      .subscribe((s, e) => { joined('db')(s, e); if (s === 'SUBSCRIBED') { clearTimeout(t); done(); } });
  });

  // закрытый канал пары: слушать и писать могут только двое (RLS на realtime.messages)
  chan = sb.channel('couple:' + cid, { config: { private: true, broadcast: { self: false }, presence: { key: uid } } })
    .on('broadcast', { event: '*' }, ({ event, payload }) => H.live(event, payload))
    .on('presence', { event: 'sync' }, () => H.presence())
    .subscribe((s, e) => { joined('couple')(s, e); if (s === 'SUBSCRIBED') chan.track(mine); });
}

const row = (kind, id, data) => { const at = new Date().toISOString(); last[kind + '/' + id] = at; return { couple_id: cid, kind, id, data, updated_by: uid, updated_at: at }; };
export async function put(kind, id, value) { check(await sb.from('items').upsert(row(kind, id, value))); }
export async function del(kind, id) { check(await sb.from('items').upsert(row(kind, id, null))); } // null = удалено, партнёр узнаёт через Realtime

async function uploadBlob(blob, type = 'image/jpeg') {
  const path = `${cid}/${crypto.randomUUID()}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
  check(await sb.storage.from('house').upload(path, blob, { contentType: type, cacheControl: '31536000' }));
  return sb.storage.from('house').getPublicUrl(path).data.publicUrl;
}
export async function upload(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  return uploadBlob(blob);
}

export async function saveProfile(patch) { check(await sb.from('profiles').update(patch).eq('id', uid)); }
export async function saveCouple(patch) { check(await sb.from('couples').update(patch).eq('id', cid)); }
export async function signOut() { await sb.auth.signOut(); location.reload(); }

export const live = {
  send(ev, payload) { chan?.send({ type: 'broadcast', event: ev, payload }); },
  track(state) { mine = state || {}; chan?.track(mine); },
  presence() {
    const st = chan?.presenceState() || {};
    return Object.fromEntries(Object.entries(st).filter(([k]) => k !== uid).map(([k, metas]) => [k, metas[metas.length - 1] || {}]));
  },
};
export const serverNow = () => Date.now() + offset;

export async function messages(room) {
  const r = check(await sb.from('messages').select('*').eq('couple_id', cid).eq('room', room).order('created_at', { ascending: false }).limit(100));
  return r.reverse();
}
export async function say(room, text) { H.message(check(await sb.from('messages').insert({ couple_id: cid, room, text }).select().single())); } // Realtime пришлёт то же — окно чата отсекает повтор по id

// строку ленты берём сразу, не дожидаясь Realtime
const fetchRow = async (q) => { const r = check(await q.maybeSingle()); if (r) H.ledger(r); };
export async function award(reason, ref) {
  const n = check(await sb.rpc('award', { p_reason: reason, p_ref: ref }));
  if (n > 0) await fetchRow(sb.from('ledger').select('*').eq('couple_id', cid).eq('reason', reason).eq('ref', ref));
  return n;
}
export async function buy(item, to, note) {
  const id = check(await sb.rpc('buy', { p_item: item, p_to: to, p_note: note || null }));
  await fetchRow(sb.from('ledger').select('*').eq('id', id));
  return id;
}
export async function openGift(id) { check(await sb.rpc('open_gift', { p_id: id })); await fetchRow(sb.from('ledger').select('*').eq('id', id)); }
