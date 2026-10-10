// «Тесты» в ноутбуке: вопрос дня (серия, архив), каталог (темы, поиск, «тебя ждут»), прохождение, итоги пары с раскрытием рядом.
// Хранилище дома: quiz/<тест>:<человек> = { test, user, answers, at }; quizask/<тест>:<кому> = { test, from, to, at };
// qday/<дата>:<человек> = { d, q, a, at }. Подсчёты — quizlogic.js, база — quizdb.js, спека — docs/specs/2026-10-10-quiz-deep-design.md.
// Ответ партнёра скрыт, пока не ответишь сам (только в интерфейсе: в облаке записи пары видны обоим).
import * as store from './store.js';
import { QUIZZES, TOPICS, QDAY } from './quizdb.js';
import { whoRows, typeResult, knowScore, knowTitle, pickScore, listRows, eveningScore, length, dayStr, prevDay, qdayIndex, qdayStreak } from './quizlogic.js';
import { toast } from './desktop.js';
import { pop, chime, tap, unfold } from './sound.js';
import { sticker, doodle } from './doodles.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return e; };
// рисунок и краска каждого теста (вместо эмодзи)
const ART = { 'who-chaos': ['chaos', '#a58bd1'], 'who-love': ['love', '#e0614f'], 'who-home': ['house', '#7fae6a'], 'who-food': ['pizza', '#e0614f'], 'who-trip': ['suitcase', '#3fa39a'],
  'type-dessert': ['cake', '#ef7f9b'], 'type-cat': ['cats', '#f08b46'], 'type-movie': ['film', '#e0614f'], 'type-weather': ['cloud', '#6fa8d6'], 'type-date': ['candle', '#a58bd1'],
  'know-taste': ['bowl', '#3fa39a'], 'know-habits': ['bed', '#4b6fb5'], 'know-dreams': ['star', '#e9a92f'], 'know-child': ['bear', '#f08b46'], 'know-us': ['hearts', '#ef7f9b'],
  'pick-cozy': ['tea', '#e0614f'], 'pick-date': ['ferris', '#6fa8d6'], 'list-done': ['check', '#7fae6a'], evening: ['garland', '#a58bd1'], 'know-prefs': ['coffee', '#4b6fb5'] };
const tone = (q) => ART[q.id]?.[1] || '#e9a92f';
export const qart = (q) => (ART[q.id] ? sticker(ART[q.id][0], ART[q.id][1]) : '');
const pic = (name, color = '#ef7f9b') => h('i', { className: 'pic', innerHTML: sticker(name, color) });
const PAL = ['#e0614f', '#6fa8d6', '#7fae6a', '#f08b46', '#a58bd1', '#ef7f9b', '#3fa39a', '#e9a92f'];
let stamped = null; // тест, который только что пройден: штамп ставится с анимацией
const KIND = { who: 'кто из нас', type: 'какой ты', know: 'знаешь ли', pick: 'это или то', list: 'чек-лист', evening: 'собери вечер' };
const UNIT = { who: 'утв.', list: 'пунктов', pick: 'раундов', evening: 'шагов' };
const meId = () => store.me()?.id;
const pName = () => store.partner()?.name || 'партнёр';
const doneOf = (test, user) => (user ? store.get('quiz', `${test}:${user}`) : null);
const asksToMe = () => store.all('quizask').filter((a) => a.to === meId() && !doneOf(a.test, meId()));
const nameOf = (id) => (id === 'both' ? 'оба' : id === meId() ? store.me().name : id ? pName() : '—'); // в итогах — имена, не «ты»: иначе «ты говоришь «ты»» путает
const plural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
// порядок вариантов в «какой ты» перемешан, но одинаково для обоих и при каждом открытии
const order = (q, i) => q.a.map((_, k) => k).sort((x, y) => ((x * 7 + i * 3) % 5) - ((y * 7 + i * 3) % 5));
const dayRec = (d, user) => (user ? store.get('qday', `${d}:${user}`) : null);
const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const rv = (el, i) => { el.classList.add('rv'); el.style.setProperty('--i', i); return el; }; // раскрытие по очереди

