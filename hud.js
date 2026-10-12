// Стекло над комнатой (спека docs/specs/2026-10-12-glass-ui-room-design.md): слева «мы», по центру вопрос дня, справа ♥ и колокольчик
// с карточками нового, внизу Память · ＋Записка · Дом · Ноутбук, листы «Память» и «Дом». Действия комнаты приходят из room.js (act).
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import * as store from './store.js';
import { since, plural } from './desktop.js';
import { avatar } from './profile.js';
import { fetchWeather, cityHour, label as wxLabel } from './weather.js';
import { qdayInfo, invites, qdayWaiting } from './quiz.js';
import { myTurns } from './games.js';
import { ITEM } from './catalog.js';
import { listAlbums } from './albums.js';
import { pending, fresh } from './notifylogic.js';
import { icon } from './icons.js';
import { watchGlass } from './glass.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.flat().filter((k) => k != null && k !== false)); return e; };
const ic = (name) => h('i', { className: 'lg-ic', innerHTML: icon(name) });
const DAYS = ['день', 'дня', 'дней'];
const pn = () => store.partner()?.name || '';
const hhmm = (x) => `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.floor((x % 1) * 60)).padStart(2, '0')}`;

// погода и время у партнёра: раз в 15 минут, по его городу из профиля
let wx = null;
async function partnerWx() {
  const c = store.partner()?.city, key = c?.lat ? `${c.lat},${c.lon}` : '';
  if (!key) return (wx = null);
  if (wx?.key === key && Date.now() - wx.at < 15 * 6e4) return wx;
  try { wx = { key, at: Date.now(), w: await fetchWeather(c) }; } catch { wx = null; }
  return wx;
}

// что ждёт меня от партнёра — вход для notifylogic.pending
function collect() {
  const me = store.me()?.id, read = new Set(store.all('read').map((r) => r.id)), bin = new Set(store.all('trash').map((t) => t.id));
  return {
    notes: pn() ? store.all('notes').filter((n) => n.from === pn() && n.date && !read.has(n.id) && !bin.has(n.id)) : [],
    gifts: store.ledger().filter((r) => r.reason === 'gift' && r.to_user === me && !r.opened).map((r) => ({ id: r.id, note: r.note, title: ITEM[r.item]?.title || 'подарок' })),
    turns: myTurns(), asks: invites(), qday: qdayWaiting(),
  };
}

