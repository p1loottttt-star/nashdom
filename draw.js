// «Рисуй — угадывай»: рисующий выбирает слово и рисует, угадывающий смотрит повтор рисунка и вводит ответ. Кооператив, 6 раундов.
// state: { phase: 'pick' | 'draw' | 'guess', choices, word, strokes: [{ c, w, p: [[x, y, t]] }], hints, tries, rounds: [{ word, drawer, ok, pts }], last }
// координаты штрихов 0..1 (ширина/высота холста), t — мс от начала рисунка; last — рисунок прошлого раунда (для подписи «было»)
import { WORDS } from './gamedata.js';
import { sameWord, hintMask } from './gamelogic.js';
import { h } from './games.js';

const ROUNDS = 6, MAXPTS = 4000, W = 560, H = 400;
const COLORS = ['#3b2a35', '#ef6f8c', '#5aa2c8', '#6db35e', '#f2b84b'];
const pick3 = () => { const s = new Set(); while (s.size < 3) s.add(WORDS[Math.floor(Math.random() * WORDS.length)]); return [...s]; };
const fresh = () => ({ phase: 'pick', choices: pick3(), word: '', strokes: [], hints: 0, tries: [] });
const total = (st) => st.rounds.reduce((s, r) => s + r.pts, 0);

function canvasEl() {
  const c = h('canvas', { className: 'dr-canvas', width: W * 2, height: H * 2 });
  const x = c.getContext('2d'); x.scale(2, 2); x.lineCap = x.lineJoin = 'round';
  return { c, x };
}
const line = (x, s, upto = Infinity) => {
  const p = s.p.filter((q) => q[2] <= upto);
  if (!p.length) return;
  x.strokeStyle = s.c; x.lineWidth = s.w * W; x.beginPath(); x.moveTo(p[0][0] * W, p[0][1] * H);
  if (p.length === 1) x.lineTo(p[0][0] * W + 0.1, p[0][1] * H);
  for (const q of p.slice(1)) x.lineTo(q[0] * W, q[1] * H);
  x.stroke();
};
const paint = (x, strokes, upto) => { x.fillStyle = '#fffaf2'; x.fillRect(0, 0, W, H); for (const s of strokes) line(x, s, upto); };

// повтор рисунка во времени (быстрее в 1.6 раза, длинные паузы ужаты)
function replay(x, strokes, done) {
  const end = Math.max(0, ...strokes.flatMap((s) => s.p.map((q) => q[2])));
  const t0 = performance.now();
  const step = (now) => { const t = (now - t0) * 1.6; paint(x, strokes, t); if (t < end && x.canvas.isConnected) requestAnimationFrame(step); else done?.(); };
  requestAnimationFrame(step);
  if (document.visibilityState !== 'visible') paint(x, strokes); // фоновая вкладка: сразу целиком
}

