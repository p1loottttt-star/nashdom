// «Рисуй — угадывай» (спека docs/specs/2026-10-10-draw-guess-design.md): кооператив, 6 раундов, общая серия пары.
// Вживую (партнёр открыл ту же партию): штрихи идут через канал пары, таймер 80 с, буквы сами на 50% и 75%; раунд закрывает угадывающий.
// Не вживую: рисунок уходит ходом, партнёр смотрит повтор и угадывает без таймера.
// state: { phase: 'pick'|'draw'|'guess', choices: [{ w, s }], swaps, word, stars, strokes?, hints, rounds: [{ word, stars, drawer, ok, pts, live, tries }] }
// рисунок раунда n — drawing/<партия>:<n> = { strokes, word, by, ok, tries, at, likes }; свои слова — meta/drawwords; серия — meta/draw
import * as store from './store.js';
import { EASY, MID, HARD } from './gamedata.js';
import { sameWord, closeWord, hintMask, drawPoints, drawChoices, DRAW_T } from './gamelogic.js';
import { sketch } from './sketch.js';
import { h } from './games.js';
import { toast } from './desktop.js';
import { chime, pop } from './sound.js';

const ROUNDS = 6;
const ours = () => store.get('meta', 'drawwords')?.list || [];
const fresh = (swaps = 1) => ({ phase: 'pick', choices: drawChoices([EASY, MID, HARD], ours()), swaps, word: '', stars: 0, hints: 0 });
const total = (st) => st.rounds.reduce((s, r) => s + r.pts, 0);
const series = () => store.get('meta', 'draw') || { streak: 0, best: 0 };
const stars = (n) => '★'.repeat(n);
const send = (m) => store.live.send('dr', m);
const autoHints = (left) => (left <= DRAW_T / 2 ? 1 : 0) + (left <= DRAW_T / 4 ? 1 : 0);
const here = (id) => { const p = store.partner(); return !!p && store.live.presence()[p.id]?.dr === id; };

// подписки живут, пока элемент в документе (games.js перерисовывает партию целиком)
function life(el) {
  const offs = [];
  const t = setInterval(() => { if (!el.isConnected) { clearInterval(t); offs.forEach((f) => f()); } }, 700);
  return (f) => offs.push(f);
}
function seriesLine(st) {
  const s = series();
  return h('div', { className: 'dr-meta' }, h('span', { textContent: `раунд ${Math.min(st.rounds.length + 1, ROUNDS)}/${ROUNDS}` }), h('span', { textContent: `очки ${total(st)}` }),
    h('span', { className: 'dr-streak', textContent: `🔥 угадали подряд: ${s.streak}` }), h('span', { textContent: `рекорд ${s.best}` }));
}

// закрытие раунда (у угадывающего): рисунок отдельно, итог в партию, серия пары
function finishRound(ctx, st, { ok, ops, tries, hints, live, left }) {
  const { m, me, partner } = ctx, n = st.rounds.length;
  store.put('drawing', `${m.id}:${n}`, { strokes: ops, word: st.word, by: partner, ok, tries, at: Date.now(), likes: [] }).catch(console.warn);
  const pts = drawPoints({ ok, stars: st.stars, hints, live, left });
  const s = series(), streak = ok ? s.streak + 1 : 0;
  store.put('meta', 'draw', { streak, best: Math.max(s.best, streak) }).catch(console.warn);
  if (live) send({ m: m.id, k: ok ? 'ok' : 'to', pts });
  if (ok) chime();
  const rounds = [...st.rounds, { word: st.word, stars: st.stars, drawer: partner, ok, pts, live, tries: tries.slice(-12) }], score = rounds.reduce((a, r) => a + r.pts, 0);
  if (rounds.length >= ROUNDS) ctx.save({ state: { ...st, phase: 'end', strokes: null, rounds }, score, done: true, turn: null });
  else ctx.save({ state: { ...fresh(st.swaps), rounds }, score, turn: me }); // угадавший рисует следующим
}