export function initHud(act) {
  const us = h('button', { className: 'lg lg-us press', onclick: () => act.laptop('profile') });
  const day = h('button', { className: 'lg lg-day press', onclick: () => act.laptop('quiz') });
  const hearts = h('button', { className: 'lg lg-hearts press', title: 'сердечки: история и как заработать', onclick: () => act.laptop('shop', { tab: 'earn' }) });
  const badge = h('span', { className: 'lg-badge', hidden: true });
  const bell = h('button', { className: 'lg lg-round press', title: 'новое', onclick: () => (list.hidden ? drawList() : closeList()) }, ic('bell'), badge);
  const cards = h('div', { className: 'lg-cards' });
  const list = h('div', { className: 'lg lg-list', hidden: true });
  const tab = (id, name, text, fn) => { const b = h('button', { className: 'lg-tab press', onclick: fn }, ic(name), h('span', { textContent: text })); b.dataset.tab = id; return b; };
  const bar = h('nav', { className: 'lg lg-bar' },
    tab('memory', 'images', 'Память', () => toggleSheet('memory')),
    h('button', { className: 'lg lg-compose press', onclick: () => { closeAll(); act.write(); } }, ic('pencil'), h('span', { textContent: 'Записка' })),
    tab('home', 'armchair', 'Дом', () => toggleSheet('home')),
    tab('laptop', 'laptop', 'Ноутбук', () => { closeAll(); act.laptop(); }));
  const sheet = h('div', { className: 'lg lg-sheet', hidden: true });
  const root = h('div', { id: 'lgui' }, us, day, h('div', { className: 'lg-tr' }, hearts, bell), cards, list, sheet, bar);
  document.body.append(root);

  // ---------- «мы» ----------
  function drawUs() {
    const me = store.me(), p = store.partner(), on = !!(p && store.live.presence()[p.id]), n = since().days;
    const faces = h('span', { className: 'lg-faces' }, avatar(me, 42), p ? avatar(p, 42) : null);
    faces.classList.toggle('on', on);
    let sub = 'позови вторую половинку';
    if (p) {
      const w = wx?.w, [, t] = w ? wxLabel(w) : [];
      sub = `${p.name} ${on ? 'дома' : 'не в сети'}` + (w ? ` · там ${hhmm(cityHour(w))}, ${w.temp > 0 ? '+' : ''}${w.temp}°${t ? ', ' + t : ''}` : '');
    }
    us.replaceChildren(faces, h('span', { className: 'lg-txt' }, h('b', { textContent: p ? `${me.name} и ${p.name} · ${n} ${plural(n, DAYS)}` : me.name }), h('small', { className: 'lg-muted', textContent: sub })));
  }
  const refreshWx = () => partnerWx().then(drawUs);

  // ---------- вопрос дня ----------
  function drawDay() {
    const p = store.partner();
    day.hidden = !p;
    if (!p) return;
    const { streak, mine, theirs } = qdayInfo(), both = mine && theirs;
    day.classList.toggle('small', both);
    day.title = both ? `вопрос дня: ответили оба · ${streak} ${plural(streak, DAYS)} подряд` : 'вопрос дня';
    const more = (streak ? ` · серия ${streak}` : '') + (theirs ? ` — ${p.name} уже ответил(а)` : mine ? ' — твой ответ есть' : '');
    day.replaceChildren(ic('fire'), both ? h('b', { textContent: streak }) : h('span', {}, h('b', { textContent: 'Вопрос дня' }), h('span', { className: 'lg-muted lg-more', textContent: more })));
  }

  const drawHearts = () => hearts.replaceChildren(ic('heart'), h('span', { textContent: store.balance().toLocaleString('ru-RU') }));

  // ---------- колокольчик и карточки ----------
  let items = [], seen = null;
  function recount() {
    items = store.me() ? pending(collect()) : [];
    if (!seen) seen = new Set(items.map((i) => i.key)); // что было до входа — в колокольчике, без карточек
    else { const nw = fresh(seen, items); nw.forEach((i) => seen.add(i.key)); if (nw.length) card(nw[nw.length - 1]); }
    badge.hidden = !items.length; badge.textContent = items.length;
    if (!list.hidden) drawList();
  }
  let rq = 0;
  const later = () => { clearTimeout(rq); rq = setTimeout(recount, 60); }; // пачка событий из store — один пересчёт
  function card(item) {
    const p = store.partner(); if (!p) return;
    const c = h('button', { className: 'lg lg-card press', onclick: () => go(item) }, avatar(p, 38),
      h('span', {}, h('b', { textContent: p.name }), ` · ${item.text}`, h('small', { className: 'lg-muted', textContent: item.sub })),
      h('time', { className: 'lg-muted', textContent: 'сейчас' }));
    cards.replaceChildren(c); watchGlass(c);
    setTimeout(() => { c.classList.add('out'); setTimeout(() => c.remove(), 450); }, 6000);
  }
  function go(item) {
    closeAll(); cards.replaceChildren();
    if (!item?.go || !act.isIdle()) return;
    if (item.go === 'desk') act.toDesk();
    else act.laptop(item.go, item.match ? { match: item.match } : undefined);
  }
  function drawList() {
    closeSheet(); cards.replaceChildren(); // карточка и список — на одном месте
    const p = store.partner();
    list.replaceChildren(items.length
      ? h('div', { className: 'lg-rows' }, items.map((i) => h('button', { className: 'lg-row', onclick: () => go(i) }, p ? avatar(p, 34) : null,
        h('span', {}, h('b', { textContent: `${p?.name || ''} · ${i.text}` }), h('small', { className: 'lg-muted', textContent: i.sub })))))
      : h('p', { className: 'lg-empty', textContent: 'всё сделано ♥' }));
    list.hidden = false; watchGlass(list);
  }
  const closeList = () => { list.hidden = true; };

  // ---------- листы «Память» и «Дом» ----------
  let open = null;
  const head = (title) => h('div', { className: 'lg-shead' }, h('h2', { textContent: title }), h('button', { className: 'lg lg-round lg-x press', title: 'закрыть', onclick: closeSheet }, ic('x')));
  const row = (name, title, sub, fn) => h('button', { className: 'lg-row', onclick: fn }, h('i', { className: 'lg-rowic', innerHTML: icon(name) }), h('span', {}, h('b', { textContent: title }), sub ? h('small', { className: 'lg-muted', textContent: sub }) : null));
  async function memory() {
    const albums = await listAlbums();
    const cover = (a) => h('button', { className: 'lg-book press', style: `--c:${a.color}`, onclick: () => { closeSheet(); act.album(a); } },
      h('i', { className: 'bk th-' + (a.theme || 'kraft'), style: `--album:${a.color}` },
        a.cover ? h('i', { className: 'bk-photo', style: `background-image:url("${encodeURI(store.media(a.cover))}")` }) : null, h('b', { className: 'bk-title', textContent: a.title })),
      h('small', { className: 'lg-muted', textContent: a.pageIds?.length ? `${a.pageIds.length} стр.` : 'пустой' }));
    return [head('Память'),
      h('div', { className: 'lg-books' }, albums.map(cover), h('button', { className: 'lg-book lg-new press', onclick: () => { closeSheet(); act.album(null); } }, h('i', { className: 'lg-cover', innerHTML: icon('plus') }), h('b', { textContent: 'новый альбом' }))),
      h('div', { className: 'lg-rows two' }, row('gallery', 'Галерея', 'все фото', () => { closeSheet(); act.laptop('gallery'); }), row('chat', 'Мысли', 'о чём думаем', () => { closeSheet(); act.laptop('thoughts'); }))];
  }
  function home() {
    const n = act.boxCount(), on = act.mute.on();
    return [head('Дом'), h('div', { className: 'lg-rows' },
      row('hand', 'Расставить', n ? `в коробках ${n} ${plural(n, ['вещь', 'вещи', 'вещей'])}` : 'двигать вещи в комнате', () => { closeSheet(); act.arrange(); }),
      row('shop', 'Магазин', 'стены, пол, вещи, подарки', () => { closeSheet(); act.laptop('shop'); }),
      row(on ? 'sound' : 'mute', on ? 'Звук включён' : 'Звук выключен', 'нажми, чтобы ' + (on ? 'выключить' : 'включить'), () => { act.mute.toggle(); fill('home'); }))];
  }
  async function fill(kind) {
    const kids = kind === 'memory' ? await memory() : home();
    if (open !== kind) return; // пока грузили альбомы, лист закрыли
    sheet.replaceChildren(...kids); watchGlass(sheet);
  }
  function toggleSheet(kind) {
    if (open === kind) return closeSheet();
    if (!act.isIdle()) return;
    closeList(); open = kind; sheet.hidden = false;
    bar.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === kind));
    fill(kind);
  }
  function closeSheet() { open = null; sheet.hidden = true; bar.querySelectorAll('.on').forEach((b) => b.classList.remove('on')); }
  function closeAll() { closeSheet(); closeList(); }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  addEventListener('pointerdown', (e) => { if (!e.target.closest('.lg-sheet, .lg-list, .lg-bar, .lg-tr')) closeAll(); });

  // ---------- подписки ----------
  const born = Date.now();
  let wasOn = !!(store.partner() && store.live.presence()[store.partner().id]);
  store.live.onPresence(() => {
    const p = store.partner(), on = !!(p && store.live.presence()[p.id]);
    if (on && !wasOn && Date.now() - born > 10000) card({ text: 'дома', sub: 'заглянул(а) в «Наш дом»' });
    wasOn = on; drawUs();
  });
  store.onPeople(() => { refreshWx(); drawDay(); later(); });
  ['notes', 'read', 'trash', 'game', 'quizask', 'quiz'].forEach((k) => store.on(k, later));
  store.on('qday', () => { drawDay(); later(); });
  store.onLedger(() => { drawHearts(); later(); });
  setInterval(() => { drawUs(); drawDay(); }, 60000); // часы у партнёра, смена дня
  setInterval(refreshWx, 15 * 6e4);

  drawUs(); refreshWx(); drawDay(); drawHearts(); recount();
  watchGlass(root);
  return { closeAll, refresh: () => { drawDay(); later(); } };
}
