// Окна ноутбука «как на Mac, на бумаге»: светофор, фокус, перетаскивание, размер, плитки, развернуть/свернуть в док.
// Положение — только transform (translate3d), размер — width/height в rAF; анимации — WAAPI по transform/opacity (FLIP).
// Спека: docs/specs/2026-10-10-laptop-windows-design.md. О приложениях ничего не знает: openWin(name, { title, cls, render }).
import { pop } from './sound.js';

const desk = document.getElementById('desktop');
const dock = desk.querySelector('.dock');
const wins = new Map(); // name → { el, x, y, w, h, prev, min, onclose }
const TOP = 34, MIN_W = 320, MIN_H = 220, EASE = 'cubic-bezier(.2,.8,.2,1)';
let z = 10;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const anim = (el, frames, ms) => (still.matches ? Promise.resolve() : el.animate(frames, { duration: ms, easing: EASE }).finished.catch(() => {}));
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
let dockH = 0; // высота дока: замер раз, а не на каждое движение мыши (offsetHeight пересчитывал раскладку)
const area = () => ({ x: 8, y: TOP, w: innerWidth - 16, h: innerHeight - TOP - ((dockH ||= dock.offsetHeight) + 22) });
const remember = (name, s) => { try { localStorage.setItem('lr:win:' + name, JSON.stringify({ x: s.x, y: s.y, w: s.w, h: s.h })); } catch {} };
const recall = (name) => { try { return JSON.parse(localStorage.getItem('lr:win:' + name)); } catch { return null; } };

function place(s) {
  s.el.style.transform = `translate3d(${s.x}px,${s.y}px,0)`;
  s.el.style.width = s.w + 'px'; s.el.style.height = s.h + 'px';
}
// окно целиком в пределах экрана, заголовок не под строкой меню
function clamp(s) {
  s.w = Math.max(MIN_W, Math.min(s.w, innerWidth - 16)); s.h = Math.max(MIN_H, Math.min(s.h, innerHeight - TOP - 8));
  s.x = Math.max(-s.w + 120, Math.min(s.x, innerWidth - 120)); s.y = Math.max(TOP, Math.min(s.y, innerHeight - 60));
}

function focus(name) {
  for (const [n, s] of wins) s.el.classList.toggle('active', n === name);
  const s = wins.get(name);
  if (s) s.el.style.zIndex = ++z;
}
const topmost = () => [...wins].filter(([, s]) => !s.min).sort((a, b) => b[1].el.style.zIndex - a[1].el.style.zIndex)[0]?.[0];

// FLIP: окно уже в новом месте; проигрываем переход от старого прямоугольника к новому одним transform
function flip(s, from, ms = 250) {
  const to = { x: s.x, y: s.y, w: s.w, h: s.h };
  return anim(s.el, [
    { transform: `translate3d(${from.x}px,${from.y}px,0) scale(${from.w / to.w},${from.h / to.h})`, transformOrigin: '0 0' },
    { transform: `translate3d(${to.x}px,${to.y}px,0) scale(1,1)`, transformOrigin: '0 0' },
  ], ms);
}
function setRect(s, r, animate = true) {
  const from = { x: s.x, y: s.y, w: s.w, h: s.h };
  Object.assign(s, r); place(s);
  if (animate) flip(s, from);
}
function toggleMax(name) {
  const s = wins.get(name);
  if (s.prev) { const p = s.prev; s.prev = null; setRect(s, p); }
  else { s.prev = { x: s.x, y: s.y, w: s.w, h: s.h }; setRect(s, area()); }
  s.el.classList.toggle('maxed', !!s.prev);
}

function dockBtn(name) { return dock.querySelector(`[data-app="${name}"]`); }
function markDock() { dock.querySelectorAll('[data-app]').forEach((b) => b.classList.toggle('run', wins.has(b.dataset.app))); }

