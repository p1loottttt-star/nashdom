// «Котобой» вместо морского боя: поле 10×10, шесть котов разной формы, туман, кляксы «МЯУ!», следы лап, карточки.
// state: { cats: { [id]: коты | null }, box: { [id]: клетка-ловушка }, shots: { [id]: клетки, по которым стрелял id },
//          cards: { [id]: ['bell'|'laser'|'fish'] }, marks: { [id]: [{ c, n? , fish? }] }, skip: id | null, last: { by, text } }
// Карточки — бесплатное действие перед выстрелом, лазер стреляет сам (попал — ещё ход). Свой пойманный кот даёт тебе карточку.
// Коробка: кто в неё выстрелил, пропускает следующий ход. Правила — gamelogic.js (CN, CATS, catShoot, bell, laser, fish…).
import * as store from './store.js';
import { CN, CATS, placeCat, catsClash, randomCats, catShoot, bell, laser, fish } from './gamelogic.js';
import { h } from './games.js';
import { meow, paws, pop, chime } from './sound.js';

const nameOf = (id) => store.nameOf(id) || 'партнёр';
const setup = (m) => m.players.some((id) => !m.state.cats[id]);
const CARD = {
  bell: { icon: '🔔', name: 'Колокольчик', tip: 'выбери клетку — узнаешь, сколько котов в квадрате 3×3 вокруг' },
  laser: { icon: '🔦', name: 'Лазерная указка', tip: 'три выстрела в ряд — выбери начало (Shift — вниз)' },
  fish: { icon: '🐟', name: 'Рыбка', tip: 'кот выдаёт себя: покажется одна его клетка' },
};
const COLORS = { kitten: '#f0a35e', ball: '#a9a3b8', tail: '#4a3f4f', stretch: '#f2d3a8', curl: '#d98a6a', fat: '#8c7b70' };
const rc = (i) => [Math.floor(i / CN), i % CN];
const S = 34; // клетка, px

