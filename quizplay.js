// «Тесты» по образцу сайтов тестов: экран старта, прохождение и итоги форматов «кто ты из» (с фото), турнир, тирлист, викторина.
// Пакеты — quizpacks/<id>.js (грузятся при открытии теста), фото — public/quiz/<ключ>.webp, авторы — public/quiz/credits.json.
// Состояние прохождения и переходы — в quiz.js; сюда приходят run и ctx { next, finish, draw, pn, waitBox, sum }.
import { FORMATS, RUBRICS } from './quizdb.js';
import { typeResult, typePercents, typeSame, seeded, cupPlay, cupScore, tierScore, triviaPair, triviaRight, knowTitle, length } from './quizlogic.js';
import { tap, pop } from './sound.js';

export const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return e; };
// порядок вариантов перемешан, но одинаково для обоих и при каждом открытии
export const order = (x, i) => x.a.map((_, k) => k).sort((p, q) => ((p * 7 + i * 3) % 5) - ((q * 7 + i * 3) % 5));
const rv = (el, i) => { el.classList.add('rv'); el.style.setProperty('--i', i); return el; };

// ---------- пакеты и фото ----------
const PACKS = import.meta.glob('./quizpacks/*.js');
export const isNew = (q) => !!q.cover;
export const fmt = (q) => (FORMATS[q.kind] && q.kind !== 'pair' ? q.kind : 'pair');
export async function loadQuiz(meta) {
  if (!isNew(meta)) return meta;
  const pack = (await PACKS[`./quizpacks/${meta.id}.js`]()).default;
  return { ...meta, ...pack };
}
let CR = null, crp = null;
export const credits = () => (crp ||= fetch('/quiz/credits.json').then((r) => r.json()).then((j) => (CR = j)).catch(() => (CR = {})));
const short = (s) => (s.length > 42 ? s.slice(0, 40) + '…' : s);
export function photo(key, cls = '') {
  const c = CR?.[key];
  return h('figure', { className: 'qph ' + cls },
    h('img', { src: `/quiz/${key}.webp`, alt: c?.title || '', loading: 'lazy', decoding: 'async', width: 640, height: 480, draggable: false }),
    c ? h('figcaption', {}, h('a', { href: c.src, target: '_blank', rel: 'noopener', textContent: `фото: ${short(c.by)} · ${c.lic}`, onclick: (e) => e.stopPropagation() })) : null);
}
export const fanNote = (q) => (q.fan ? h('small', { className: 'qz-fan', textContent: `фан-тест по вселенной «${q.fan}», не связан с правообладателем` }) : null);
const plural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
// подпись размера на карточке: «12 вопросов», «16 фото», «20 фото»
export function size(q) {
  const n = q.n ?? length(q);
  return q.kind === 'cup' ? `${n + 1} фото` : q.kind === 'tier' ? `${n} фото` : `${n} ${plural(n, ['вопрос', 'вопроса', 'вопросов'])}`;
}

// ---------- экран старта ----------
export function introView(q, go) {
  return h('div', { className: 'qz-intro' }, photo(q.cover, 'cover'),
    h('div', { className: 'qz-intro-t' },
      h('span', { className: 'qz-dymo', textContent: FORMATS[fmt(q)] }), h('b', { textContent: q.title }), h('p', { textContent: q.desc }),
      h('small', { className: 'qz-meta', textContent: `${RUBRICS[q.rubric]} · ${size(q)}` }), fanNote(q),
      h('button', { className: 'qz-go big', textContent: 'Поехали!', onclick: go })));
}

// ---------- прохождение ----------
const CUPROUND = { 16: '1/8 финала', 8: 'четвертьфинал', 4: 'полуфинал', 2: 'финал' };
export const TIERS = [['топ', '#e0614f'], ['норм', '#e9a92f'], ['так себе', '#6fa8d6'], ['мимо', '#9a8f9c']];
export const cupOrder = (q) => seeded(q.items.length, q.id);