async function minimize(name) {
  const s = wins.get(name), b = dockBtn(name)?.getBoundingClientRect();
  if (!s || s.min) return;
  s.min = true; pop();
  if (b) {
    const k = Math.min(b.width / s.w, b.height / s.h);
    await anim(s.el, [
      { transform: `translate3d(${s.x}px,${s.y}px,0)`, opacity: 1, transformOrigin: '0 0' },
      { transform: `translate3d(${b.left + b.width / 2 - s.w * k / 2}px,${b.top}px,0) scale(${k})`, opacity: 0.2, transformOrigin: '0 0' },
    ], 350);
  }
  s.el.hidden = true;
  focus(topmost());
}
function restore(name) {
  const s = wins.get(name), b = dockBtn(name)?.getBoundingClientRect();
  s.min = false; s.el.hidden = false; focus(name);
  if (b) {
    const k = Math.min(b.width / s.w, b.height / s.h);
    anim(s.el, [
      { transform: `translate3d(${b.left + b.width / 2 - s.w * k / 2}px,${b.top}px,0) scale(${k})`, opacity: 0.2, transformOrigin: '0 0' },
      { transform: `translate3d(${s.x}px,${s.y}px,0)`, opacity: 1, transformOrigin: '0 0' },
    ], 320);
  }
}

export async function closeWin(name) {
  const s = wins.get(name);
  if (!s) return;
  wins.delete(name); markDock();
  s.onclose?.();
  await anim(s.el, [{ opacity: 1, transform: `translate3d(${s.x}px,${s.y}px,0)` }, { opacity: 0, transform: `translate3d(${s.x + s.w * 0.025}px,${s.y + s.h * 0.025}px,0) scale(.95)` }], 180);
  s.el.remove();
  focus(topmost());
}

// перетаскивание и размер: координаты из pointermove запоминаем, применяем раз в кадр
function gesture(e, s, onMove, onEnd) {
  e.preventDefault();
  const t = e.currentTarget;
  t.setPointerCapture(e.pointerId);
  desk.classList.add('gesturing');
  let last = null, raf = 0;
  const frame = () => { raf = 0; onMove(last); };
  t.onpointermove = (m) => { last = m; if (!raf) raf = requestAnimationFrame(frame); };
  t.onpointerup = t.onpointercancel = (u) => {
    t.onpointermove = t.onpointerup = t.onpointercancel = null;
    cancelAnimationFrame(raf); if (last) onMove(last);
    desk.classList.remove('gesturing');
    onEnd?.(u);
  };
}

const snapBox = h('div', { className: 'snapbox', hidden: true });
desk.append(snapBox);
// куда встанет окно, если отпустить здесь: края — половины, углы — четверти, верх — весь экран
function snapAt(px, py) {
  const a = area(), E = 14, left = px < E, right = px > innerWidth - E, top = py < TOP + 4, low = py > innerHeight - 120;
  const half = a.w / 2, hh = a.h / 2;
  if ((left || right) && top) return { x: left ? a.x : a.x + half, y: a.y, w: half, h: hh };
  if ((left || right) && low) return { x: left ? a.x : a.x + half, y: a.y + hh, w: half, h: hh };
  if (left || right) return { x: left ? a.x : a.x + half, y: a.y, w: half, h: a.h };
  if (top) return a;
  return null;
}

function dragBar(e, name) {
  if (e.button !== 0 || e.target.closest('.lights')) return;
  const s = wins.get(name);
  focus(name);
  let ox = e.clientX - s.x, oy = e.clientY - s.y, snap = null, moved = false;
  gesture(e, s, (m) => {
    if (!moved) {
      if (Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 3) return;
      moved = true; s.el.classList.add('lift');
      // из плитки/разворота — прежний размер, окно остаётся под курсором в той же доле ширины
      if (s.prev) { const k = ox / s.w; Object.assign(s, { w: s.prev.w, h: s.prev.h }); s.prev = null; s.el.classList.remove('maxed'); ox = k * s.w; }
    }
    s.x = m.clientX - ox; s.y = Math.max(TOP, m.clientY - oy); place(s);
    snap = snapAt(m.clientX, m.clientY);
    snapBox.hidden = !snap;
    if (snap) snapBox.style.cssText = `transform:translate3d(${snap.x}px,${snap.y}px,0);width:${snap.w}px;height:${snap.h}px;z-index:${z}`;
  }, () => {
    s.el.classList.remove('lift'); snapBox.hidden = true;
    if (snap) { s.prev = { x: s.x, y: s.y, w: s.w, h: s.h }; setRect(s, snap); }
    else { clamp(s); place(s); remember(name, s); }
  });
}