// кот рисунком: тело — клетки, слитые перемычками; голова с ушами и глазами — первая клетка, хвост — у последней.
// Живой: моргает, дёргает ушами, машет хвостом (CSS, у каждого кота своя задержка). mood: 'calm' | 'sad' (попали) | 'angry' (пойман)
function catSVG(cat, mood = 'calm', n = 0) {
  const col = COLORS[cat.k], dark = cat.k === 'tail';
  const parts = [];
  const cells = cat.cells.map(rc);
  for (const [r, c] of cells) parts.push(`<rect x="${c * S + 3}" y="${r * S + 3}" width="${S - 6}" height="${S - 6}" rx="11"/>`);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, b] = cells[i], [p, q] = cells[j];
    if (a === p && Math.abs(b - q) === 1) parts.push(`<rect x="${Math.min(b, q) * S + S / 2}" y="${a * S + 5}" width="${S}" height="${S - 10}"/>`);
    if (b === q && Math.abs(a - p) === 1) parts.push(`<rect x="${b * S + 5}" y="${Math.min(a, p) * S + S / 2}" width="${S - 10}" height="${S}"/>`);
  }
  const has = (r, c) => cells.some(([a, b]) => a === r && b === c);
  for (const [r, c] of cells) if (has(r, c + 1) && has(r + 1, c) && has(r + 1, c + 1)) parts.push(`<rect x="${c * S + S / 2}" y="${r * S + S / 2}" width="${S}" height="${S}"/>`); // середина «квадрата» 2×2
  const [hr, hc] = cells[0], hx = hc * S + S / 2, hy = hr * S + S / 2;
  const [tr, tc] = cells.at(-1), [pr, pc] = cells.at(-2) || cells[0];
  const dx = tc - pc || 0.7, dy = tr - pr || -0.7, bx = tc * S + S / 2, by = tr * S + S / 2, tx = bx + dx * 12, ty = by + dy * 12;
  const ink = '#3b2a35', eye = dark ? '#f6e27a' : ink, d = ((n * 1.7) % 5).toFixed(2);
  const tail = `M${bx} ${by} Q${tx + dy * 8} ${ty - dx * 8} ${tx + dx * 6} ${ty + dy * 6}`;
  const face = mood === 'angry'
    ? `<path d="M${hx - 10} ${hy - 6} l7 3 M${hx + 10} ${hy - 6} l-7 3" stroke="${eye}" stroke-width="2.4" stroke-linecap="round"/>
       <path d="M${hx - 7} ${hy} l3 0 M${hx + 4} ${hy} l3 0" stroke="${eye}" stroke-width="2.6" stroke-linecap="round"/>
       <path d="M${hx - 4} ${hy + 8} q4 -4 8 0" stroke="${eye}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
       <path d="M${hx + 9} ${hy - 15} l4 4 m0 -4 l-4 4" stroke="#d94f62" stroke-width="2" stroke-linecap="round"/>`
    : mood === 'sad'
      ? `<path d="M${hx - 8} ${hy - 1} q3 -3 6 0 M${hx + 2} ${hy - 1} q3 -3 6 0" stroke="${eye}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
         <path d="M${hx - 3} ${hy + 7} q3 -3 6 0" stroke="${eye}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
         <path class="kb-tear" d="M${hx - 6} ${hy + 2} q-2 4 0 5 q2 -1 0 -5z" fill="#5a9fd0"/>`
      : `<g class="kb-eyes"><circle cx="${hx - 5}" cy="${hy - 1}" r="2.3" fill="${eye}"/><circle cx="${hx + 5}" cy="${hy - 1}" r="2.3" fill="${eye}"/></g>
         <path d="M${hx - 3} ${hy + 5} q3 3 6 0" stroke="${eye}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  return `<g class="kb-cat ${mood}" style="--d:-${d}s">
    <g class="kb-tail" style="transform-origin:${bx}px ${by}px">
      <path d="${tail}" stroke="${ink}" stroke-width="9" stroke-linecap="round" fill="none"/>
      <path d="${tail}" stroke="${col}" stroke-width="5.5" stroke-linecap="round" fill="none"/></g>
    <g class="kb-ears" style="transform-origin:${hx}px ${hy - 6}px"><path d="M${hx - 12} ${hy - 6} l3 -13 l8 8 z M${hx + 12} ${hy - 6} l-3 -13 l-8 8 z" fill="${col}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/></g>
    <g fill="${col}" stroke="${ink}" stroke-width="3.2">${parts.join('')}</g>
    <g fill="${col}">${parts.join('')}</g>
    ${face}
    <path d="M${hx - 15} ${hy + 3} h6 M${hx + 9} ${hy + 3} h6" stroke="${eye}" stroke-width="1" opacity=".7"/>
  </g>`;
}
// отметки рисунком (эмодзи внутри SVG не рисуются — их подменяет emoji.js на <img>)
const pawSVG = (x, y) => `<g class="kb-paw" transform="translate(${x} ${y})"><ellipse cx="0" cy="4" rx="5.5" ry="4.5"/><circle cx="-6" cy="-3" r="2.3"/><circle cx="-2" cy="-7" r="2.3"/><circle cx="2.5" cy="-7" r="2.3"/><circle cx="6.5" cy="-3" r="2.3"/></g>`;
const blotSVG = (x, y) => `<g class="kb-blot" transform="translate(${x + 8} ${y + 8}) scale(.55)"><path d="M0 -12 q9 2 11 9 q5 6 -1 12 q-4 7 -12 4 q-9 3 -11 -5 q-6 -6 0 -12 q4 -8 13 -8z"/></g>`; // клякса в углу клетки — морда кота видна
const fishSVG = (x, y) => `<g class="kb-fishm" transform="translate(${x} ${y})"><path d="M-9 0 q6 -7 13 0 q-7 7 -13 0z M4 0 l6 -5 l0 10z"/><circle cx="-4" cy="-1" r="1.2" fill="#3b2a35"/></g>`;
const boxSVG = (x, y) => `<g class="kb-boxm" transform="translate(${x} ${y})"><path d="M-10 -4 h20 v12 h-20z"/><path d="M-10 -4 l-3 -5 h20 l6 5" fill="none"/><path d="M-2 -4 v4 h4 v-4"/></g>`;

// поле: cats — каких котов показать, shots — выстрелы по полю, marks — подсказки карточек; onCell — клик
function board({ cats = [], shown = cats, shots = [], marks = [], box = null, showBox = false, onCell, onHover, fog = false, preview = null, bad = false }) {
  const hit = new Set(shots), all = new Set(cats.flatMap((c) => c.cells));
  const caught = cats.filter((c) => c.cells.every((i) => hit.has(i)));
  const wrap = h('div', { className: 'kb-board' + (fog ? ' fog' : '') + (onCell ? ' aim' : '') });
  const grid = h('div', { className: 'kb-grid' }, ...Array.from({ length: CN * CN }, (_, i) => {
    const shot = hit.has(i), cat = all.has(i);
    const cls = 'kb-cell' + (shot ? (cat ? ' hit' : ' miss') : '') + (preview?.includes(i) ? (bad ? ' pv bad' : ' pv') : '') + (showBox && box === i ? ' box' : '');
    const b = h('button', { className: cls, disabled: !onCell || (fog && shot), onclick: (e) => onCell?.(i, e) });
    if (onHover) b.onpointerenter = (e) => onHover(i, e);
    return b;
  }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${CN * S} ${CN * S}`); svg.setAttribute('class', 'kb-svg');
  const draw = [...new Set([...shown, ...caught])];
  const hurt = (c) => c.cells.some((i) => hit.has(i));
  const caughtCells = new Set(caught.flatMap((c) => c.cells));
  svg.innerHTML = [...hit].filter((i) => !all.has(i)).map((i) => { const [r, c] = rc(i); return pawSVG(c * S + 17, r * S + 18); }).join('')
    + draw.map((c, n) => catSVG(c, caught.includes(c) ? 'angry' : hurt(c) ? 'sad' : 'calm', n)).join('')
    + [...hit].filter((i) => all.has(i) && !caughtCells.has(i)).map((i) => { const [r, c] = rc(i); return blotSVG(c * S + 17, r * S + 17); }).join('')
    + marks.map((mk) => { const [r, c] = rc(mk.c); return mk.fish ? fishSVG(c * S + 17, r * S + 17) : `<g class="kb-bell"><rect x="${(c - 1) * S + 2}" y="${(r - 1) * S + 2}" width="${S * 3 - 4}" height="${S * 3 - 4}" rx="10"/><text x="${c * S + 17}" y="${r * S + 24}" text-anchor="middle">${mk.n}</text></g>`; }).join('')
    + (showBox && box != null ? (() => { const [r, c] = rc(box); return boxSVG(c * S + 17, r * S + 18); })() : '');
  wrap.append(grid, svg);
  return wrap;
}

