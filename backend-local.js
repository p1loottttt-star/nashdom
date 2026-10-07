// Локальный режим (нет облака): всё в localStorage этого браузера.
// Вкладки одного браузера — «два человека»: ?as=b открывает вторую половину пары, BroadcastChannel разносит правки.
import { DATA } from './data.js';
import { ITEM, EARN } from './catalog.js';

const K = { store: 'lr:store', people: 'lr:local', ledger: 'lr:ledger', msgs: 'lr:msgs' };
const read = (k, seed) => { try { return JSON.parse(localStorage.getItem(k)) ?? seed; } catch { return seed; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('localStorage', e); } };

const ME = new URLSearchParams(location.search).get('as') === 'b' ? 'b' : 'a';
const OTHER = ME === 'a' ? 'b' : 'a';
const bc = 'BroadcastChannel' in self ? new BroadcastChannel('lr-live') : null;
const send = (m) => bc?.postMessage(m);
let H, P, seen = {}, mine = {};

const seedPeople = () => ({
  couple: { id: 'local', title: 'Наш дом', started: DATA.local.start, invite: '' },
  a: { id: 'a', name: DATA.local.me, emoji: '🙂', color: '#7fb3c8', avatar: null, birthday: null, about: '' },
  b: { id: 'b', name: DATA.local.her, emoji: '🌸', color: '#ef6f8c', avatar: null, birthday: null, about: '' },
});
const view = () => ({ me: P[ME], partner: P[OTHER], couple: P.couple });

export async function init(hooks) {
  H = hooks;
  P = read(K.people, null) || seedPeople();
  bc?.addEventListener('message', ({ data: m }) => {
    if (m.t === 'item') H.item(m.kind, m.id, m.value);
    else if (m.t === 'people') { P = read(K.people, P); H.people(view()); }
    else if (m.t === 'ledger') H.ledger(m.row);
    else if (m.t === 'msg') H.message(m.m);
    else if (m.t === 'live' && m.from !== ME) H.live(m.ev, m.payload);
    else if (m.t === 'hb' && m.who !== ME) {
      const prev = seen[m.who] && JSON.stringify(seen[m.who].state);
      seen[m.who] = { at: Date.now(), state: m.state };
      if (prev !== JSON.stringify(m.state)) H.presence();
    }
    else if (m.t === 'bye' && m.who !== ME) { delete seen[m.who]; H.presence(); }
  });
  // пульс присутствия: кто не отозвался 5 с — не в сети
  const beat = () => send({ t: 'hb', who: ME, state: mine });
  setInterval(() => {
    beat();
    for (const [w, s] of Object.entries(seen)) if (Date.now() - s.at > 5000) { delete seen[w]; H.presence(); }
  }, 2000);
  beat();
  addEventListener('pagehide', () => send({ t: 'bye', who: ME }));
  return { data: read(K.store, {}), people: view(), ledger: read(K.ledger, []) };
}

const saveAll = (data) => write(K.store, data);
export async function put(kind, id, value, data) { saveAll(data); send({ t: 'item', kind, id, value }); }
export async function del(kind, id, data) { saveAll(data); send({ t: 'item', kind, id, value: null }); }
export async function upload(canvas) { return canvas.toDataURL('image/jpeg', 0.82); }

export async function saveProfile(patch) { P[ME] = { ...P[ME], ...patch }; write(K.people, P); send({ t: 'people' }); }
export async function saveCouple(patch) { P.couple = { ...P.couple, ...patch }; write(K.people, P); send({ t: 'people' }); }
export const allMessages = async () => read(K.msgs, []);
export async function deleteMe() { for (const k of Object.values(K)) localStorage.removeItem(k); } // локально — стереть всё в этом браузере
export function signOut() { location.search = ME === 'a' ? '?as=b' : ''; } // локально «выйти» = стать второй половиной

export const live = {
  send(ev, payload) { send({ t: 'live', ev, payload, from: ME }); },
  track(state) { mine = state || {}; send({ t: 'hb', who: ME, state: mine }); },
  presence: () => Object.fromEntries(Object.entries(seen).map(([w, s]) => [w, s.state || {}])),
};
export const serverNow = () => Date.now();

export async function messages(room) { return read(K.msgs, []).filter((m) => m.room === room).slice(-100); }
export async function say(room, text) {
  const all = read(K.msgs, []);
  const m = { id: Date.now(), user_id: ME, room, text, created_at: new Date().toISOString() };
  all.push(m); write(K.msgs, all.slice(-500));
  H.message(m); send({ t: 'msg', m });
}

// баллы — те же правила, что в SQL award/buy
function addRow(row) {
  const all = read(K.ledger, []);
  const r = { id: Date.now() + Math.random(), user_id: ME, item: null, to_user: null, note: null, opened: false, created_at: new Date().toISOString(), ...row };
  all.push(r); write(K.ledger, all);
  H.ledger(r); send({ t: 'ledger', row: r });
  return r;
}
export async function award(reason, ref) {
  const rule = EARN[reason];
  if (!rule) throw new Error('bad reason');
  const all = read(K.ledger, []), day = new Date().toISOString().slice(0, 10);
  if (all.some((r) => r.reason === reason && r.ref === ref)) return 0;
  if (all.filter((r) => r.reason === reason && r.created_at.startsWith(day)).length >= rule[1]) return 0;
  addRow({ reason, ref, amount: rule[0] });
  return rule[0];
}
export async function buy(item, to, note) {
  const s = ITEM[item], all = read(K.ledger, []);
  if (!s) throw new Error('Такой вещи нет');
  if (s.kind === 'gift' && to !== OTHER) throw new Error('Подарок — только партнёру');
  if (s.kind === 'style' && all.some((r) => r.reason === 'style' && r.user_id === ME && r.item === item)) throw new Error('Это у тебя уже есть'); // декора — сколько угодно
  if (all.reduce((a, r) => a + r.amount, 0) < s.price) throw new Error('Не хватает баллов');
  return addRow({ reason: s.kind, ref: String(Math.random()), amount: -s.price, item, to_user: s.kind === 'gift' ? to : null, note: (note || '').slice(0, 200) || null }).id;
}
export async function openGift(id) {
  const all = read(K.ledger, []), r = all.find((x) => x.id === id && x.to_user === ME);
  if (!r) return;
  r.opened = true; write(K.ledger, all);
  H.ledger(r); send({ t: 'ledger', row: r });
}
