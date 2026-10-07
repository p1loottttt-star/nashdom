// «Одна волна»: ведущий видит скрытую цель на шкале и пишет подсказку, второй ставит стрелку. Кооператив, 5 раундов, очки — waveScore.
// state: { phase: 'clue' | 'guess', choices: [i, j], spectrum, target, clue, rounds: [{ spectrum, target, clue, guess, pts }] }
import { SPECTRA } from './gamedata.js';
import { waveScore, waveVerdict, WAVE_ROUNDS } from './gamelogic.js';
import { h } from './games.js';

const pick2 = () => { const a = Math.floor(Math.random() * SPECTRA.length); let b = Math.floor(Math.random() * (SPECTRA.length - 1)); if (b >= a) b++; return [a, b]; };
const fresh = () => ({ phase: 'clue', choices: pick2(), spectrum: null, target: 6 + Math.floor(Math.random() * 89), clue: '' });
const total = (st) => st.rounds.reduce((s, r) => s + r.pts, 0);

// полукруглая шкала: значение 0..100 слева направо; зоны очков вокруг цели, стрелка
function dial(target, needle) {
  const R = 150, cx = 170, cy = 165, ang = (v) => Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100);
  const pt = (v, r = R) => [cx + Math.cos(ang(v)) * r, cy - Math.sin(ang(v)) * r];
  const wedge = (a, b, fill) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `<path d="M${cx} ${cy} L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} Z" fill="${fill}"/>`; };
  let s = `<svg viewBox="0 0 340 185" class="wv-dial"><path d="M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy} Z" fill="#fff8ea" stroke="#3b2a35" stroke-width="3"/>`;
  if (target != null) for (const [d, c] of [[18, '#fde4a8'], [11, '#f9c3a0'], [4, '#ef6f8c']]) s += wedge(target - d, target + d, c);
  if (needle != null) { const [x, y] = pt(needle, R - 8); s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#3b2a35" stroke-width="5" stroke-linecap="round"/>`; }
  s += `<circle cx="${cx}" cy="${cy}" r="10" fill="#3b2a35"/></svg>`;
  return Object.assign(document.createElement('div'), { className: 'wv-dialbox', innerHTML: s });
}
const labels = (sp) => h('div', { className: 'wv-labels' }, h('b', { textContent: '← ' + SPECTRA[sp][0] }), h('b', { textContent: SPECTRA[sp][1] + ' →' }));
const lastRound = (st, pname) => {
  const r = st.rounds.at(-1);
  if (!r) return ''; // el.append(null) печатает «null»
  return h('div', { className: 'wv-last' }, h('small', { textContent: `Прошлый раунд: «${r.clue}» (${SPECTRA[r.spectrum].join(' ↔ ')})` }), dial(r.target, r.guess), h('b', { textContent: r.pts ? `+${r.pts} — ${['', '', 'рядом!', 'почти!', 'в точку!'][r.pts]}` : 'мимо, бывает' }));
};

export default {
  kind: 'wave', title: 'Одна волна', emoji: '🌊',
  rules: 'Подсказка одним словом — угадай точку на шкале. Вместе, 5 раундов',
  start: (me) => ({ turn: me, state: { ...fresh(), rounds: [] } }),
  status: (m) => (m.done ? `${m.score} из ${WAVE_ROUNDS * 4}` : `раунд ${m.state.rounds.length + 1}/${WAVE_ROUNDS} · ${total(m.state)} очк.`),

  render(el, ctx) {
    const { m, me, partner, pname } = ctx, st = m.state;
    if (m.done) {
      el.append(h('div', { className: 'wv-end' }, h('p', { className: 'gm-big', textContent: `${m.score} из ${WAVE_ROUNDS * 4}` }), h('p', { className: 'gm-sub', textContent: waveVerdict(m.score) }),
        h('div', { className: 'wv-hist' }, ...st.rounds.map((r) => h('div', {}, h('b', { textContent: `«${r.clue}»` }), h('span', { textContent: ` ${SPECTRA[r.spectrum].join(' ↔ ')} · цель ${r.target}, стрелка ${r.guess} · +${r.pts}` })))),
        h('button', { className: 'gm-go', textContent: 'ещё партию', onclick: ctx.again })));
      return;
    }
    if (!ctx.mine) {
      el.append(h('p', { className: 'gm-sub', textContent: st.phase === 'clue' ? `${pname} придумывает подсказку…` : `${pname} угадывает по твоей подсказке «${st.clue}»…` }), lastRound(st, pname));
      return;
    }
    if (st.phase === 'clue') {
      // ведущий: выбрать шкалу, увидеть цель, написать подсказку
      const sp = st.spectrum ?? null;
      const chooser = h('div', { className: 'wv-choose' }, h('small', { textContent: 'Выбери шкалу:' }),
        ...st.choices.map((i) => h('button', { className: sp === i ? 'on' : '', textContent: SPECTRA[i].join(' ↔ '), onclick: () => { st.spectrum = i; el.replaceChildren(); this.render(el, ctx); } })));
      el.append(lastRound(st, pname), chooser);
      if (sp == null) return;
      const input = h('input', { className: 'gm-input', maxLength: 40, placeholder: 'подсказка: слово или пара слов', value: st.clue || '' });
      const send = h('button', { className: 'gm-go', textContent: `отправить ${pname}`, onclick: () => {
        const clue = input.value.trim(); if (!clue) return input.focus();
        ctx.save({ state: { ...st, phase: 'guess', clue }, turn: partner });
      } });
      el.append(h('p', { className: 'gm-sub', textContent: `Цель — розовая зона. Придумай, что лежит в этой точке шкалы, чтобы ${pname} поставил(а) стрелку туда же.` }), dial(st.target, null), labels(sp), h('div', { className: 'gm-line' }, input, send));
      setTimeout(() => input.focus());
      return;
    }
    // угадывающий: стрелка по подсказке
    let v = 50;
    const range = h('input', { type: 'range', min: 0, max: 100, value: v, className: 'wv-range' });
    const wrap = h('div', {}, dial(null, v));
    range.oninput = () => { v = +range.value; wrap.replaceChildren(dial(null, v)); };
    const go = h('button', { className: 'gm-go', textContent: 'вот здесь!', onclick: () => {
      const pts = waveScore(st.target, v), rounds = [...st.rounds, { spectrum: st.spectrum, target: st.target, clue: st.clue, guess: v, pts }];
      const score = rounds.reduce((s, r) => s + r.pts, 0);
      if (rounds.length >= WAVE_ROUNDS) ctx.save({ state: { ...st, rounds }, score, done: true, turn: null });
      else ctx.save({ state: { ...fresh(), rounds }, score, turn: me }); // угадавший ведёт следующий раунд
    } });
    el.append(lastRound(st, pname), h('p', { className: 'gm-big', textContent: `«${st.clue}»` }), wrap, labels(st.spectrum), range, go);
  },
};