function pass(st, from, players) { // ход другому; ловушка — тот пропускает и ход возвращается
  const to = players.find((p) => p !== from);
  if (st.skip === to) return { turn: from, skip: null };
  return { turn: to, skip: st.skip };
}

// ---- расстановка: перемешать, выбрать кота, поставить головой в клетку, R — повернуть, F — отразить, коробка ----
function placeView(el, ctx, st) {
  const { m, me, pname } = ctx;
  let cats = randomCats(), sel = -1, box = null, boxMode = false, hover = -1;
  const holder = h('div', { onpointerleave: () => { hover = -1; if (sel >= 0) paint(); } });
  const msg = h('p', { className: 'gm-sub' });
  const candidate = () => { if (sel < 0 || hover < 0) return null; const c = cats[sel]; const [r, col] = rc(hover); return placeCat(c.k, r, col, c.rot, c.flip); };
  const ok = (c) => c && !catsClash(cats, c, sel) && (box == null || !c.cells.includes(box));
  function paint() {
    const cand = candidate();
    holder.replaceChildren(board({ cats, shown: cats.filter((_, i) => i !== sel || !cand), box, showBox: true, preview: cand?.cells, bad: !ok(cand),
      onHover: (i) => { if (hover !== i) { hover = i; if (sel >= 0) paint(); } },
      onCell: (i) => {
        if (boxMode) { if (cats.some((c) => c.cells.includes(i))) return (msg.textContent = 'Коробку — на пустую клетку'); box = i; boxMode = false; msg.textContent = 'Коробка стоит. Кто в неё выстрелит — пропустит ход'; return paint(); }
        const k = cats.findIndex((c) => c.cells.includes(i));
        if (sel < 0) { if (k >= 0) { sel = k; msg.textContent = `«${CATS.find((d) => d.k === cats[k].k).name}»: наведи и щёлкни, куда поставить. R — повернуть, F — отразить, Esc — отмена`; paint(); } return; }
        const c = candidate();
        if (!ok(c)) return (msg.textContent = 'Тут тесно: коты не касаются боками (углами можно)');
        cats[sel] = c; sel = -1; msg.textContent = 'Можно ещё подвинуть — или в бой!'; pop(); paint();
      } }));
  }
  const keys = (e) => {
    if (!holder.isConnected) return removeEventListener('keydown', keys);
    if (sel < 0) return;
    if (e.code === 'KeyR') { cats[sel] = { ...cats[sel], rot: (cats[sel].rot + 1) % 4 }; paint(); }
    if (e.code === 'KeyF') { cats[sel] = { ...cats[sel], flip: !cats[sel].flip }; paint(); }
    if (e.code === 'Escape') { e.stopPropagation(); sel = -1; paint(); }
  };
  addEventListener('keydown', keys, true);
  msg.textContent = 'Щёлкни по коту, чтобы переставить. Поставь коробку-ловушку.';
  paint();
  el.append(h('p', { className: 'gm-big', textContent: 'Рассади котов' }), msg, holder,
    h('div', { className: 'dr-under' },
      h('button', { textContent: '🎲 перемешать', onclick: () => { cats = randomCats(); sel = -1; if (box != null && cats.some((c) => c.cells.includes(box))) box = null; paint(); } }),
      h('button', { textContent: '📦 коробка', onclick: () => { boxMode = true; sel = -1; msg.textContent = 'Щёлкни по пустой клетке — там будет коробка'; } }),
      h('button', { className: 'gm-go', textContent: 'в бой!', onclick: () => {
        if (box == null) { const free = [...Array(CN * CN).keys()].filter((i) => !cats.some((c) => c.cells.includes(i))); box = free[Math.floor(Math.random() * free.length)]; }
        const cur = store.get('game', m.id).state; // партнёр мог рассадиться, пока я выбирал
        const next = { ...cur, cats: { ...cur.cats, [me]: cats }, box: { ...cur.box, [me]: box } };
        const ready = m.players.every((id) => next.cats[id]);
        ctx.save({ state: next, turn: ready ? m.players[0] : null });
      } })),
    h('div', { className: 'kb-legend' }, ...CATS.map((d) => h('span', {}, `${d.name} · ${d.cells.length}`))));
}