function dragEdge(e, name, d) {
  const s = wins.get(name), r0 = { x: s.x, y: s.y, w: s.w, h: s.h };
  focus(name); s.prev = null; s.el.classList.remove('maxed');
  gesture(e, s, (m) => {
    const dx = m.clientX - e.clientX, dy = m.clientY - e.clientY;
    if (d.includes('e')) s.w = Math.max(MIN_W, r0.w + dx);
    if (d.includes('s')) s.h = Math.max(MIN_H, r0.h + dy);
    if (d.includes('w')) { s.w = Math.max(MIN_W, r0.w - dx); s.x = r0.x + r0.w - s.w; }
    if (d.includes('n')) { s.h = Math.max(MIN_H, r0.h - dy); s.y = Math.max(TOP, r0.y + r0.h - s.h); s.h = r0.y + r0.h - s.y; }
    place(s);
  }, () => remember(name, s));
}

// open: уже открыто — поднять (или вернуть из дока); иначе новое окно с анимацией
export function openWin(name, { title, cls = '', render, size }) {
  const had = wins.get(name);
  if (had) { if (had.min) restore(name); else focus(name); return had.el; }
  pop();
  const lights = h('div', { className: 'lights' },
    h('button', { className: 'lt r', ariaLabel: 'Закрыть', textContent: '×', onclick: () => closeWin(name) }),
    h('button', { className: 'lt y', ariaLabel: 'Свернуть', textContent: '−', onclick: () => minimize(name) }),
    h('button', { className: 'lt g', ariaLabel: 'Развернуть', textContent: '+', onclick: () => toggleMax(name) }));
  const bar = h('div', { className: 'bar' }, lights, h('b', { textContent: title }));
  const body = h('div', { className: 'body' });
  const el = h('section', { className: 'win ' + cls });
  el.append(bar, body, ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => h('i', { className: 'rz rz-' + d, onpointerdown: (e) => dragEdge(e, name, d) })));
  const n = wins.size, a = area();
  const w = Math.min(size?.[0] || 560, a.w), hh = Math.min(size?.[1] || 520, a.h);
  const s = { el, x: (innerWidth - w) / 2 + n * 26, y: TOP + 12 + n * 26, w, h: hh, prev: null, min: false, ...recall(name) };
  clamp(s); place(s);
  wins.set(name, s);
  el.onpointerdown = () => { if (!el.classList.contains('active')) focus(name); };
  bar.onpointerdown = (e) => dragBar(e, name);
  bar.ondblclick = (e) => { if (!e.target.closest('.lights')) toggleMax(name); };
  desk.append(el);
  focus(name); markDock();
  render(body);
  s.onclose = () => body.onclose?.();
  anim(el, [{ opacity: 0, transform: `translate3d(${s.x + s.w * 0.025}px,${s.y + s.h * 0.025}px,0) scale(.95)` }, { opacity: 1, transform: `translate3d(${s.x}px,${s.y}px,0)` }], 220);
  return el;
}
export const isOpen = (name) => wins.has(name);
export const bounce = (name) => dockBtn(name)?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-22px)' }, { transform: 'translateY(0)' }], { duration: 420, iterations: 2, easing: 'ease-in-out' });

// ---- док: увеличение по расстоянию до курсора (ширина кнопки — место, значок — scale от низа) ----
const BASE = 52, MAXK = 1.7, REACH = BASE * 2.5;
let mx = null, draf = 0;
function magnify() {
  draf = 0;
  const bs = [...dock.children], cx = bs.map((b) => { const r = b.getBoundingClientRect(); return r.left + r.width / 2; }); // сначала читаем, потом пишем
  bs.forEach((b, i) => {
    const k = mx == null ? 1 : 1 + (MAXK - 1) * Math.cos(Math.min(1, Math.abs(mx - cx[i]) / REACH) * Math.PI / 2) ** 2;
    b.style.width = BASE * k + 'px';
    b.style.setProperty('--k', k.toFixed(3));
  });
}
dock.onpointermove = (e) => { if (e.pointerType !== 'mouse') return; mx = e.clientX; if (!draf) draf = requestAnimationFrame(magnify); };
dock.onpointerleave = () => { mx = null; if (!draf) draf = requestAnimationFrame(magnify); };
// ресайз экрана — окна в пределах
addEventListener('resize', () => { dockH = 0; for (const s of wins.values()) { clamp(s); place(s); } });
export { minimize, restore, focus };
