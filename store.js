// Общее хранилище «дома»: данные пары, профили, живой канал, чат, баллы.
// Облако: Supabase (ключи отдаёт /api/config из env Vercel). Нет облака → localStorage, вкладки связаны BroadcastChannel.
import * as local from './backend-local.js';
import { checkItem } from './rules.js';
import { setupErrors, report } from './errors.js';

let B = local, data = {}, people = { me: null, partner: null, couple: null }, rows = [];
const subs = {};
const emit = (t, ...a) => (subs[t] || []).forEach((f) => { try { f(...a); } catch (e) { console.warn(e); } });
const sub = (t, f) => { (subs[t] ||= []).push(f); return () => { const i = subs[t].indexOf(f); if (i >= 0) subs[t].splice(i, 1); }; };

export const isCloud = () => B !== local;

function retryScreen(e) {
  const gate = document.getElementById('gate');
  const b = Object.assign(document.createElement('button'), { textContent: 'попробовать ещё раз' });
  const box = Object.assign(document.createElement('form'), { innerHTML: '<h3>Не получилось открыть дом</h3><p>Проверь интернет и попробуй ещё раз.</p>' });
  box.querySelector('p').title = String(e?.message || e);
  box.append(b);
  gate.replaceChildren(box); gate.hidden = false;
  return new Promise((r) => { box.onsubmit = (ev) => { ev.preventDefault(); gate.hidden = true; r(); }; });
}

const hooks = {
  item(kind, id, value) { // правка пришла извне (партнёр или другая вкладка)
    const old = data[kind]?.[id];
    if (JSON.stringify(old) === JSON.stringify(value ?? undefined)) return;
    if (value == null) { if (data[kind]) delete data[kind][id]; } else (data[kind] ||= {})[id] = value;
    emit('item:' + kind, id, value ?? undefined);
  },
  people(p) { people = { ...people, ...p }; emit('people'); },
  ledger(r) { if (!rows.some((x) => x.id === r.id)) rows.push(r); else rows = rows.map((x) => (x.id === r.id ? r : x)); emit('ledger', r); },
  message(m) { emit('msg', m); },
  unmessage(x) { emit('unmsg', x); }, // { id } — удалено одно, { room } — чат очищен
};

export async function initStore() {
  let cfg = null;
  if (!new URLSearchParams(location.search).has('local')) {
    try { const r = await fetch('/api/config', { cache: 'no-store' }); if (r.ok) cfg = await r.json(); } catch {}
  }
  if (cfg?.url) setupErrors(cfg);
  let s;
  for (;;) {
    try {
      // облако настроено — в локальный режим не откатываемся: иначе правки уйдут «в стол», партнёр их не увидит
      if (cfg?.url && cfg?.key) B = await import('./backend-sb.js');
      s = await B.init(hooks, cfg);
      break;
    } catch (e) {
      console.warn(e);
      await retryScreen(e);
    }
  }
  data = s.data; people = s.people; rows = s.ledger;
  const day = new Date().toISOString().slice(0, 10);
  award('daily', `${me().id}:${day}`);
}