// ---- бой ----
function playView(el, ctx, st) {
  const { m, me, partner, pname } = ctx;
  const foe = st.cats[partner], mine = st.shots[me], myCards = st.cards[me] || [];
  let card = null;
  const say = h('p', { className: 'gm-sub kb-say' });
  const fx = h('div', { className: 'kb-fx' });
  const burst = (text) => { const b = h('b', { textContent: text }); fx.append(b); setTimeout(() => b.remove(), 1100); };
  const save = (patch) => ctx.save({ ...patch, state: { ...st, ...patch.state } });

  function fire(cells, label = 'выстрел') {
    let shots = [...mine], hitAny = false, caughtNow = [], won = false, boxed = false;
    for (const c of cells) {
      if (shots.includes(c)) continue;
      const r = catShoot(foe, shots, c); shots.push(c);
      if (r.hit) hitAny = true; if (r.caught != null) caughtNow.push(r.caught); if (r.won) won = true;
      if (!r.hit && st.box[partner] === c) boxed = true;
    }
    const cards = { ...st.cards }, names = caughtNow.map((k) => CATS.find((d) => d.k === foe[k].k).name);
    // за каждого пойманного кота его хозяин получает карточку — шанс отыграться
    for (const _ of caughtNow) cards[partner] = [...(cards[partner] || []), ['bell', 'laser', 'fish'][Math.floor(Math.random() * 3)]].slice(-4);
    const text = won ? `${nameOf(me)} поймал(а) всех котов!` : names.length ? `${nameOf(me)} поймал(а): ${names.join(', ')}` : hitAny ? `${nameOf(me)} попал(а) — МЯУ!` : boxed ? `${nameOf(me)} попал(а) в коробку и пропускает ход 📦` : `${nameOf(me)}: ${label} мимо`;
    if (hitAny) { meow(); burst(names.length ? 'ПОЙМАН!' : 'МЯУ!'); } else paws();
    const next = { shots: { ...st.shots, [me]: shots }, cards, last: { by: me, text }, skip: boxed ? me : st.skip };
    setTimeout(() => {
      if (won) { chime(); save({ state: next, done: true, turn: null, result: { winner: me } }); }
      else if (hitAny) save({ state: next, turn: me });
      else { const p = pass(next, me, m.players); save({ state: { ...next, skip: p.skip }, turn: p.turn }); }
    }, hitAny ? 650 : 250);
  }
  function useCard(c, i, e) {
    const left = [...myCards]; left.splice(left.indexOf(c), 1);
    const marks = { ...st.marks, [me]: [...(st.marks?.[me] || [])] };
    if (c === 'bell') { marks[me].push({ c: i, n: bell(foe, i) }); pop(); save({ state: { cards: { ...st.cards, [me]: left }, marks, last: { by: me, text: `${nameOf(me)} позвонил(а) в колокольчик 🔔` } }, turn: me }); }
    if (c === 'laser') { const cells = laser(i, e.shiftKey); st.cards = { ...st.cards, [me]: left }; fire(cells, 'лазер'); }
  }
  const onCell = ctx.mine && !m.done ? (i, e) => { if (card) { const c = card; card = null; useCard(c, i, e); } else fire([i]); } : null;
  const myLine = m.done ? (m.result.winner === me ? 'Все коты пойманы! Победа 🎉' : `${pname} поймал(а) всех твоих котов`) : ctx.mine ? 'Твой ход — целься в туман справа' : `${pname} целится…`;
  if (st.last && st.last.by !== me && !m.done) say.textContent = st.last.text;
  else if (st.skip === me && !ctx.mine) say.textContent = 'Ты в коробке — пропускаешь ход 📦';
  const cards = h('div', { className: 'kb-cards' }, ...(ctx.mine && !m.done ? myCards : []).map((c) => h('button', { className: 'kb-card', title: CARD[c].tip, onclick: (e) => {
    if (c === 'fish') {
      const left = [...myCards]; left.splice(left.indexOf(c), 1);
      const f = fish(foe, mine);
      if (f == null) return;
      save({ state: { cards: { ...st.cards, [me]: left }, marks: { ...st.marks, [me]: [...(st.marks?.[me] || []), { c: f, fish: true }] }, last: { by: me, text: `${nameOf(me)} подкупил(а) кота рыбкой 🐟` } }, turn: me });
      return;
    }
    card = card === c ? null : c;
    cards.querySelectorAll('.kb-card').forEach((b) => b.classList.toggle('on', b === e.currentTarget && card));
    say.textContent = card ? CARD[c].tip : '';
  } }, h('i', { textContent: CARD[c].icon }), h('span', { textContent: CARD[c].name }))));
  const left = foe.filter((c) => !c.cells.every((i) => mine.includes(i))).length;
  el.append(h('p', { className: 'gm-big', textContent: myLine }), say,
    h('div', { className: 'kb-boards' },
      h('div', {}, h('p', { className: 'gm-sub', textContent: 'твои коты' }), board({ cats: st.cats[me], shots: st.shots[partner], box: st.box[me], showBox: true })),
      h('div', { className: 'kb-foe' }, h('p', { className: 'gm-sub', textContent: `коты: ${pname} · осталось ${left} из 6` }),
        board({ cats: foe, shown: m.done ? foe : [], shots: mine, marks: st.marks?.[me] || [], fog: !m.done, onCell, box: st.box[partner], showBox: m.done || mine.includes(st.box[partner]) }), fx)),
    cards,
    m.done ? h('button', { className: 'gm-go', textContent: 'реванш!', onclick: () => ctx.again() }) : '');
}