// поле догадок: Enter — проверка; «близко!» — ошибка в 1–2 буквы
function guessBox(st, { onRight, onWrong }) {
  const tries = [];
  const input = h('input', { className: 'gm-input', placeholder: 'что это? пиши и Enter', maxLength: 40 });
  const note = h('span', { className: 'dr-note' });
  const list = h('p', { className: 'dr-tries' });
  const check = () => {
    const v = input.value.trim(); if (!v) return;
    if (sameWord(v, st.word)) return onRight(tries);
    const close = closeWord(v, st.word);
    tries.push(v); list.textContent = 'было: ' + tries.join(', ');
    note.textContent = close ? 'близко!' : ''; note.classList.toggle('on', close);
    input.value = ''; input.classList.remove('dr-no'); void input.offsetWidth; input.classList.add('dr-no');
    onWrong?.(v, close);
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') check(); };
  setTimeout(() => input.focus());
  return { el: [h('div', { className: 'gm-line' }, input, h('button', { className: 'gm-go', textContent: 'это оно!', onclick: check }), note), list], tries };
}

// ---- выбор слова ----
function pickView(el, ctx, st) {
  const choose = (c) => {
    ctx.save({ state: { ...st, phase: 'draw', word: c.w, stars: c.s, hints: 0 } });
    send({ m: ctx.m.id, k: 'drawing', who: ctx.me });
  };
  const words = h('div', { className: 'dr-choose' }, ...st.choices.map((c) => h('button', { className: 'dr-card s' + c.s, onclick: () => choose(c) },
    h('i', { textContent: stars(c.s) }), h('b', { textContent: c.w }), c.ours ? h('small', { textContent: 'наше слово' }) : h('small', { textContent: ['легко', 'постараться', 'попробуй-ка'][c.s - 1] }))));
  const swap = st.swaps > 0 ? h('button', { className: 'dr-swap', textContent: '↻ другие слова (1 раз за партию)', onclick: () => ctx.save({ state: { ...st, choices: drawChoices([EASY, MID, HARD], ours()), swaps: st.swaps - 1 } }) }) : null;
  el.append(seriesLine(st), lastNote(st), h('p', { className: 'gm-big', textContent: 'Что будешь рисовать?' }), words, swap, oursEditor());
}
function lastNote(st) {
  const r = st.rounds.at(-1);
  return r ? h('p', { className: 'gm-sub', textContent: r.ok ? `«${r.word}» угадано: +${r.pts}` : `Прошлое слово было «${r.word}»` }) : '';
}
// свои слова пары: места, шутки, имена — попадаются на ★★
function oursEditor() {
  const save = (l) => store.put('meta', 'drawwords', { list: l }).catch(console.warn);
  const sum = h('summary', { textContent: `наши слова (${ours().length})` });
  const chip = (w) => h('span', { className: 'dr-chip' }, w, h('button', { textContent: '×', title: 'убрать', onclick: (e) => { save(ours().filter((x) => x !== w)); e.target.parentNode.remove(); sum.textContent = `наши слова (${ours().length})`; } }));
  const chips = h('div', { className: 'dr-chips' }, ...ours().map(chip));
  const input = h('input', { placeholder: 'место, шутка, имя кота…', maxLength: 30 });
  const add = (e) => {
    e.preventDefault();
    const w = input.value.trim().toLowerCase(); input.value = '';
    if (!w || ours().includes(w)) return;
    save([...ours(), w].slice(-60)); chips.append(chip(w)); sum.textContent = `наши слова (${ours().length})`;
  };
  return h('details', { className: 'dr-ours' }, sum, h('p', { className: 'gm-sub', textContent: 'Свои слова иногда выпадают вместо ★★' }), chips,
    h('form', { className: 'gm-line', onsubmit: add }, input, h('button', { className: 'gm-go', textContent: '+' })));
}

// ---- рисующий ----
function drawerView(el, ctx, st) {
  const { m } = ctx, keep = life(el);
  let live = false, t0 = 0, left = DRAW_T, hints = st.hints || 0, tick = 0;
  const S = sketch({ edit: true, onOp: (op) => { if (live) send({ m: m.id, ...op }); } });
  const status = h('p', { className: 'dr-status' });
  const clock = h('b', { className: 'dr-clock' });
  const mask = h('span', { className: 'dr-mask' });
  const bubbles = h('div', { className: 'dr-bubbles' });
  const hintBtn = h('button', { className: 'sk-tool', textContent: 'подсказать букву', onclick: () => { if (hints < 2) { hints++; send({ m: m.id, k: 'h', n: hints }); paintMask(); } } });
  const sendBtn = h('button', { className: 'gm-go', textContent: `отправить ${ctx.pname} ходом`, onclick: () => {
    if (!S.ops.length) return toast('Сначала нарисуй что-нибудь');
    ctx.save({ state: { ...st, phase: 'guess', strokes: S.ops, hints: 0 }, turn: ctx.partner });
  } });
  const paintMask = () => { mask.textContent = hintMask(st.word, autoHints(left) + hints); hintBtn.disabled = hints >= 2 || !live; };
  const snapshot = () => send({ m: m.id, k: 'all', ops: S.ops, hints, left: live ? left : DRAW_T });
  function start() {
    live = true; t0 = performance.now() - (DRAW_T - left) * 1000;
    snapshot(); send({ m: m.id, k: 'go', left });
    status.textContent = `${ctx.pname} смотрит вживую 👀 — рисуй!`; sendBtn.hidden = true;
    clearInterval(tick);
    tick = setInterval(() => {
      if (!el.isConnected) return clearInterval(tick);
      left = Math.max(0, DRAW_T - (performance.now() - t0) / 1000);
      clock.textContent = Math.ceil(left); clock.classList.toggle('low', left < 15); paintMask();
    }, 250);
  }
  function stop() {
    live = false; clearInterval(tick);
    status.textContent = `${ctx.pname} не в игре — отправь ходом или подожди: откроет партию — будет вживую`; sendBtn.hidden = false; paintMask();
  }
  const sync = () => { const now = here(m.id); if (now && !live) start(); else if (!now && live) stop(); };
  keep(store.live.onPresence(sync));
  keep(store.live.on('dr', (msg) => {
    if (msg.m !== m.id || !el.isConnected) return;
    if (msg.k === 'sync?') { if (!live) start(); else snapshot(); }
    else if (msg.k === 'g') { const b = h('span', { className: 'dr-bubble' + (msg.close ? ' close' : ''), textContent: msg.close ? `${msg.v} — почти!` : msg.v }); bubbles.prepend(b); setTimeout(() => b.remove(), 6000); pop(); }
    else if (msg.k === 'ok' || msg.k === 'to') { clearInterval(tick); status.textContent = msg.k === 'ok' ? `Угадано! +${msg.pts} 🎉` : 'Время вышло'; }
  }));
  store.live.track({ app: 'games', dr: m.id });
  keep(() => store.live.track({ app: 'games' }));
  el.append(seriesLine(st), h('div', { className: 'dr-head' }, h('p', { className: 'gm-big', textContent: `Рисуй: «${st.word}» ${stars(st.stars)}` }), clock),
    h('p', { className: 'gm-sub', textContent: 'Без букв и цифр — только картинка' }), status,
    h('div', { className: 'dr-stage' }, S.el, bubbles), h('div', { className: 'dr-under' }, h('span', {}, 'видит: ', mask), hintBtn, sendBtn));
  paintMask(); sync(); if (!live) stop();
}

// ---- угадывающий вживую (рисующий ещё рисует) ----
function liveGuessView(el, ctx, st) {
  const { m } = ctx, keep = life(el);
  let left = DRAW_T, t0 = 0, hints = st.hints || 0, going = false, done = false, tick = 0;
  const S = sketch();
  const status = h('p', { className: 'dr-status' });
  const clock = h('b', { className: 'dr-clock' });
  const mask = h('p', { className: 'dr-mask' });
  const paintMask = () => { mask.textContent = hintMask(st.word, autoHints(left) + hints) + `  (${st.word.replace(/ /g, '').length} букв)`; };
  const finish = (ok, tries) => { if (done) return; done = true; clearInterval(tick); finishRound(ctx, st, { ok, ops: S.ops, tries, hints, live: true, left }); };
  const g = guessBox(st, { onRight: (t) => finish(true, t), onWrong: (v, close) => send({ m: m.id, k: 'g', v, close }) });
  function go(l) {
    going = true; left = l; t0 = performance.now() - (DRAW_T - l) * 1000;
    status.textContent = `${ctx.pname} рисует — угадывай!`;
    clearInterval(tick);
    tick = setInterval(() => {
      if (!el.isConnected) return clearInterval(tick);
      left = Math.max(0, DRAW_T - (performance.now() - t0) / 1000);
      clock.textContent = Math.ceil(left); clock.classList.toggle('low', left < 15); paintMask();
      if (left <= 0) finish(false, g.tries);
    }, 250);
  }
  keep(store.live.on('dr', (msg) => {
    if (msg.m !== m.id || !el.isConnected) return;
    if (msg.k === 'go') go(msg.left);
    else if (msg.k === 'h') { hints = msg.n; paintMask(); }
    else if (msg.k === 'all') { S.apply(msg); hints = msg.hints || 0; paintMask(); }
    else S.apply(msg);
  }));
  keep(store.live.onPresence(() => { if (!here(m.id) && going) { clearInterval(tick); going = false; status.textContent = `${ctx.pname} вышел(ла) из партии — рисунок придёт ходом`; } }));
  store.live.track({ app: 'games', dr: m.id });
  keep(() => store.live.track({ app: 'games' }));
  status.textContent = here(m.id) ? 'подключаемся…' : `${ctx.pname} выбрал(а) слово и вот-вот начнёт — как откроет партию, увидишь рисунок вживую`;
  send({ m: m.id, k: 'sync?' });
  el.append(seriesLine(st), h('div', { className: 'dr-head' }, h('p', { className: 'gm-big', textContent: `Угадай ${stars(st.stars)}` }), clock), status,
    S.el, mask, ...g.el, h('div', { className: 'dr-under' }, h('button', { className: 'sk-tool', textContent: 'сдаюсь', onclick: () => going && finish(false, g.tries) })));
  paintMask();
}

// ---- угадывающий по ходу (повтор рисунка) ----
function asyncGuessView(el, ctx, st) {
  let hints = 0;
  const S = sketch({ ops: st.strokes });
  S.play();
  const letters = st.word.replace(/ /g, '').length, maxH = Math.min(2, letters - 1);
  const mask = h('p', { className: 'dr-mask', textContent: hintMask(st.word, 0) + `  (${letters} букв)` });
  const g = guessBox(st, { onRight: (t) => finishRound(ctx, st, { ok: true, ops: st.strokes, tries: t, hints, live: false }) });
  el.append(seriesLine(st), lastNote(st), h('p', { className: 'gm-big', textContent: `Что нарисовал(а) ${ctx.pname}? ${stars(st.stars)}` }), S.el, mask, ...g.el,
    h('div', { className: 'dr-under' },
      h('button', { className: 'sk-tool', textContent: '▶ ещё раз', onclick: () => S.play() }),
      h('button', { className: 'sk-tool', textContent: 'буква (−1)', disabled: maxH < 1, onclick: (e) => { hints++; mask.textContent = hintMask(st.word, hints) + `  (${letters} букв)`; if (hints >= maxH) e.target.disabled = true; } }),
      h('button', { className: 'sk-tool', textContent: 'сдаюсь', onclick: () => finishRound(ctx, st, { ok: false, ops: st.strokes, tries: g.tries, hints, live: false }) })));
}

// ---- финал: все рисунки заново, смешные догадки, ♥, в галерею, на стену ----
async function toGallery(d) {
  const blob = await d.S.png();
  let f = store.all('folders').find((x) => x.name === 'Наши рисунки');
  if (!f) { f = { id: store.uid(), name: 'Наши рисунки', color: '#f2cf7e', created: Date.now() }; await store.put('folders', f.id, { name: f.name, color: f.color, created: f.created }); }
  const url = await store.uploadPhoto(blob);
  await store.put('photos', store.uid(), { folder: f.id, url, caption: d.word, date: new Date().toISOString(), who: store.me().name });
  toast('Рисунок в галерее, папка «Наши рисунки» 🖼️');
}
async function toWall(d, i) {
  const url = await store.uploadPhoto(await d.S.png());
  await store.put('wall', 'w' + i, { url, caption: d.word });
  toast('Повесили на стену в комнате 📌');
}
function finale(el, ctx, st) {
  const { m, me } = ctx, s = series();
  const verdict = m.score >= ROUNDS * 6 ? 'Вы читаете рисунки друг друга с полуштриха' : m.score >= ROUNDS * 3 ? 'Художники что надо' : 'Главное — было смешно';
  const cards = st.rounds.map((r, i) => {
    const d = store.get('drawing', `${m.id}:${i}`);
    if (!d?.strokes) return h('div', { className: 'dr-fin' }, h('b', { textContent: `${r.ok ? '✓' : '✗'} ${r.word} · +${r.pts}` }));
    const S = sketch({ ops: d.strokes }), card = { S, word: d.word };
    const liked = (d.likes || []).includes(me);
    const heart = h('button', { className: 'dr-like' + (liked ? ' on' : ''), textContent: `♥ ${(d.likes || []).length || ''}`, onclick: () => {
      const cur = store.get('drawing', `${m.id}:${i}`), likes = new Set(cur.likes || []);
      likes.has(me) ? likes.delete(me) : likes.add(me);
      store.put('drawing', `${m.id}:${i}`, { ...cur, likes: [...likes] }).catch(console.warn);
      heart.classList.toggle('on', likes.has(me)); heart.textContent = `♥ ${likes.size || ''}`; pop();
    } });
    const wall = h('details', { className: 'dr-wall' }, h('summary', { textContent: '📌 на стену' }),
      h('div', {}, ...[0, 1, 2, 3].map((k) => h('button', { textContent: `${k + 1}`, title: `полароид ${k + 1}`, onclick: (e) => { e.target.closest('details').open = false; toWall(card, k).catch(() => toast('не получилось')); } }))));
    setTimeout(() => S.play(1.4), 200 + i * 350);
    return h('div', { className: 'dr-fin' + (r.ok ? '' : ' miss') },
      h('div', { className: 'dr-fin-pic', onclick: () => S.play(1.6), title: 'ещё раз' }, S.el),
      h('b', { textContent: `${r.ok ? '✓' : '✗'} ${r.word} ${stars(r.stars || 1)} · +${r.pts}` }),
      h('small', { textContent: `рисовал(а) ${store.nameOf(r.drawer) || ''}` }),
      r.tries?.length ? h('p', { className: 'dr-tries', textContent: 'догадки: ' + r.tries.join(', ') }) : null,
      h('div', { className: 'dr-fin-act' }, heart, h('button', { className: 'sk-tool', textContent: '🖼️ в галерею', onclick: () => toGallery(card).catch(() => toast('не получилось')) }), wall));
  });
  el.append(h('p', { className: 'gm-big', textContent: `${m.score} очков` }), h('p', { className: 'gm-sub', textContent: verdict }),
    h('p', { className: 'dr-streak', textContent: `🔥 угадали подряд: ${s.streak} · рекорд пары: ${s.best}` }),
    h('div', { className: 'dr-fins' }, ...cards), h('button', { className: 'gm-go', textContent: 'ещё партию', onclick: () => ctx.again() }));
}

// уведомление: партнёр выбрал слово и рисует
store.live.on('dr', (msg) => {
  if (msg.k !== 'drawing' || document.querySelector('.dr-live')) return;
  toast(`${store.nameOf(msg.who) || 'Партнёр'} рисует — открой «Игры» и угадывай вживую 🎨`, 6000);
});

export default {
  kind: 'draw', title: 'Рисуй — угадывай', emoji: '🎨',
  rules: 'Один рисует, второй угадывает — вживую с таймером или по ходам. Серия угаданных подряд — общая',
  start: (me) => ({ turn: me, state: { ...fresh(1), rounds: [] } }),
  status: (m) => (m.done ? `${m.score} очков` : `раунд ${m.state.rounds.length + 1}/${ROUNDS} · ${total(m.state)} очк.` + (m.state.phase === 'draw' ? ' · рисует' : '')),

  render(el, ctx) {
    const { m } = ctx, st = m.state;
    el.classList.add('dr');
    if (typeof st.choices?.[0] === 'string') st.choices = drawChoices([EASY, MID, HARD], ours()); // партии до 10.10
    st.stars ||= 1; st.swaps ??= 1;
    if (m.done) return finale(el, ctx, st);
    const drawer = m.turn; // в pick/draw ход у рисующего, в guess — у угадывающего
    if (st.phase === 'pick') {
      if (ctx.mine) return pickView(el, ctx, st);
      return el.append(seriesLine(st), lastNote(st), h('p', { className: 'gm-sub', textContent: `${ctx.pname} выбирает слово…` }));
    }
    if (st.phase === 'draw') {
      if (drawer === ctx.me) return drawerView(el, ctx, st);
      el.classList.add('dr-live');
      return liveGuessView(el, ctx, st);
    }
    if (ctx.mine) return asyncGuessView(el, ctx, st);
    const S = sketch({ ops: st.strokes || [] });
    el.append(seriesLine(st), h('p', { className: 'gm-sub', textContent: `${ctx.pname} угадывает твой рисунок «${st.word}»…` }), S.el);
  },
};