export function runNew(q, run, ctx) {
  const i = run.i;
  if (q.kind === 'type') {
    const x = q.questions[i];
    return [h('div', { className: 'qz-qrow' + (x.img ? ' has' : '') }, x.img ? photo(x.img, 'qimg') : null,
      h('div', { className: 'qz-qside' }, h('p', { className: 'qz-q', textContent: x.q }),
        h('div', { className: 'qz-opts list' }, ...order(x, i).map((k) => h('button', { className: run.answers[i] === k ? 'on' : '', textContent: x.a[k][0], onclick: () => ctx.next(k) })))))];
  }
  if (q.kind === 'cup') {
    const st = cupPlay(cupOrder(q), run.answers);
    return [h('p', { className: 'qz-q small', textContent: CUPROUND[st.size] || '' }),
      h('div', { className: 'qz-cup' }, ...st.cur.map((k) => h('button', { className: 'cupk', onclick: (e) => { e.currentTarget.classList.add('chosen'); run.answers.length = i; setTimeout(() => ctx.next(k), 220); } },
        photo(q.items[k].img), h('b', { textContent: q.items[k].t }))), h('i', { className: 'or', textContent: 'или' }))];
  }
  if (q.kind === 'trivia') {
    const x = q.questions[i], got = run.answers[i], shown = run.shown === i;
    return [h('div', { className: 'qz-qrow' + (x.img ? ' has' : '') }, x.img ? photo(x.img, 'qimg') : null,
      h('div', { className: 'qz-qside' }, h('p', { className: 'qz-q', textContent: x.q }),
        h('div', { className: 'qz-opts list' }, ...order(x, i + 1).map((k) => h('button', {
          className: shown ? (k === x.ok ? 'right' : k === got ? 'wrong' : 'dim') : '', disabled: shown, textContent: x.a[k],
          onclick: () => { run.answers[i] = k; run.shown = i; (k === x.ok ? pop : tap)(.4); ctx.draw(); } }))),
        shown ? h('div', { className: 'qz-verdict ' + (got === x.ok ? 'ok' : 'no') }, h('b', { textContent: got === x.ok ? 'Верно!' : 'Мимо' }),
          h('button', { className: 'qz-go', textContent: i + 1 < q.questions.length ? 'дальше' : 'итоги', onclick: () => { run.shown = -1; ctx.next(got); } })) : null))];
  }
  if (q.kind === 'tier') return tierRun(q, run, ctx);
}