export default {
  kind: 'cats', title: 'Котобой', emoji: '🐈',
  rules: 'Рассади шестерых котов разной формы и коробку-ловушку, ищи котов партнёра в тумане. Карточки: колокольчик, лазер, рыбка',
  start: (me, partner) => ({ turn: null, state: { cats: { [me]: null, [partner]: null }, box: {}, shots: { [me]: [], [partner]: [] }, cards: { [me]: ['bell'], [partner]: ['bell'] }, marks: {}, skip: null, last: null } }),
  myTurn: (m, me) => (setup(m) ? !m.state.cats[me] : m.turn === me),
  status: (m, me) => {
    if (m.done) return `победа: ${nameOf(m.result?.winner)}`;
    if (setup(m)) return 'рассаживаем котов';
    const foe = m.state.cats[m.players.find((p) => p !== me)], shots = m.state.shots[me];
    return `поймано ${foe.filter((c) => c.cells.every((i) => shots.includes(i))).length} из 6`;
  },
  render(el, ctx) {
    const { m, me } = ctx, st = m.state;
    el.classList.add('kb');
    if (setup(m)) {
      if (st.cats[me]) return el.append(h('p', { className: 'gm-big', textContent: `Коты на местах. ${ctx.pname} ещё рассаживает своих…` }), board({ cats: st.cats[me], box: st.box[me], showBox: true }));
      return placeView(el, ctx, st);
    }
    playView(el, ctx, st);
  },
};