// несделанное из чек-листа — в план «Что мы ещё не успели» (создаётся сам)
function toPlans(texts) {
  const id = 'todo-together', uid = store.uid;
  const p = structuredClone(store.get('plans', id) || { title: 'Что мы ещё не успели', emoji: '✨', color: '#a99ad6', money: null, created: Date.now(),
    stages: [{ id: uid(), emoji: '📝', title: 'Хотим вместе', due: '', who: 'оба', notes: 'из теста «Что мы уже успели»', links: [], done: false, tasks: [] }] });
  const st = p.stages[0], have = new Set(p.stages.flatMap((s) => s.tasks.map((t) => t.text)));
  const add = texts.filter((t) => !have.has(t));
  st.tasks.push(...add.map((text) => ({ id: uid(), text, done: false })));
  store.put('plans', id, p).catch(console.warn);
  toast(add.length ? `В «Планах» +${add.length}: «Что мы ещё не успели»` : 'Это уже в «Планах»');
}

export function renderQuiz(el) {
  let view = 'list', tab = 'all', topic = null, query = '', run = null, arch = false, dayFresh = false;
  store.watch(el, ['quiz', 'quizask', 'qday'], () => { if (view !== 'run') draw(); });

  function draw() { el.replaceChildren(h('div', { className: 'qz' }, view === 'run' ? runView() : view === 'result' ? resultView(run.quiz) : listView())); }

  // ---------- вопрос дня ----------
  function dayView() {
    const me = meId(), p = store.partner(), today = dayStr(), qi = qdayIndex(today, QDAY.length), [text, opts] = QDAY[qi];
    const mine = dayRec(today, me), theirs = dayRec(today, p?.id);
    const both = (d) => !!(dayRec(d, me) && dayRec(d, p?.id));
    const streak = p ? qdayStreak(both, today) : 0;
    const fresh = dayFresh; dayFresh = false;
    const ans = (who, rec, hidden) => h('div', { className: 'ans' + (hidden ? ' back' : '') }, h('small', { textContent: who }), h('b', { textContent: hidden ? '?' : opts[rec.a] }));
    const same = mine && theirs && mine.a === theirs.a;
    const note = !p ? 'Вопрос станет общим, когда в дом войдёт вторая половинка'
      : !mine ? (theirs ? `${p.name}: ответ уже в конверте. Откроется после твоего` : `${p.name} пока не ответил(а). Отвечай первым(ой)`)
      : !theirs ? `${p.name} ещё не ответил(а): карточка перевернётся сама` : same ? 'Совпало!' : 'Не совпало, и это тоже интересно';
    const box = h('div', { className: 'qz-day' + (mine ? ' open' : '') + (same ? ' same' : '') + (fresh ? ' fresh' : '') },
      h('div', { className: 'day-head' }, h('b', { textContent: 'Вопрос дня' }),
        h('span', { className: 'streak', title: 'дней подряд, когда ответили оба' }, pic('flame', '#f08b46'), h('i', { className: fresh && both(today) ? 'bump' : '', textContent: streak }), ` ${plural(streak, ['день', 'дня', 'дней'])} подряд`)),
      h('p', { className: 'day-q', textContent: text }),
      mine ? h('div', { className: 'day-reveal' }, ans('ты', mine), ans(p?.name || 'партнёр', theirs, !theirs))
        : h('div', { className: 'day-opts' + (opts.length > 2 ? ' four' : '') }, ...opts.map((t, i) => h('button', { className: 'opt', textContent: t, onclick: () => answerDay(today, qi, i, theirs) }))),
      h('div', { className: 'day-foot' }, h('small', { className: 'day-note', textContent: note }),
        h('button', { className: 'day-arch', textContent: arch ? 'скрыть архив' : 'архив', onclick: () => { arch = !arch; draw(); } })),
      arch ? archive(me, p, today) : null);
    return box;
  }
  function answerDay(d, qi, a, theirs) {
    store.put('qday', `${d}:${meId()}`, { d, q: qi, a, at: Date.now() }).catch(console.warn);
    if (theirs) store.award('quiz', 'qday:' + d);
    unfold(.5); dayFresh = true; badge(); draw();
    if (theirs) setTimeout(chime, 600);
  }
  function archive(me, p, today) {
    const rows = [];
    for (let d = prevDay(today), k = 0; k < 30; k++, d = prevDay(d)) {
      const a = dayRec(d, me), b = dayRec(d, p?.id);
      if (!a && !b) continue;
      const [text, opts] = QDAY[(a || b).q] || QDAY[qdayIndex(d, QDAY.length)];
      rows.push(h('div', { className: 'arch-row' + (a && b && a.a === b.a ? ' same' : '') }, h('small', { textContent: fmtDay(d) }), h('b', { textContent: text }),
        h('span', { textContent: `ты: ${a ? opts[a.a] : '—'}` }), h('span', { textContent: `${p?.name || 'партнёр'}: ${b ? opts[b.a] : '—'}` })));
    }
    return h('div', { className: 'day-arch-list' }, rows.length ? rows : h('p', { className: 'qz-empty', textContent: 'Архив начнётся с завтрашнего дня' }));
  }

  // ---------- каталог и пройденные ----------
  function listView() {
    const me = meId(), done = QUIZZES.filter((q) => doneOf(q.id, me));
    const tabs = h('div', { className: 'qz-tabs' }, ...[['all', 'каталог'], ['done', `пройденные · ${done.length}`]].map(([k, t]) =>
      h('button', { className: tab === k ? 'on' : '', textContent: t, onclick: () => { tab = k; draw(); } })));
    const search = h('input', { className: 'qz-search', placeholder: 'найти тест…', value: query, oninput: (e) => { query = e.target.value; drawGrid(); } });
    const chips = h('div', { className: 'qz-chips' }, ...[[null, 'все'], ...Object.entries(TOPICS)].map(([k, t]) =>
      h('button', { className: topic === k ? 'on' : '', textContent: t, onclick: () => { topic = k; draw(); } })));
    const asks = asksToMe().map((a) => QUIZZES.find((q) => q.id === a.test)).filter(Boolean);
    const wait = tab === 'all' && asks.length ? h('div', { className: 'qz-wait' }, h('b', { textContent: `${pName()} зовёт пройти:` }), ...asks.map((q) => h('button', { onclick: () => start(q) }, h('i', { innerHTML: qart(q) }), q.title))) : null;
    const grid = h('div', { className: 'qz-grid' });
    const drawGrid = () => {
      const s = query.trim().toLowerCase();
      const list = (tab === 'done' ? done : QUIZZES).filter((q) => (!topic || q.topic === topic) && (!s || `${q.title} ${TOPICS[q.topic]} ${KIND[q.kind]}`.toLowerCase().includes(s)));
      grid.replaceChildren(...(list.length ? list.map(card) : [h('p', { className: 'qz-empty', textContent: tab === 'done' ? 'Пока ничего не пройдено — выбери тест в каталоге' : 'Ничего не нашлось' })]));
    };
    drawGrid();
    return [tab === 'all' ? dayView() : null, h('div', { className: 'qz-head' }, tabs, search), tab === 'all' ? chips : null, wait, grid];
  }

  function card(q) {
    const me = meId(), p = store.partner(), mine = doneOf(q.id, me), theirs = doneOf(q.id, p?.id);
    const asked = p && store.get('quizask', `${q.id}:${p.id}`);
    const canResult = mine && (q.kind === 'type' || theirs);
    const fresh = stamped === q.id && mine; if (fresh) { stamped = null; setTimeout(tap, 240, .5); }
    return h('div', { className: 'qz-card', style: `--c:${tone(q)}` },
      QUIZZES.indexOf(q) % 4 === 0 ? h('i', { className: 'clip', innerHTML: doodle('clip', { style: 'sticker' }) }) : null,
      h('span', { className: 'art', innerHTML: qart(q) }),
      mine ? h('i', { className: 'qz-stamp' + (fresh ? ' fresh' : ''), textContent: 'пройдено' }) : null,
      h('b', { textContent: q.title }),
      h('small', { textContent: `${KIND[q.kind]} · ${TOPICS[q.topic]} · ${length(q)} ${UNIT[q.kind] || 'вопр.'}` }),
      h('div', { className: 'qz-marks' }, h('span', { className: mine ? 'ok' : '', textContent: `ты ${mine ? '✓' : '—'}` }), p ? h('span', { className: theirs ? 'ok' : '', textContent: `${p.name} ${theirs ? '✓' : '…'}` }) : null),
      h('div', { className: 'qz-acts' },
        h('button', { className: 'qz-go', textContent: mine ? 'ещё раз' : 'пройти', onclick: () => start(q) }),
        canResult ? h('button', { textContent: 'итоги', onclick: () => { run = { quiz: q }; view = 'result'; draw(); } }) : null,
        p && !theirs ? h('button', { textContent: asked ? 'позвали ✓' : 'позвать', title: `позвать: ${p.name}`, disabled: !!asked, onclick: () => ask(q) }) : null));
  }

  function ask(q) {
    const p = store.partner(); if (!p) return;
    store.put('quizask', `${q.id}:${p.id}`, { test: q.id, from: meId(), to: p.id, at: Date.now() }).catch(console.warn);
    pop(); toast(`${p.name} увидит приглашение в «Тестах»`); draw();
  }

  // ---------- прохождение ----------
  function start(q) { run = { quiz: q, i: 0, answers: q.kind === 'list' ? q.items.map(() => 0) : [] }; view = 'run'; draw(); }
  function runView() {
    const q = run.quiz, n = q.kind === 'list' ? 1 : length(q), i = run.i;
    const head = h('div', { className: 'qz-runhead' },
      h('button', { className: 'qz-back', textContent: '← к тестам', onclick: () => { view = 'list'; draw(); } }),
      h('i', { className: 'pic', innerHTML: qart(q) }), h('b', { textContent: q.title }),
      h('span', { textContent: q.kind === 'list' ? `отмечено ${run.answers.filter(Boolean).length}` : `${i + 1} / ${n}` }));
    const bar = q.kind === 'list' ? null : h('div', { className: 'qz-bar' }, h('i', { style: `width:${(i / n) * 100}%` }));
    const next = (ans) => { run.answers[i] = ans; tap(.25); if (i + 1 < n) { run.i++; draw(); } else finish(); };
    const prev = i ? h('button', { className: 'qz-prev', textContent: '‹ назад', onclick: () => { run.i--; draw(); } }) : null;
    let body;
    if (q.kind === 'who') {
      body = [h('p', { className: 'qz-q', textContent: q.items[i] + '?' }),
        h('div', { className: 'qz-opts who' }, ...[['me', 'я'], ['you', pName()], ['both', 'оба']].map(([k, t]) => h('button', { className: run.answers[i] === k ? 'on' : '', textContent: t, onclick: () => next(k) })))];
    } else if (q.kind === 'type') {
      const x = q.questions[i];
      body = [h('p', { className: 'qz-q', textContent: x.q }),
        h('div', { className: 'qz-opts' }, ...order(x, i).map((k) => h('button', { className: run.answers[i] === k ? 'on' : '', textContent: x.a[k][0], onclick: () => next(k) })))];
    } else if (q.kind === 'pick') {
      const pair = q.pairs[i];
      body = [h('p', { className: 'qz-q small', textContent: 'Это или то?' }),
        h('div', { className: 'qz-pick' }, ...pair.map(([t, art], k) => h('button', { className: 'pk' + (run.answers[i] === k ? ' on' : ''), onclick: (e) => { e.currentTarget.classList.add('chosen'); setTimeout(() => next(k), 160); } },
          pic(art, PAL[(i * 2 + k) % PAL.length]), h('b', { textContent: t }))), h('i', { className: 'or', textContent: 'или' }))];
    } else if (q.kind === 'evening') {
      const st = q.steps[i];
      body = [h('p', { className: 'qz-q', textContent: st.q }),
        h('div', { className: 'qz-eve' }, ...st.a.map(([t, art], k) => h('button', { className: 'pk' + (run.answers[i] === k ? ' on' : ''), onclick: (e) => { e.currentTarget.classList.add('chosen'); setTimeout(() => next(k), 160); } },
          pic(art, PAL[(i + k * 3) % PAL.length]), h('b', { textContent: t })))),
        i ? h('div', { className: 'eve-so-far' }, h('small', { textContent: 'наш вечер:' }), ...run.answers.slice(0, i).map((a, s) => pic(q.steps[s].a[a][1], PAL[(s + a * 3) % PAL.length]))) : null];
    } else if (q.kind === 'list') {
      const done = () => finish();
      body = [h('p', { className: 'qz-q small', textContent: 'Отметь, что у вас уже было' }),
        h('div', { className: 'qz-list' }, ...q.items.map((t, k) => h('button', { className: 'li' + (run.answers[k] ? ' on' : ''), onclick: () => { run.answers[k] = run.answers[k] ? 0 : 1; tap(.2); draw(); } }, h('i', { className: 'box' }), h('span', { textContent: t })))),
        h('button', { className: 'qz-go big', textContent: 'готово', onclick: done })];
    } else body = knowAsk(q.questions[i], i, next);
    const deal = run.dealt !== i; run.dealt = i; // въезд карточки — только на новый вопрос, не на каждый клик внутри
    return [head, bar, h('div', { className: 'qz-ask' + (deal ? ' deal' : '') }, ...body), prev];
  }

  // «знаешь»: про себя + догадка о партнёре; вариант, шкала или порядок
  function knowAsk(x, i, next) {
    const cur = (run.answers[i] ||= {});
    const ready = () => cur.self != null && cur.guess != null && (!x.rank || (cur.self.length === x.rank.length && cur.guess.length === x.rank.length));
    const go = h('button', { className: 'qz-go big', textContent: 'дальше', disabled: !ready(), onclick: () => next(cur) });
    const field = (key) => {
      if (x.scale) {
        const r = h('input', { type: 'range', min: 0, max: 100, value: cur[key] ?? 50, className: 'qz-range' + (cur[key] == null ? ' untouched' : ''), oninput: () => { cur[key] = +r.value; r.classList.remove('untouched'); go.disabled = !ready(); } });
        return h('div', { className: 'qz-scale' }, h('span', { textContent: x.scale[0] }), r, h('span', { textContent: x.scale[1] }));
      }
      if (x.rank) {
        const list = (cur[key] ||= []);
        return h('div', { className: 'qz-rank' }, ...x.rank.map((t, k) => h('button', { className: list.includes(k) ? 'on' : '', onclick: () => { const at = list.indexOf(k); if (at >= 0) list.splice(at); else list.push(k); tap(.2); draw(); } },
          h('i', { textContent: list.includes(k) ? list.indexOf(k) + 1 : '' }), t)));
      }
      return h('div', { className: 'qz-opts' }, ...x.a.map((t, k) => h('button', { className: cur[key] === k ? 'on' : '', textContent: t, onclick: () => { cur[key] = k; if (ready()) next(cur); else draw(); } })));
    };
    const row = (key, label) => h('div', { className: 'qz-know' }, h('small', { textContent: label }), field(key));
    return [h('p', { className: 'qz-q', textContent: x.q }), x.rank ? h('p', { className: 'qz-hint', textContent: 'нажимай по порядку: первое — самое любимое' }) : null,
      row('self', 'про себя'), row('guess', `а что ответит ${pName()}?`), x.a ? null : go];
  }

  async function finish() {
    const q = run.quiz, me = meId(), p = store.partner();
    await store.put('quiz', `${q.id}:${me}`, { test: q.id, user: me, answers: run.answers, at: Date.now() }).catch(console.warn);
    if (store.get('quizask', `${q.id}:${me}`)) store.del('quizask', `${q.id}:${me}`).catch(console.warn);
    if (p && doneOf(q.id, p.id)) store.award('quiz', q.id);
    badge(); chime(); stamped = q.id; view = 'result'; draw();
  }

  // ---------- итоги: раскрытие рядом ----------
  function resultView(q) {
    const me = meId(), p = store.partner(), A = doneOf(q.id, me), B = doneOf(q.id, p?.id), pn = p?.name || 'партнёр';
    const head = h('div', { className: 'qz-runhead' }, h('button', { className: 'qz-back', textContent: '← к тестам', onclick: () => { view = 'list'; draw(); } }), h('i', { className: 'pic', innerHTML: qart(q) }), h('b', { textContent: q.title }), h('span'));
    const waitBox = () => h('div', { className: 'qz-waitbox' },
      h('p', { textContent: p ? `Твои ответы спрятаны в конверт. Итоги откроются, когда ${p.name} тоже пройдёт тест.` : 'Итоги откроются, когда в дом войдёт вторая половинка.' }),
      p && !store.get('quizask', `${q.id}:${p.id}`) ? h('button', { className: 'qz-go', textContent: 'позвать', onclick: () => ask(q) }) : p ? h('small', { textContent: 'приглашение отправлено ✓' }) : null);
    if (!A) return [head, h('p', { className: 'qz-empty', textContent: 'Сначала пройди тест сам(а).' })];
    const sum = (text, sub) => h('div', { className: 'qz-sum' }, h('b', { textContent: text }), sub ? h('small', { textContent: sub }) : null);

    if (q.kind === 'type') {
      const mine = q.results[typeResult(q, A.answers)], theirs = B && q.results[typeResult(q, B.answers)];
      const rcard = (who, r, i) => rv(h('div', { className: 'qz-res' }, h('small', { textContent: who }), h('i', { textContent: r.emoji }), h('b', { textContent: r.title }), h('p', { textContent: r.text })), i * 4);
      return [head, h('div', { className: 'qz-pair' }, rcard('ты', mine, 0), theirs ? rcard(pn, theirs, 1) : waitBox()),
        theirs ? sum(mine === theirs ? `Вы оба — ${mine.title.toLowerCase()}. Идеальная пара!` : `Вместе вы — ${mine.title.toLowerCase()} и ${theirs.title.toLowerCase()}`) : null];
    }
    if (!B) return [head, waitBox()];
    if (q.kind === 'who') {
      const r = whoRows(q, A, B);
      return [head, sum(`Согласны в ${r.agreed} из ${r.rows.length}`, `${r.pct}% совпадений`),
        h('div', { className: 'qz-rows' }, ...r.rows.map((x, i) => rv(h('div', { className: 'qz-row' + (x.agree ? ' ok' : ' no') },
          h('b', { textContent: x.text }),
          h('span', { textContent: x.agree ? `✓ ${nameOf(x.a)}` : `спорно: ты — ${nameOf(x.a)}, ${pn} — ${nameOf(x.b)}` })), i)))];
    }
    if (q.kind === 'pick') {
      const r = pickScore(q, A, B);
      return [head, sum(`Совпало ${r.same} из ${r.total}`, r.title),
        h('div', { className: 'qz-rows pick' }, ...r.rows.map((x, i) => rv(h('div', { className: 'qz-prow' + (x.same ? ' ok' : '') },
          ...x.p.map(([t, art], k) => h('div', { className: 'side' + (x.a === k || x.b === k ? ' got' : '') }, pic(art, PAL[(i * 2 + k) % PAL.length]), h('b', { textContent: t }),
            h('small', { textContent: [x.a === k ? 'ты' : null, x.b === k ? pn : null].filter(Boolean).join(' и ') || ' ' })))), i)))];
    }
    if (q.kind === 'list') {
      const r = listRows(q, A, B);
      const chipList = (rows) => h('div', { className: 'qz-chiplist' }, ...rows.map((x, i) => rv(h('span', { textContent: x.text }), i)));
      return [head, sum(`Успели вместе ${r.both.length} из ${r.rows.length}`, r.neither.length ? `ещё ${r.neither.length} ${plural(r.neither.length, ['дело', 'дела', 'дел'])} впереди` : 'вы успели всё!'), h('div', { className: 'qz-col' },
        r.both.length ? [h('h4', { className: 'qz-h', textContent: 'Было у нас' }), chipList(r.both)] : null,
        r.differ.length ? [h('h4', { className: 'qz-h', textContent: 'Помните по-разному' }), h('div', { className: 'qz-rows' }, ...r.differ.map((x, i) => rv(h('div', { className: 'qz-row no' },
          h('b', { textContent: x.text }), h('span', { textContent: x.a ? `ты помнишь, ${pn} — нет` : `${pn} помнит, ты — нет` })), i)))] : null,
        r.neither.length ? [h('h4', { className: 'qz-h', textContent: 'Ещё не успели' }),
          h('div', { className: 'qz-rows' }, ...r.neither.map((x, i) => rv(h('div', { className: 'qz-row todo' }, h('b', { textContent: x.text }), h('button', { textContent: 'в планы', onclick: () => toPlans([x.text]) })), i))),
          h('button', { className: 'qz-go big', textContent: 'всё в планы', onclick: () => toPlans(r.neither.map((x) => x.text)) })] : null)];
    }
    if (q.kind === 'evening') {
      const r = eveningScore(q, A, B);
      const postcard = (who, ans, k) => rv(h('div', { className: 'eve-card' }, h('small', { textContent: who }),
        h('div', { className: 'eve-collage' }, ...q.steps.map((s, i) => h('div', { className: 'eve-it' + (r.rows[i].same ? ' same' : '') }, pic(s.a[ans[i]][1], PAL[(i + ans[i] * 3) % PAL.length]), h('span', { textContent: s.a[ans[i]][0] }))))), k * 3);
      return [head, sum(`Совпало ${r.same} из ${r.total}`, r.same >= 4 ? 'вы мечтаете об одном и том же' : r.same >= 2 ? 'есть из чего собрать общий вечер' : 'устройте два вечера: сначала твой, потом второй'),
        h('div', { className: 'qz-pair' }, postcard('вечер мечты: ты', A.answers, 0), postcard(`вечер мечты: ${pn}`, B.answers, 1))];
    }
    const k = knowScore(q, A, B);
    const show = (x, v) => (v == null ? '—' : x.scale ? `${v} из 100` : x.rank ? v.map((j) => x.rank[j]).join(' → ') : x.a[v]);
    return [head, h('div', { className: 'qz-pair score' }, rv(sum(`Ты угадал(а) ${k.mine} из ${k.total}`, knowTitle(k.mine, k.total)), 0), rv(sum(`${pn}: ${k.theirs} из ${k.total}`, knowTitle(k.theirs, k.total)), 2)),
      h('div', { className: 'qz-rows' }, ...k.rows.map((x, i) => rv(h('div', { className: 'qz-row' + (x.myOk && x.theirOk ? ' ok' : '') },
        h('b', { textContent: x.q }),
        x.x.scale ? h('div', { className: 'qz-scalebar' }, h('span', { textContent: x.x.scale[0] }), h('div', {}, ...[[x.a.self, 'ты', 'a'], [x.b.guess, `${pn} думал(а)`, 'b2'], [x.b.self, pn, 'b'], [x.a.guess, 'твоя догадка', 'a2']].map(([v, t, c]) => h('i', { className: c, style: `left:${v ?? 50}%`, title: `${t}: ${v}` }))), h('span', { textContent: x.x.scale[1] })) : null,
        h('span', { textContent: `ты: ${show(x.x, x.a.self)} · ${pn} думает: ${show(x.x, x.b.guess)} ${x.theirOk ? '✓' : '✗'}` }),
        h('span', { textContent: `${pn}: ${show(x.x, x.b.self)} · ты думаешь: ${show(x.x, x.a.guess)} ${x.myOk ? '✓' : '✗'}` })), i)))];
  }

  draw();
}

