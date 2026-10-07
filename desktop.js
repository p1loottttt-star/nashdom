import { DATA } from './data.js';
import { pop } from './sound.js';
import * as store from './store.js';
import { renderGallery } from './gallery.js';
import { renderPlans } from './plans.js';
import { renderTube } from './tube.js';
import { renderShop } from './shop.js';
import { renderQuiz, badge as quizBadge } from './quiz.js';
import { renderGames, badge as gamesBadge } from './games.js';
import { renderProfile } from './profile.js';

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
const REASON = { daily: 'за визит', note: 'за записку', photo: 'за фото', album: 'за альбом', step: 'за этап плана', plan: 'за выполненный план', watch: 'за кино вместе' };
export function toast(text, ms = 2600) {
  const t = h('div', { className: 'toast', textContent: text });
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 600);
}
store.onEarned((n, reason) => toast(`+${n} ♥ ${REASON[reason] || ''}`));
store.onFail(() => toast('не сохранилось — проверь интернет'));

const APPS = {
  tube: { title: 'CoupleTube', wide: true, xl: true, render: renderTube },
  shop: { title: 'Магазин', wide: true, render: renderShop },
  quiz: { title: 'Тесты', wide: true, render: renderQuiz },
  games: { title: 'Игры', wide: true, render: renderGames },
  profile: { title: 'Профиль', wide: true, render: renderProfile },
  gallery: { title: 'Галерея', wide: true, render: renderGallery },
  plans: { title: 'Наши планы', wide: true, render: renderPlans },

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
    title: 'Мы вместе',
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
const wins = {};
let z = 10, onClose = null, nekoLoaded = false;

function openApp(name) {
  if (wins[name]) { wins[name].style.zIndex = ++z; return; }
  pop();
  const n = Object.keys(wins).length;
  const w = h('section', { className: 'win' + (APPS[name].wide ? ' wide' : '') + (APPS[name].xl ? ' xl' : '') });
  w.style.cssText = APPS[name].wide ? `left:${Math.max(16, (innerWidth - Math.min(APPS[name].xl ? 1180 : 940, innerWidth - 32)) / 2 + n * 24)}px;top:${44 + n * 24}px;z-index:${++z}` : `left:${Math.min(60 + n * 40, innerWidth - 360)}px;top:${60 + n * 34}px;z-index:${++z}`;
  const close = h('button', { className: 'dot r', ariaLabel: 'Закрыть', onclick: () => { w.remove(); delete wins[name]; body.onclose?.(); } });
  const bar = h('div', { className: 'bar' }, close, h('span', { className: 'dot y' }), h('span', { className: 'dot g' }), h('b', { textContent: APPS[name].title }));
  const body = h('div', { className: 'body' });
  APPS[name].render(body);
  w.append(bar, body);
  w.onpointerdown = () => { w.style.zIndex = ++z; };
  bar.onpointerdown = (e) => {
    if (e.target === close) return;
    const ox = e.clientX - w.offsetLeft, oy = e.clientY - w.offsetTop;
    bar.setPointerCapture(e.pointerId);
    bar.onpointermove = (m) => { w.style.left = m.clientX - ox + 'px'; w.style.top = Math.max(30, m.clientY - oy) + 'px'; };
    bar.onpointerup = () => { bar.onpointermove = null; };
  };
  desk.append(w);
  wins[name] = w;
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
    const base = 'https://cdn.jsdelivr.net/gh/adryd325/oneko.js@main/';
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
