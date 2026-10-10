// Холст «от руки» для игр (и дальше — для альбомов): кисть, ластик, заливка, отмена; 12 чернил, 4 толщины.
// Рисунок = ops: штрих { c, w, p: [[x, y, t]] } или заливка { f: 1, c, p: [[x, y, t]] }; x, y — 0..1 (холст 4:3), t — мс от начала.
// Один формат для живой трансляции (onOp пачками раз в 40 мс → apply у партнёра), записи и повтора (play).
import { squeeze } from './gamelogic.js';

export const W = 560, H = 420, PAPER = '#fffaf2', MAXPTS = 4000;
export const INKS = ['#3b2a35', '#7a5547', '#d94f62', '#f08aa0', '#f0995a', '#f2c94c', '#86b85f', '#3f9a8a', '#5a9fd0', '#7a6cc4', '#c9a27e', '#ffffff'];
export const SIZES = [0.005, 0.011, 0.022, 0.045];
const K = 2; // плотность холста
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

function hexRGB(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
// заливка по строкам с допуском (края штрихов сглажены — без допуска остаётся ореол); пиксели — как Uint32
function flood(x, px, py, color) {
  const cw = x.canvas.width, ch = x.canvas.height, sx = Math.floor(px * cw), sy = Math.floor(py * ch);
  if (sx < 0 || sy < 0 || sx >= cw || sy >= ch) return;
  const img = x.getImageData(0, 0, cw, ch), d = new Uint32Array(img.data.buffer), [r, g, b] = hexRGB(color);
  const fill = (255 << 24 | b << 16 | g << 8 | r) >>> 0, s0 = d[sy * cw + sx];
  const R = s0 & 255, G = (s0 >> 8) & 255, B = (s0 >> 16) & 255;
  if (Math.abs(R - r) + Math.abs(G - g) + Math.abs(B - b) < 8) return;
  const seen = new Uint8Array(cw * ch);
  const same = (p) => { if (seen[p]) return false; const v = d[p]; return Math.abs((v & 255) - R) + Math.abs(((v >> 8) & 255) - G) + Math.abs(((v >> 16) & 255) - B) < 90; };
  const stack = [sx, sy];
  while (stack.length) {
    const yy = stack.pop(), row = yy * cw;
    let xx = stack.pop();
    while (xx > 0 && same(row + xx - 1)) xx--;
    let up = false, down = false;
    for (; xx < cw && same(row + xx); xx++) {
      const p = row + xx;
      seen[p] = 1; d[p] = fill;
      if (yy > 0) { if (same(p - cw)) { if (!up) { stack.push(xx, yy - 1); up = true; } } else up = false; }
      if (yy < ch - 1) { if (same(p + cw)) { if (!down) { stack.push(xx, yy + 1); down = true; } } else down = false; }
    }
  }
  x.putImageData(img, 0, 0);
  return img;
}

// кусок сглаженного штриха: точки from..n−1 (кривые через середины; хвост — прямо до последней точки)
function seg(x, s, from = 0, upto = s.p.length) {
  const p = s.p, n = Math.min(upto, p.length);
  if (!n) return;
  x.strokeStyle = s.c; x.fillStyle = s.c; x.lineWidth = s.w * W;
  const X = (q) => q[0] * W, Y = (q) => q[1] * H;
  if (n === 1) { x.beginPath(); x.arc(X(p[0]), Y(p[0]), (s.w * W) / 2, 0, 7); x.fill(); return; }
  x.beginPath();
  const k0 = Math.max(1, from - 1); // новая точка «дозревает» кривую вокруг предыдущей
  const m = (a, b) => [(X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2];
  if (k0 === 1) { x.moveTo(X(p[0]), Y(p[0])); x.lineTo(...m(p[0], p[1])); } else x.moveTo(...m(p[k0 - 1], p[k0]));
  for (let k = k0; k < n - 1; k++) { const [mx, my] = m(p[k], p[k + 1]); x.quadraticCurveTo(X(p[k]), Y(p[k]), mx, my); }
  x.lineTo(X(p[n - 1]), Y(p[n - 1]));
  x.stroke();
}
const drawOp = (x, o, from, upto) => (o.f ? flood(x, o.p[0][0], o.p[0][1], o.c) : seg(x, o, from, upto));

export function sketch({ edit = false, onOp = null, ops = [] } = {}) {
  const c = h('canvas', { className: 'sk-canvas', width: W * K, height: H * K });
  const x = c.getContext('2d', { willReadFrequently: true }); // заливка читает пиксели
  x.scale(K, K); x.lineCap = x.lineJoin = 'round';
  const S = { el: null, canvas: c, ops, points: () => ops.reduce((n, o) => n + o.p.length, 0) };
  let playing = 0;

  // снимок холста после последней заливки: отмена штрихов поверх неё не перезаливает (заливка ~10–40 мс)
  let base = null;
  const keep = (i, img) => { if (img) base = { n: i + 1, op: ops[i], img }; };
  S.paint = () => {
    let from = 0;
    if (base && ops[base.n - 1] === base.op) { x.putImageData(base.img, 0, 0); from = base.n; }
    else { base = null; x.fillStyle = PAPER; x.fillRect(0, 0, W, H); }
    for (let i = from; i < ops.length; i++) keep(i, drawOp(x, ops[i]));
  };
  // живое: штрих i пополнился точками, отмена, очистка, полный снимок
  S.apply = (m) => {
    if (m.k === 'p') {
      let o = ops[m.i];
      if (!o) { o = ops[m.i] = { c: m.c, w: m.w, p: [], ...(m.f ? { f: 1 } : {}) }; }
      const from = o.p.length; o.p.push(...m.pts);
      if (o.f) keep(m.i, drawOp(x, o)); else seg(x, o, from);
    } else if (m.k === 'u') { ops.pop(); S.paint(); }
    else if (m.k === 'x') { ops.length = 0; S.paint(); }
    else if (m.k === 'all') { ops.length = 0; ops.push(...m.ops); S.paint(); }
  };
  // повтор во времени: паузы ужаты, ×speed; рисует только новое (заливки — один раз)
  S.play = (speed = 1.6) => new Promise((done) => {
    const my = ++playing, list = squeeze(ops);
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    if (document.visibilityState !== 'visible') { S.paint(); return done(); }
    const t0 = performance.now(); let oi = 0, pi = 0;
    const step = (now) => {
      if (my !== playing || !c.isConnected) return done();
      const t = (now - t0) * speed;
      while (oi < list.length) {
        const o = list[oi], from = pi;
        while (pi < o.p.length && o.p[pi][2] <= t) pi++;
        if (pi > from) drawOp(x, o, Math.max(0, from), pi);
        if (pi < o.p.length) break;
        oi++; pi = 0;
      }
      if (oi < list.length) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  S.stop = () => { playing++; S.paint(); };
  S.png = () => new Promise((r) => c.toBlob(r, 'image/png'));
  S.paint();
  if (!edit) { S.el = h('div', { className: 'sk' }, c); return S; }

  // ---- рисование ----
  let ink = INKS[0], size = 1, tool = 'pen', cur = null, t0 = null;
  const pending = new Map(); // i → новые точки для трансляции
  const flush = () => { for (const [i, pts] of pending) { const o = ops[i]; if (o) onOp?.({ k: 'p', i, c: o.c, w: o.w, ...(o.f ? { f: 1 } : {}), pts }); } pending.clear(); };
  const timer = onOp ? setInterval(() => { if (!c.isConnected) return clearInterval(timer); if (pending.size) flush(); }, 40) : 0;
  const queue = (i, q) => { if (!onOp) return; if (!pending.has(i)) pending.set(i, []); pending.get(i).push(q); };
  const pos = (e) => { const r = c.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)]; };
  const now = () => Math.round(performance.now() - (t0 ??= performance.now()));
  const full = () => S.points() >= MAXPTS;
  c.onpointerdown = (e) => {
    if (e.button > 0 || full()) return;
    e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch {}
    const q = [...pos(e), now()];
    if (tool === 'fill') { const o = { f: 1, c: ink, p: [q] }; ops.push(o); keep(ops.length - 1, drawOp(x, o)); queue(ops.length - 1, q); flush(); return; }
    cur = { c: tool === 'eraser' ? PAPER : ink, w: SIZES[size] * (tool === 'eraser' ? 1.6 : 1), p: [q] };
    ops.push(cur); seg(x, cur); queue(ops.length - 1, q);
  };
  c.onpointermove = (e) => {
    if (!cur || full()) return;
    const co = e.getCoalescedEvents?.();
    for (const ev of co?.length ? co : [e]) {
      const [px, py] = pos(ev), l = cur.p.at(-1);
      if (Math.hypot(px - l[0], (py - l[1]) * (H / W)) < 0.003) continue;
      const q = [px, py, now()]; cur.p.push(q); seg(x, cur, cur.p.length - 1); queue(ops.length - 1, q);
    }
  };
  c.onpointerup = c.onpointercancel = () => { if (cur) { cur = null; flush(); } };

  const blob = (col) => h('button', { className: 'sk-ink' + (col === ink ? ' on' : ''), style: `--c:${col}`, title: col, onclick: () => { ink = col; if (tool === 'eraser') setTool('pen'); mark(); } });
  const dot = (i) => h('button', { className: 'sk-size' + (i === size ? ' on' : ''), title: `толщина ${i + 1}`, onclick: () => { size = i; if (tool === 'fill') setTool('pen'); mark(); } }, h('i', { style: `--d:${4 + i * 5}px` }));
  const tbtn = (t, label, title) => h('button', { className: 'sk-tool', title, textContent: label, onclick: () => setTool(t) });
  const tools = { pen: tbtn('pen', '✏️', 'кисть (B)'), eraser: tbtn('eraser', '🧽', 'ластик (E)'), fill: tbtn('fill', '🪣', 'заливка (F)') };
  const undo = () => { if (!ops.length) return; ops.pop(); S.paint(); flush(); onOp?.({ k: 'u' }); };
  const clear = () => { if (!ops.length) return; ops.length = 0; S.paint(); pending.clear(); onOp?.({ k: 'x' }); };
  const inks = h('div', { className: 'sk-inks' }, ...INKS.map(blob));
  const sizes = h('div', { className: 'sk-sizes' }, ...SIZES.map((_, i) => dot(i)));
  const bar = h('div', { className: 'sk-bar' }, inks, sizes, h('div', { className: 'sk-tools' }, tools.pen, tools.eraser, tools.fill,
    h('button', { className: 'sk-tool', title: 'отменить (Ctrl+Z)', textContent: '↶', onclick: undo }),
    h('button', { className: 'sk-tool sk-clear', title: 'стереть всё', textContent: 'стереть', onclick: clear })));
  function setTool(t) { tool = t; mark(); }
  function mark() {
    inks.querySelectorAll('.sk-ink').forEach((b) => b.classList.toggle('on', b.title === ink && tool !== 'eraser'));
    sizes.querySelectorAll('.sk-size').forEach((b, i) => b.classList.toggle('on', i === size));
    for (const [t, b] of Object.entries(tools)) b.classList.toggle('on', t === tool);
    c.dataset.tool = tool;
  }
  mark();
  const keys = (e) => {
    if (!c.isConnected) return removeEventListener('keydown', keys);
    if (e.target.closest?.('input, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
    const n = '1234'.indexOf(e.key); if (n >= 0) { size = n; mark(); }
    const t = { KeyB: 'pen', KeyE: 'eraser', KeyF: 'fill' }[e.code]; if (t && !e.ctrlKey) setTool(t);
  };
  addEventListener('keydown', keys);
  S.el = h('div', { className: 'sk sk-edit' }, c, bar);
  S.undo = undo; S.clear = clear;
  return S;
}