// тирлист: лента нерасставленных сверху, полки ниже; фото — нажать и выбрать полку, или перетащить
function tierRun(q, run, ctx) {
  const ans = run.answers, place = (k, t) => { ans[k] = t; run.sel = null; tap(.25); ctx.draw(); };
  const tile = (k) => h('button', { className: 'tile' + (run.sel === k ? ' sel' : ''), title: q.items[k].t, onpointerdown: (e) => drag(e, k),
    // выбрано другое фото, а нажали на фото на полке — значит, кладём выбранное на эту полку (клик уходит полке)
    onclick: (e) => { if (run.sel != null && run.sel !== k && ans[k] != null) return; e.stopPropagation(); run.sel = run.sel === k ? null : k; ctx.draw(); } },
    h('img', { src: `/quiz/${q.items[k].img}.webp`, alt: '', loading: 'lazy', decoding: 'async', draggable: false }), h('span', { textContent: q.items[k].t }));
  const left = q.items.map((_, k) => k).filter((k) => ans[k] == null);
  const shelves = TIERS.map(([name, c], t) => h('div', { className: 'shelf', style: `--c:${c}`, onclick: () => run.sel != null && place(run.sel, t) },
    h('b', { textContent: name }), h('div', { className: 'row' }, ...q.items.map((_, k) => k).filter((k) => ans[k] === t).map(tile))));
  shelves.forEach((s, t) => (s.dataset.t = t));
  // перетаскивание: тянем копию, отпускаем над полкой (короткое нажатие остаётся кликом)
  function drag(e, k) {
    const from = e.currentTarget, x0 = e.clientX, y0 = e.clientY; let ghost = null;
    const move = (m) => {
      if (!ghost && Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
      if (!ghost) { ghost = from.cloneNode(true); ghost.classList.add('ghost'); document.body.append(ghost); from.classList.add('lift'); }
      ghost.style.transform = `translate(${m.clientX - 40}px, ${m.clientY - 40}px) rotate(-4deg)`;
    };
    const up = (u) => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (!ghost) return;
      ghost.remove(); from.classList.remove('lift');
      const s = document.elementFromPoint(u.clientX, u.clientY)?.closest('.shelf');
      from.addEventListener('click', (c) => c.stopImmediatePropagation(), { capture: true, once: true });
      if (s) place(k, +s.dataset.t); else if (u.target.closest?.('.tier-pool')) { delete ans[k]; ctx.draw(); }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
  return [h('p', { className: 'qz-q small', textContent: left.length ? 'Разложи по полкам' : 'Всё разложено!' }),
    h('div', { className: 'tier-pool' }, left.length ? left.map(tile) : h('button', { className: 'qz-go big', textContent: 'готово', onclick: ctx.finish })),
    h('div', { className: 'tier-board' }, shelves),
    h('small', { className: 'qz-hint', textContent: 'нажми на фото, потом на полку, или перетащи' })];
}

// ---------- итоги ----------
function board(q, ans, who) {
  return h('div', { className: 'tier-board mini' }, who ? h('small', { className: 'qz-dymo', textContent: who }) : null,
    ...TIERS.map(([name, c], t) => h('div', { className: 'shelf', style: `--c:${c}` }, h('b', { textContent: name }),
      h('div', { className: 'row' }, ...q.items.map((x, k) => (ans[k] === t ? h('i', { title: x.t }, h('img', { src: `/quiz/${x.img}.webp`, alt: x.t, loading: 'lazy' })) : null))))));
}
const hero = (who, r, i) => rv(h('div', { className: 'qz-hero' }, photo(r.img), h('small', { textContent: who }), h('b', { textContent: r.title }), h('p', { textContent: r.text })), i);

export function resultNew(q, A, B, ctx) {
  const pn = ctx.pn, wait = B ? null : ctx.waitBox();
  if (q.kind === 'type') {
    const mine = q.results[typeResult(q, A.answers)], bars = typePercents(q, A.answers);
    const bar = h('div', { className: 'qz-bars' }, h('h4', { className: 'qz-h', textContent: 'на кого ты похож(а)' }),
      ...bars.map((b, i) => rv(h('div', { className: 'bar' }, h('span', { textContent: q.results[b.key].title }), h('i', {}, h('u', { style: `width:${b.pct}%` })), h('em', { textContent: b.pct + '%' })), i)));
    if (!B) return [h('div', { className: 'qz-pair' }, hero('ты', mine, 0), wait), fanNote(q), bar];
    const theirs = q.results[typeResult(q, B.answers)];
    return [h('div', { className: 'qz-pair' }, hero('ты', mine, 0), hero(pn, theirs, 3)),
      ctx.sum(mine === theirs ? `Вы оба — ${mine.title}` : `Вместе вы — ${mine.title} и ${theirs.title}`, `ответили одинаково ${typeSame(q, A, B)} из ${q.questions.length}`), fanNote(q), bar];
  }
  if (q.kind === 'cup') {
    const ord = cupOrder(q), s = cupScore(q, ord, A, B), fin = cupPlay(ord, A.answers.slice(0, -1)).cur || [];
    const champ = (who, k, i) => rv(h('div', { className: 'qz-hero champ' }, photo(q.items[k].img), h('small', { textContent: who }), h('b', { textContent: q.items[k].t })), i);
    if (!B) {
      const second = fin.find((k) => k !== s.a.champ);
      return [h('div', { className: 'qz-pair' }, champ('твой победитель', s.a.champ, 0), wait), second != null ? ctx.sum(`В финале проиграл: ${q.items[second].t}`) : null];
    }
    return [h('div', { className: 'qz-pair' }, champ('победитель: ты', s.a.champ, 0), champ(`победитель: ${pn}`, s.b.champ, 3)),
      ctx.sum(s.a.champ === s.b.champ ? 'Один и тот же победитель!' : 'Победители разные', `в первом круге сошлись ${s.first} из ${s.half}`),
      h('h4', { className: 'qz-h', textContent: 'ваш общий топ' }),
      h('div', { className: 'qz-top3' }, ...s.top.map((k, i) => rv(h('div', {}, h('em', { textContent: i + 1 }), photo(q.items[k].img), h('b', { textContent: q.items[k].t })), i + 4)))];
  }
  if (q.kind === 'tier') {
    if (!B) return [wait, board(q, A.answers, 'твоя доска')];
    const t = tierScore(q, A, B);
    return [ctx.sum(`На одной полке ${t.same} из ${t.total}`, t.hot.length ? `горячих споров: ${t.hot.length}` : 'ни одного серьёзного спора'),
      t.hot.length ? [h('h4', { className: 'qz-h', textContent: 'горячие споры' }), h('div', { className: 'qz-rows' }, ...t.hot.map((r, i) => rv(h('div', { className: 'qz-row no hot' },
        h('img', { src: `/quiz/${q.items[r.i].img}.webp`, alt: '' }), h('b', { textContent: r.t }), h('span', { textContent: `ты: ${TIERS[r.a][0]} · ${pn}: ${TIERS[r.b][0]}` })), i)))] : null,
      h('div', { className: 'qz-pair' }, board(q, A.answers, 'ты'), board(q, B.answers, pn))];
  }
  if (q.kind === 'trivia') {
    const me = triviaRight(q, A.answers), n = q.questions.length;
    if (!B) return [ctx.sum(`${me} из ${n}`, knowTitle(me, n)), wait];
    const t = triviaPair(q, A, B);
    return [h('div', { className: 'qz-pair score' }, rv(ctx.sum(`Ты: ${t.mine} из ${n}`, knowTitle(t.mine, n)), 0), rv(ctx.sum(`${pn}: ${t.theirs} из ${n}`, knowTitle(t.theirs, n)), 2)),
      ctx.sum(t.mine === t.theirs ? 'Ничья!' : `Знает лучше: ${t.mine > t.theirs ? 'ты' : pn}`),
      h('div', { className: 'qz-rows' }, ...t.rows.map((r, i) => rv(h('div', { className: 'qz-row' + (r.a === r.q.ok && r.b === r.q.ok ? ' ok' : '') },
        h('b', { textContent: r.q.q }), h('span', { textContent: `ответ: ${r.q.a[r.q.ok]}` }),
        h('span', { textContent: `ты: ${r.q.a[r.a] ?? '—'} ${r.a === r.q.ok ? '✓' : '✗'} · ${pn}: ${r.q.a[r.b] ?? '—'} ${r.b === r.q.ok ? '✓' : '✗'}` })), i)))];
  }
}

// ---------- авторы фото ----------
export function creditsView() {
  const rows = Object.entries(CR || {});
  return [h('p', { className: 'qz-hint', textContent: 'Все фото в тестах — со свободными лицензиями (CC0, общественное достояние, CC BY, CC BY-SA). Фото уменьшены и кадрированы. Герои вселенных упоминаются только текстом.' }),
    h('div', { className: 'qz-credits' }, ...rows.map(([k, c]) => h('a', { href: c.src, target: '_blank', rel: 'noopener' },
      h('img', { src: `/quiz/${k}.webp`, alt: '', loading: 'lazy' }), h('span', {}, h('b', { textContent: c.title || k }), h('small', { textContent: `${short(c.by)} · ${c.lic}` })))))];
}
