// Лист записки в окне «написать»: тот же размер и линовка, что у 3D-листа (768×1024), можно писать и рисовать карандашом.
export const PAPER = { w: 768, h: 1024, line0: 170, step: 60, margin: 92, textX: 116 };

export function drawPaper(x, w = PAPER.w, h = PAPER.h) {
  x.fillStyle = '#fffaf0'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { x.fillStyle = `rgba(150,120,90,${Math.random() * 0.05})`; x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  x.strokeStyle = 'rgba(110,150,210,.28)'; x.lineWidth = 2;
  for (let y = PAPER.line0; y < h - 60; y += PAPER.step) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
  x.strokeStyle = 'rgba(230,120,140,.4)'; x.beginPath(); x.moveTo(PAPER.margin, 0); x.lineTo(PAPER.margin, h); x.stroke();
}

export function createPad(form) {
  const wrap = form.querySelector('.pad');
  const [bg, cv] = wrap.querySelectorAll('canvas');
  const ta = form.text;
  for (const c of [bg, cv]) { c.width = PAPER.w; c.height = PAPER.h; }
  drawPaper(bg.getContext('2d'));
  const ctx = cv.getContext('2d');
  let strokes = [], cur = null, color = '#4a4a55';

  const fit = () => wrap.style.setProperty('--u', wrap.clientWidth / PAPER.w + 'px');
  new ResizeObserver(fit).observe(wrap);

  const setMode = (m) => {
    wrap.dataset.mode = m;
    form.querySelectorAll('button[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    if (m === 'text') ta.focus();
  };
  const stroke = (s) => {
    ctx.strokeStyle = s.color; ctx.globalAlpha = 0.88; ctx.lineWidth = 5; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1]);
    for (let i = 1; i < s.pts.length; i++) {
      const [x0, y0] = s.pts[i - 1], [x1, y1] = s.pts[i];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  const redraw = () => { ctx.clearRect(0, 0, PAPER.w, PAPER.h); strokes.forEach(stroke); };
  const at = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * PAPER.w, ((e.clientY - r.top) / r.height) * PAPER.h]; };

  cv.addEventListener('pointerdown', (e) => { try { cv.setPointerCapture(e.pointerId); } catch {} cur = { color, pts: [at(e)] }; strokes.push(cur); redraw(); });
  cv.addEventListener('pointermove', (e) => { if (!cur) return; cur.pts.push(at(e)); redraw(); });
  cv.addEventListener('pointerup', () => { cur = null; });

  form.querySelectorAll('button[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  form.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => {
    color = b.dataset.color; setMode('draw');
    form.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  form.querySelector('[data-undo]').onclick = () => { strokes.pop(); redraw(); };
  form.querySelector('[data-clear]').onclick = () => { strokes = []; redraw(); };

  return {
    open() { fit(); setMode('text'); },
    image: () => (strokes.length ? cv.toDataURL('image/png') : null),
    reset() { strokes = []; redraw(); },
  };
}
