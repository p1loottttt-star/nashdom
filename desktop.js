import { DATA } from './data.js';
import * as store from './store.js';
import { renderQuiz, badge as quizBadge } from './quiz.js';
import { renderGames, badge as gamesBadge } from './games.js';
import { openWin, isOpen, bounce } from './winman.js';

// настройки этого устройства (кто я, звук, качество); общие данные — в store.js
export const load = (k, seed) => { try { return JSON.parse(localStorage.getItem('lr:' + k)) ?? seed; } catch { return seed; } };
export const save = (k, v) => { try { localStorage.setItem('lr:' + k, JSON.stringify(v)); } catch {} };

export const plural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
const DAYS = ['день', 'дня', 'дней'];

export function since(start = store.couple()?.started || new Date().toISOString().slice(0, 10), now = new Date()) {
  const s = new Date(start + 'T00:00:00');
  const days = Math.floor((now - s) / 864e5);
  let y = now.getFullYear() - s.getFullYear(), m = now.getMonth() - s.getMonth(), d = now.getDate() - s.getDate();
  if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  let next = new Date(now.getFullYear(), s.getMonth(), s.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(next.getFullYear() + 1);
  const toNext = Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  return { days, y, m, d, toNext };
}
export const daysLabel = () => { const n = since().days; return `вместе ${n} ${plural(n, DAYS)}`; };

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const fmt = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

// от чьего имени запись: в облаке — всегда я; локально (одно устройство на двоих) — можно выбрать
export function whoSelect() {
  const sel = h('select');
  const list = store.isCloud() ? [store.me().name] : store.names();
  for (const n of list) sel.append(h('option', { value: n, textContent: n }));
  sel.value = list.includes(load('who')) ? load('who') : list[0];
  sel.onchange = () => save('who', sel.value);
  sel.hidden = list.length < 2;
  return sel;
}
export const myName = () => (store.isCloud() ? store.me().name : load('who', store.me().name));

// всплывашка внизу экрана: «+5 ♥ за записку», «не сохранилось»
const REASON = { daily: 'за визит', note: 'за записку', photo: 'за фото', album: 'за альбом', step: 'за этап плана', plan: 'за выполненный план', watch: 'за кино вместе', trash: 'точно в мусорку', game: 'за игру', quiz: 'за тест' };
export function toast(text, ms = 2600) {
  const t = h('div', { className: 'toast', textContent: text });
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 600);
}
store.onEarned((n, reason) => toast(`+${n} ♥ ${REASON[reason] || ''}`));
store.onFail(() => toast('не сохранилось — проверь интернет'));

// тяжёлые окна (CoupleTube, магазин, профиль, галерея, планы) грузятся при первом открытии
const APPS = {
  tube: { title: 'CoupleTube', wide: true, xl: true, render: (el) => import('./tube.js').then((m) => m.renderTube(el)) },
  shop: { title: 'Магазин', wide: true, render: (el) => import('./shop.js').then((m) => m.renderShop(el)) },
  quiz: { title: 'Тесты', wide: true, render: renderQuiz },
  games: { title: 'Игры', wide: true, render: renderGames },
  profile: { title: 'Профиль', wide: true, render: (el) => import('./profile.js').then((m) => m.renderProfile(el)) },
  gallery: { title: 'Галерея', wide: true, render: (el) => import('./gallery.js').then((m) => m.renderGallery(el)) },
  plans: { title: 'Наши планы', wide: true, render: (el) => import('./plans.js').then((m) => m.renderPlans(el)) },

  thoughts: {
    title: 'Мысли',
    render(el) {
      const list = () => { const l = store.all('thoughts').sort((a, b) => a.date.localeCompare(b.date)); return l.length ? l : DATA.thoughts; };
      store.watch(el, ['thoughts'], () => draw());
      const box = h('div');
      const draw = () => box.replaceChildren(...[...list()].reverse().map((t) =>
        h('div', { className: 'thought' }, h('p', { textContent: t.text }), h('small', { textContent: `${t.from} · ${fmt(t.date)}` }))));
      const ta = h('textarea', { placeholder: 'о чём думаешь?', rows: 2, maxLength: 400 });
      const who = whoSelect();
      const form = h('form', { className: 'add', onsubmit: (e) => {
        e.preventDefault(); if (!ta.value.trim()) return;
        store.put('thoughts', store.uid(), { from: who.value, date: new Date().toISOString(), text: ta.value.trim() }).catch(console.warn);
        ta.value = ''; draw();
      } }, ta, who, h('button', { textContent: '+' }));
      draw();
      el.append(form, box);
    },
  },

  counter: {
    title: 'Мы вместе', size: [420, 440],
    render(el) {
      const s = since();
      const live = h('div', { className: 'live' });
      const tick = () => { live.textContent = `и ещё ${new Date().toLocaleTimeString('ru-RU')} сегодня`; };
      const id = setInterval(() => (live.isConnected ? tick() : clearInterval(id)), 1000);
      el.append(h('div', { className: 'counter' },
        h('div', { className: 'big', textContent: s.days }),
        h('div', { textContent: plural(s.days, DAYS) + ' вместе' }),
        h('div', { className: 'parts' },
          ...[[s.y, ['год', 'года', 'лет']], [s.m, ['месяц', 'месяца', 'месяцев']], [s.d, DAYS]].map(([n, f]) => h('div', {}, String(n), h('small', { textContent: plural(n, f) })))),
        live,
        h('p', { textContent: s.toNext ? `до годовщины ${s.toNext} ${plural(s.toNext, DAYS)}` : 'сегодня годовщина ♥' })));
      tick();
    },
  },
};

const desk = document.getElementById('desktop');
let onClose = null, nekoLoaded = false;

function openApp(name) {
  const A = APPS[name], first = !isOpen(name);
  openWin(name, { title: A.title, cls: (A.wide ? 'wide' : '') + (A.xl ? ' xl' : ''), size: A.xl ? [1180, 720] : A.wide ? [940, 640] : A.size || [440, 520], render: A.render });
  if (first) bounce(name);
}

desk.addEventListener('click', (e) => { const b = e.target.closest('[data-app]'); if (b) openApp(b.dataset.app); });
document.getElementById('power').onclick = () => closeDesktop();
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !desk.hidden) closeDesktop(); });

function clock() {
  document.getElementById('mDays').textContent = '♥ ' + daysLabel();
  document.getElementById('hello').textContent = daysLabel();
  document.getElementById('mClock').textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function openDesktop(app, done) {
  onClose = done;
  quizBadge(); gamesBadge();
  clock();
  desk.hidden = false;
  requestAnimationFrame(() => desk.classList.add('on'));
  if (!nekoLoaded) {
    nekoLoaded = true;
    const base = 'https://cdn.jsdelivr.net/gh/adryd325/oneko.js@5281d057c4ea9bd4f6f997ee96ba30491aed16c0/'; // ponytail: закреплён на коммите; лучше положить к себе (MIT)
    const s = h('script', { src: base + 'oneko.js' });
    s.dataset.cat = base + 'oneko.gif';
    document.body.append(s);
  }
  const neko = document.getElementById('oneko');
  if (neko) neko.style.display = '';
  if (app) openApp(app);
}

function closeDesktop() {
  desk.classList.remove('on');
  const neko = document.getElementById('oneko');
  if (neko) neko.style.display = 'none';
  setTimeout(() => { desk.hidden = true; onClose?.(); }, 500);
}

setInterval(() => { if (!desk.hidden) clock(); }, 10000);
