// Панель CoupleTube в рисованном стиле дома: чернильные неровные линии, рукописные цифры. Одна для всех плееров.
// Кнопки только сообщают о намерении — что делать, решает tube.js.
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null && k !== false)); return e; };
const NS = 'http://www.w3.org/2000/svg';
const svg = (markup, cls = '') => { const t = document.createElementNS(NS, 'svg'); t.setAttribute('class', cls); t.innerHTML = markup; return t; };
export const clockText = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};

// неровная линия «от руки»: точки с лёгким дрожанием, сглаженные кривыми
function wobbly(w, seed, amp = 1.6) {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647 - 0.5) * amp;
  let d = `M0 ${6 + rnd()}`;
  for (let x = 14; x <= w; x += 14) d += ` Q${x - 7} ${6 + rnd() * 1.4} ${x} ${6 + rnd()}`;
  return d;
}
let uid = 0;
// дорожка (шкала/громкость): серая карандашная линия, поверх — розовая до текущего места, кружок-клякса
function sketchTrack(cls, seed) {
  const id = 'tpclip' + ++uid, d = wobbly(400, seed);
  const s = svg(`<defs><clipPath id="${id}"><rect x="0" y="0" height="12" width="0"/></clipPath></defs>
    <path d="${d}" class="tp-line"/><path d="${wobbly(400, seed + 7, 1.2)}" class="tp-line thin"/>
    <path d="${d}" class="tp-ink" clip-path="url(#${id})"/>`, 'tp-svg');
  s.setAttribute('viewBox', '0 0 400 12'); s.setAttribute('preserveAspectRatio', 'none');
  const dot = h('i', { className: 'tp-dot' });
  const el = h('div', { className: cls }, s, dot);
  const rect = s.querySelector('rect');
  return { el, set(k) { rect.setAttribute('width', 400 * k); dot.style.left = k * 100 + '%'; } };
}
const ICON = {
  play: '<path d="M8 5.5 C8.5 9 8 15 8.3 18.6 C12 16.7 15.5 14.3 18.6 12 C15 9.6 11.6 7.2 8 5.5 Z"/>',
  pause: '<path d="M8 6 C8.3 10 7.8 14 8.2 18"/><path d="M15.6 6.2 C15.9 10 15.4 14.2 15.8 18"/>',
  vol: '<path d="M4.5 9.6 L8.2 9.4 L12.6 5.8 C12.9 10 12.5 14 12.8 18.3 L8.3 14.6 L4.7 14.5 Z"/><path class="w" d="M15.6 9 C16.8 10.6 16.9 13.3 15.6 15"/><path class="w" d="M18.3 6.8 C20.6 9.6 20.7 14.6 18.4 17.4"/>',
  mute: '<path d="M4.5 9.6 L8.2 9.4 L12.6 5.8 C12.9 10 12.5 14 12.8 18.3 L8.3 14.6 L4.7 14.5 Z"/><path class="w" d="M15.5 9.4 L20.3 14.6 M20.2 9.3 L15.6 14.8"/>',
  full: '<path class="w" d="M4.5 9.5 L4.6 4.7 L9.4 4.5 M14.6 4.6 L19.4 4.5 L19.5 9.4 M19.4 14.6 L19.5 19.4 L14.5 19.5 M9.5 19.4 L4.6 19.5 L4.5 14.6"/>',
};
const icon = (name) => { const s = svg(ICON[name], 'tp-ico'); s.setAttribute('viewBox', '0 0 24 24'); return s; };

export function createPanel({ onToggle, onSeek, onVolume, onFullscreen, volume = 1 }) {
  const play = h('button', { className: 'tp-btn big', type: 'button', title: 'пауза / play (пробел)', onclick: onToggle });
  const now = h('span', { className: 'tp-time' }), total = h('span', { className: 'tp-time dim' });
  const seek = sketchTrack('tp-track', 11);
  const hover = h('span', { className: 'tp-hover', hidden: true });
  seek.el.append(hover);
  seek.el.title = 'перемотка (← →)';
  const live = h('span', { className: 'tp-live', textContent: '● в эфире', hidden: true });
  const mute = h('button', { className: 'tp-btn', type: 'button', title: 'звук (M)' });
  const vol = sketchTrack('tp-vol', 29);
  const full = h('button', { className: 'tp-btn', type: 'button', title: 'на весь экран (F)', onclick: onFullscreen }, icon('full'));
  const el = h('div', { className: 'tpanel' }, play, now, seek.el, live, total, mute, vol.el, full);

  let dur = 0, dragging = false, level = volume, lastLevel = volume > 0 ? volume : 1, shownPlay = null;
  const setLevel = (v) => {
    level = Math.min(1, Math.max(0, v)); vol.set(level);
    mute.replaceChildren(icon(level === 0 ? 'mute' : 'vol'));
    if (level > 0) lastLevel = level;
    onVolume(level);
  };
  vol.set(level); mute.replaceChildren(icon(level === 0 ? 'mute' : 'vol'));
  mute.onclick = () => setLevel(level > 0 ? 0 : lastLevel);

  // тянуть мышью: шкала — время (перемотка у обоих, когда отпустил), громкость — сразу
  const at = (el, e) => { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  const drag = (el, move, done) => {
    el.onpointerdown = (e) => { el.setPointerCapture(e.pointerId); el.dataset.drag = '1'; move(at(el, e)); };
    el.onpointermove = (e) => { if (el.dataset.drag) move(at(el, e)); };
    el.onpointerup = (e) => { if (!el.dataset.drag) return; delete el.dataset.drag; done?.(at(el, e)); };
  };
  drag(seek.el, (k) => { if (!dur) return; dragging = true; seek.set(k); }, (k) => { dragging = false; hover.hidden = true; if (dur) onSeek(k * dur); });
  seek.el.addEventListener('pointermove', (e) => { if (!dur) return; const k = at(seek.el, e); hover.hidden = false; hover.style.left = k * 100 + '%'; hover.textContent = clockText(k * dur); });
  seek.el.addEventListener('pointerleave', () => { if (!dragging) hover.hidden = true; });
  drag(vol.el, setLevel);

  return {
    el,
    toggleMute: () => mute.click(),
    update({ t, duration, playing, isLive }) {
      dur = duration || 0;
      if (shownPlay !== playing) { shownPlay = playing; play.replaceChildren(icon(playing ? 'pause' : 'play')); }
      now.textContent = clockText(t);
      total.textContent = isLive ? '' : clockText(dur);
      seek.el.hidden = isLive; live.hidden = !isLive;
      if (!dragging) seek.set(dur ? Math.min(1, t / dur) : 0);
    },
  };
}