export default {
  kind: 'draw', title: 'Рисуй — угадывай', emoji: '🎨',
  rules: 'Нарисуй слово — второй смотрит, как появляется рисунок, и угадывает. 6 раундов',
  start: (me) => ({ turn: me, state: { ...fresh(), rounds: [] } }),
  status: (m) => (m.done ? `${m.score} из ${ROUNDS * 3}` : `раунд ${m.state.rounds.length + 1}/${ROUNDS} · ${total(m.state)} очк.`),

  render(el, ctx) {
    const { m, me, partner, pname } = ctx, st = m.state;
    const last = st.rounds.at(-1);
    const lastNote = last ? h('p', { className: 'gm-sub', textContent: last.ok ? `Прошлое слово «${last.word}» угадано: +${last.pts}` : `Прошлое слово было «${last.word}»` }) : '';
    if (m.done) {
      el.append(h('p', { className: 'gm-big', textContent: `${m.score} из ${ROUNDS * 3}` }),
        h('p', { className: 'gm-sub', textContent: m.score >= 14 ? 'Вы читаете рисунки друг друга с полуштриха' : m.score >= 8 ? 'Художники что надо' : 'Главное — было смешно' }),
        h('div', { className: 'wv-hist' }, ...st.rounds.map((r) => h('div', { textContent: `${r.ok ? '✓' : '✗'} ${r.word} · +${r.pts}` }))),
        h('button', { className: 'gm-go', textContent: 'ещё партию', onclick: ctx.again }));
      return;
    }
    if (!ctx.mine) {
      el.append(lastNote, h('p', { className: 'gm-sub', textContent: st.phase === 'guess' ? `${pname} угадывает твой рисунок…` : `${pname} рисует…` }));
      if (st.phase === 'guess') { const { c, x } = canvasEl(); paint(x, st.strokes); el.append(c); }
      return;
    }
    if (st.phase === 'pick') {
      el.append(lastNote, h('p', { className: 'gm-big', textContent: 'Что будешь рисовать?' }),
        h('div', { className: 'wv-choose' }, ...st.choices.map((w) => h('button', { textContent: w, onclick: () => { Object.assign(st, { phase: 'draw', word: w }); el.replaceChildren(); this.render(el, ctx); } }))));
      return;
    }
    if (st.phase === 'draw') {
      // свой холст: цвет, толщина, отмена; запись штрихов с временем
      const { c, x } = canvasEl(), strokes = [];
      let color = COLORS[0], width = 0.008, cur = null, t0 = null, count = 0;
      paint(x, strokes);
      const pos = (e) => { const r = c.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width).toFixed(3), +((e.clientY - r.top) / r.height).toFixed(3)]; };
      c.onpointerdown = (e) => {
        if (count >= MAXPTS) return;
        c.setPointerCapture(e.pointerId); t0 ??= performance.now();
        cur = { c: color, w: width, p: [[...pos(e), Math.round(performance.now() - t0)]] }; strokes.push(cur); count++; line(x, cur);
      };
      c.onpointermove = (e) => {
        if (!cur || count >= MAXPTS) return;
        const [px, py] = pos(e), q = cur.p.at(-1);
        if (Math.hypot(px - q[0], (py - q[1]) * (H / W)) < 0.004) return;
        cur.p.push([px, py, Math.round(performance.now() - t0)]); count++; line(x, cur);
      };
      c.onpointerup = c.onpointercancel = () => { cur = null; };
      const tools = h('div', { className: 'dr-tools' },
        ...COLORS.map((col) => h('button', { className: 'dr-col' + (col === color ? ' on' : ''), style: `background:${col}`, onclick: (e) => { color = col; tools.querySelectorAll('.dr-col').forEach((b) => b.classList.toggle('on', b === e.target)); } })),
        h('button', { textContent: 'тонко', onclick: () => { width = 0.008; } }), h('button', { textContent: 'толсто', onclick: () => { width = 0.022; } }),
        h('button', { textContent: '↶ отменить', onclick: () => { strokes.pop(); paint(x, strokes); } }),
        h('button', { textContent: 'стереть всё', onclick: () => { strokes.length = 0; paint(x, strokes); } }));
      const send = h('button', { className: 'gm-go', textContent: `отправить ${pname}`, onclick: () => {
        if (!strokes.length) return;
        ctx.save({ state: { ...st, phase: 'guess', strokes, hints: 0, tries: [] }, turn: partner });
      } });
      el.append(h('p', { className: 'gm-big', textContent: `Рисуй: «${st.word}»` }), h('p', { className: 'gm-sub', textContent: 'Без букв и цифр — только картинка' }), c, tools, send);
      return;
    }
    // угадывающий: повтор рисунка, ответ, подсказки
    const { c, x } = canvasEl(), letters = st.word.replace(/ /g, '').length;
    replay(x, st.strokes);
    const finish = (ok) => {
      const pts = ok ? Math.max(1, 3 - st.hints) : 0;
      const rounds = [...st.rounds, { word: st.word, drawer: partner, ok, pts }], score = rounds.reduce((s, r) => s + r.pts, 0);
      if (rounds.length >= ROUNDS) ctx.save({ state: { ...st, rounds }, score, done: true, turn: null });
      else ctx.save({ state: { ...fresh(), rounds }, score, turn: me }); // угадавший рисует следующим
    };
    const input = h('input', { className: 'gm-input', placeholder: 'что это?', maxLength: 40 });
    const tries = h('p', { className: 'dr-tries', textContent: st.tries.length ? 'было: ' + st.tries.join(', ') : '' });
    const check = () => {
      const v = input.value.trim(); if (!v) return;
      if (sameWord(v, st.word)) return finish(true);
      st.tries = [...st.tries, v].slice(-8); tries.textContent = 'было: ' + st.tries.join(', ');
      input.value = ''; input.classList.remove('dr-no'); void input.offsetWidth; input.classList.add('dr-no');
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') check(); };
    const mask = h('p', { className: 'dr-mask', textContent: hintMask(st.word, st.hints) });
    el.append(lastNote, c,
      h('div', { className: 'dr-tools' }, h('button', { textContent: '▶ ещё раз', onclick: () => replay(x, st.strokes) }),
        h('button', { textContent: 'подсказка: буква (−1)', disabled: st.hints >= Math.min(2, letters - 1), onclick: (e) => { st.hints++; mask.textContent = hintMask(st.word, st.hints); if (st.hints >= Math.min(2, letters - 1)) e.target.disabled = true; } }),
        h('button', { textContent: 'сдаюсь', onclick: () => finish(false) })),
      mask, h('div', { className: 'gm-line' }, input, h('button', { className: 'gm-go', textContent: 'это оно!', onclick: check })), tries);
    setTimeout(() => input.focus());
  },
};