// счётчик на иконке «Тесты»: приглашения + вопрос дня, на который партнёр уже ответил
const born = Date.now();
let greeted = false;
const dayWaiting = () => { const p = store.partner(), d = dayStr(); return !!(p && dayRec(d, p.id) && !dayRec(d, meId())); };
// зовёт и desktop.js при открытии ноутбука: при загрузке хранилище может ещё не успеть
export function badge() {
  const n = meId() ? asksToMe().length + (dayWaiting() ? 1 : 0) : 0;
  document.querySelectorAll('[data-app=quiz]').forEach((b) => (n ? b.setAttribute('data-n', n) : b.removeAttribute('data-n')));
  if (n && !greeted && !document.querySelector('.qz')) { greeted = true; toast(dayWaiting() && !asksToMe().length ? `${pName()} уже ответил(а) на вопрос дня. Твоя очередь, он в «Тестах»` : `${pName()} ждёт тебя в «Тестах» в ноутбуке`, 6000); }
}
store.on('quizask', (id) => {
  badge();
  const a = store.get('quizask', id), q = a && QUIZZES.find((x) => x.id === a.test);
  if (q && a.to === meId() && a.at > born) toast(`${pName()} зовёт пройти тест «${q.title}» — в ноутбуке, «Тесты»`, 6000);
});
store.on('qday', (id) => {
  badge();
  const r = store.get('qday', id);
  if (r && r.at > born && !id.endsWith(':' + meId()) && !document.querySelector('.qz-day')) toast(`${pName()} ответил(а) на вопрос дня — открой «Тесты»`, 5000);
});
store.on('quiz', badge);
store.onPeople(badge);