// ---------- данные дома ----------
export const all = (kind) => Object.entries(data[kind] || {}).map(([id, v]) => ({ id, ...v }));
export const get = (kind, id) => (data[kind] || {})[id];
export const on = (kind, cb) => sub('item:' + kind, cb);
// перерисовать открытое окно, когда партнёр что-то поменял; само отписывается, когда окно закрыто.
// Пока человек печатает в этом окне, не трогаем — подхватится при следующей правке.
export function watch(el, kinds, redraw) {
  const offs = kinds.map((k) => on(k, () => {
    if (!el.isConnected) return offs.forEach((f) => f());
    const a = document.activeElement;
    if (a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox') return;
    redraw();
  }));
}

export async function put(kind, id, value) {
  const { id: _, ...clean } = value;
  try { checkItem(kind, id, clean); } catch (e) { return fail(e); } // те же правила, что в схеме облака
  (data[kind] ||= {})[id] = clean;
  await B.put(kind, id, clean, data).catch(fail);
}
export async function del(kind, id) {
  try { checkItem(kind, id, null); } catch (e) { return fail(e); }
  if (data[kind]) delete data[kind][id];
  await B.del(kind, id, data).catch(fail);
}
// ошибка записи: показать тост (onFail) и отдать ошибку дальше
const fail = (e) => { report('write: ' + (e?.message || e), e?.stack); emit('fail', e); throw e; };
export const onFail = (cb) => sub('fail', cb);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// фото: уменьшаем в браузере (JPEG), потом в хранилище
export async function uploadPhoto(file, max = 1800) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); // прозрачный PNG в JPEG без подложки становится чёрным
  x.drawImage(bmp, 0, 0, c.width, c.height);
  return B.upload(c);
}
// адрес фото для показа: в облаке фото закрыты ('sb:<путь>' → подписанная ссылка), локально — как есть
export const media = (ref) => (B.mediaUrl ? B.mediaUrl(ref) : ref) || '';

// ---------- мои данные (GDPR, закон 195/2024): выгрузить и удалить ----------
export async function exportData() {
  const dump = { exported: new Date().toISOString(), me: people.me, partner: people.partner, couple: people.couple, home: data, ledger: rows, messages: await B.allMessages() };
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })), download: `nash-dom-${new Date().toISOString().slice(0, 10)}.json` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export async function deleteMe() { await B.deleteMe(); location.replace('/'); }

// ---------- люди ----------
export const me = () => people.me;
export const partner = () => people.partner;
export const couple = () => people.couple;
export const names = () => [people.me?.name, people.partner?.name].filter(Boolean);
export const nameOf = (userId) => (userId === people.me?.id ? people.me.name : userId === people.partner?.id ? people.partner.name : '');
export const onPeople = (cb) => sub('people', cb);
export const saveProfile = async (patch) => { people.me = { ...people.me, ...patch }; emit('people'); await B.saveProfile(patch).catch(fail); };
export const saveCouple = async (patch) => { people.couple = { ...people.couple, ...patch }; emit('people'); await B.saveCouple(patch).catch(fail); };
export const signOut = () => B.signOut();

// ---------- живой канал пары: присутствие, «печатает», плеер, реакции ----------
export const live = {
  send: (ev, payload) => B.live.send(ev, payload),
  on: (ev, cb) => sub('live:' + ev, cb),
  track: (state) => B.live.track(state), // что я сейчас делаю: { app: 'tube' } …
  presence: () => B.live.presence(), // { [userId]: state } — кто из пары в сети (кроме меня)
  onPresence: (cb) => sub('presence', cb),
};
hooks.live = (ev, payload) => emit('live:' + ev, payload);
hooks.presence = () => emit('presence');
export const serverNow = () => B.serverNow();

// ---------- чат ----------
export const messages = (room) => B.messages(room);
export const say = (room, text) => B.say(room, text.trim().slice(0, 1000));
export const onMessage = (cb) => sub('msg', cb);
export const unsay = (id) => B.unsay(id);
export const clearChat = (room) => B.clearChat(room);
export const onUnmessage = (cb) => sub('unmsg', cb);

// ---------- баллы, магазин, подарки ----------
export const ledger = () => rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
export const balance = () => rows.reduce((s, r) => s + r.amount, 0);
export const onLedger = (cb) => sub('ledger', cb);
// начисление тихое: сервер решает сумму и пределы, повтор ничего не даёт
// сервер хранит до 120 символов; хвост с датой важнее
export const award = (reason, ref) => B.award(reason, String(ref).slice(-120))
  .then((n) => { if (n > 0) emit('earned', n, reason); return n; })
  .catch((e) => { console.warn('award', e); return 0; });
export const onEarned = (cb) => sub('earned', cb);
export const buy = (item, toUser = null, note = '') => B.buy(item, toUser, note);
export const openGift = (id) => B.openGift(id);
