// «Тесты» в ноутбуке: каталог (темы, поиск, «тебя ждут»), пройденные, прохождение по вопросу, итоги пары.
// Хранилище дома: quiz/<тест>:<человек> = { test, user, answers, at }; quizask/<тест>:<кому> = { test, from, to, at }.
// Подсчёты — quizlogic.js, база — quizdb.js. Стиль — бумага и чернила, классы qz-.
import * as store from './store.js';
import { QUIZZES, TOPICS } from './quizdb.js';
import { whoRows, typeResult, knowScore, length } from './quizlogic.js';
import { toast } from './desktop.js';
import { pop, chime } from './sound.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.flat().filter((k) => k != null && k !== false)); return e; };
const KIND = { who: 'кто из нас', type: 'какой ты', know: 'знаешь ли' };
const meId = () => store.me()?.id;
const pName = () => store.partner()?.name || 'партнёр';
const doneOf = (test, user) => (user ? store.get('quiz', `${test}:${user}`) : null);
const asksToMe = () => store.all('quizask').filter((a) => a.to === meId() && !doneOf(a.test, meId()));
const nameOf = (id) => (id === 'both' ? 'оба' : id === meId() ? store.me().name : id ? pName() : '—'); // в итогах — имена, не «ты»: иначе «ты говоришь «ты»» путает
// порядок вариантов в «какой ты» перемешан, но одинаково для обоих и при каждом открытии
const order = (q, i) => q.a.map((_, k) => k).sort((x, y) => ((x * 7 + i * 3) % 5) - ((y * 7 + i * 3) % 5));

export function renderQuiz(el) {
  let view = 'list', tab = 'all', topic = null, query = '', run = null;
  store.watch(el, ['quiz', 'quizask'], () => { if (view !== 'run') draw(); });

  function draw() { el.replaceChildren(h('div', { className: 'qz' }, view === 'run' ? runView() : view === 'result' ? resultView(run.quiz) : listView())); }

  // ---------- каталог и пройденные ----------
  function listView() {
    const me = meId(), done = QUIZZES.filter((q) => doneOf(q.id, me));
    const tabs = h('div', { className: 'qz-tabs' }, ...[['all', 'каталог'], ['done', `пройденные · ${done.length}`]].map(([k, t]) =>
      h('button', { className: tab === k ? 'on' : '', textContent: t, onclick: () => { tab = k; draw(); } })));
    const search = h('input', { className: 'qz-search', placeholder: 'найти тест…', value: query, oninput: (e) => { query = e.target.value; drawGrid(); } });
    const chips = h('div', { className: 'qz-chips' }, ...[[null, 'все'], ...Object.entries(TOPICS)].map(([k, t]) =>
      h('button', { className: topic === k ? 'on' : '', textContent: t, onclick: () => { topic = k; draw(); } })));
    const asks = asksToMe().map((a) => QUIZZES.find((q) => q.id === a.test)).filter(Boolean);
    const wait = tab === 'all' && asks.length ? h('div', { className: 'qz-wait' }, h('b', { textContent: `${pName()} зовёт пройти:` }), ...asks.map((q) => h('button', { textContent: `${q.emoji} ${q.title}`, onclick: () => start(q) }))) : null;
    const grid = h('div', { className: 'qz-grid' });
    const drawGrid = () => {
      const s = query.trim().toLowerCase();
      const list = (tab === 'done' ? done : QUIZZES).filter((q) => (!topic || q.topic === topic) && (!s || `${q.title} ${TOPICS[q.topic]} ${KIND[q.kind]}`.toLowerCase().includes(s)));
      grid.replaceChildren(...(list.length ? list.map(card) : [h('p', { className: 'qz-empty', textContent: tab === 'done' ? 'Пока ничего не пройдено — выбери тест в каталоге' : 'Ничего не нашлось' })]));
    };
    drawGrid();
    return [h('div', { className: 'qz-head' }, tabs, search), tab === 'all' ? chips : null, wait, grid];
  }

  function card(q) {
    const me = meId(), p = store.partner(), mine = doneOf(q.id, me), theirs = doneOf(q.id, p?.id);
    const asked = p && store.get('quizask', `${q.id}:${p.id}`);
    const canResult = mine && (q.kind === 'type' || theirs);
    return h('div', { className: 'qz-card' },
      h('i', { textContent: q.emoji }),
      h('b', { textContent: q.title }),
      h('small', { textContent: `${KIND[q.kind]} · ${TOPICS[q.topic]} · ${length(q)} ${q.kind === 'who' ? 'утв.' : 'вопр.'}` }),
      h('div', { className: 'qz-marks' }, h('span', { className: mine ? 'ok' : '', textContent: `ты ${mine ? '✓' : '—'}` }), p ? h('span', { className: theirs ? 'ok' : '', textContent: `${p.name} ${theirs ? '✓' : '⏳'}` }) : null),
      h('div', { className: 'qz-acts' },
        h('button', { className: 'qz-go', textContent: mine ? 'ещё раз' : 'пройти', onclick: () => start(q) }),
        canResult ? h('button', { textContent: 'итоги', onclick: () => { run = { quiz: q }; view = 'result'; draw(); } }) : null,
        p && !theirs ? h('button', { textContent: asked ? 'позвали ✓' : 'позвать 💌', title: `позвать: ${p.name}`, disabled: !!asked, onclick: () => ask(q) }) : null));
  }

  function ask(q) {
    const p = store.partner(); if (!p) return;
    store.put('quizask', `${q.id}:${p.id}`, { test: q.id, from: meId(), to: p.id, at: Date.now() }).catch(console.warn);
    pop(); toast(`${p.name} увидит приглашение в «Тестах» 💌`); draw();
  }

  // ---------- прохождение ----------
  function start(q) { run = { quiz: q, i: 0, answers: [] }; view = 'run'; draw(); }
  function runView() {
    const q = run.quiz, n = length(q), i = run.i;
    const head = h('div', { className: 'qz-runhead' },
      h('button', { className: 'qz-back', textContent: '← к тестам', onclick: () => { view = 'list'; draw(); } }),
      h('b', { textContent: `${q.emoji} ${q.title}` }),
      h('span', { textContent: `${i + 1} / ${n}` }));
    const bar = h('div', { className: 'qz-bar' }, h('i', { style: `width:${(i / n) * 100}%` }));
    const next = (ans) => { run.answers[i] = ans; pop(); if (i + 1 < n) { run.i++; draw(); } else finish(); };
    const prev = i ? h('button', { className: 'qz-prev', textContent: '‹ назад', onclick: () => { run.i--; draw(); } }) : null;
    let body;
    if (q.kind === 'who') {
      body = [h('p', { className: 'qz-q', textContent: q.items[i] + '?' }),
        h('div', { className: 'qz-opts who' }, ...[['me', 'я'], ['you', pName()], ['both', 'оба']].map(([k, t]) => h('button', { className: run.answers[i] === k ? 'on' : '', textContent: t, onclick: () => next(k) })))];
    } else if (q.kind === 'type') {
      const x = q.questions[i];
      body = [h('p', { className: 'qz-q', textContent: x.q }),
        h('div', { className: 'qz-opts' }, ...order(x, i).map((k) => h('button', { className: run.answers[i] === k ? 'on' : '', textContent: x.a[k][0], onclick: () => next(k) })))];
    } else {
      const x = q.questions[i], cur = (run.answers[i] ||= {});
      const row = (key, label) => h('div', { className: 'qz-know' }, h('small', { textContent: label }),
        h('div', { className: 'qz-opts' }, ...x.a.map((t, k) => h('button', { className: cur[key] === k ? 'on' : '', textContent: t, onclick: () => { cur[key] = k; if (cur.self != null && cur.guess != null) next(cur); else draw(); } }))));
      body = [h('p', { className: 'qz-q', textContent: x.q }), row('self', 'про себя'), row('guess', `а что выберет ${pName()}?`)];
    }
    return [head, bar, h('div', { className: 'qz-ask' }, ...body), prev];
  }

  async function finish() {
    const q = run.quiz, me = meId(), p = store.partner();
    await store.put('quiz', `${q.id}:${me}`, { test: q.id, user: me, answers: run.answers, at: Date.now() }).catch(console.warn);
    if (store.get('quizask', `${q.id}:${me}`)) store.del('quizask', `${q.id}:${me}`).catch(console.warn);
    if (p && doneOf(q.id, p.id)) store.award('quiz', q.id);
    badge(); chime(); view = 'result'; draw();
  }

  // ---------- итоги ----------
  function resultView(q) {
    const me = meId(), p = store.partner(), A = doneOf(q.id, me), B = doneOf(q.id, p?.id);
    const head = h('div', { className: 'qz-runhead' }, h('button', { className: 'qz-back', textContent: '← к тестам', onclick: () => { view = 'list'; draw(); } }), h('b', { textContent: `${q.emoji} ${q.title}` }), h('span'));
    const waitBox = () => h('div', { className: 'qz-waitbox' },
      h('p', { textContent: p ? `Итоги откроются, когда ${p.name} тоже пройдёт этот тест.` : 'Итоги откроются, когда в дом войдёт вторая половинка.' }),
      p && !store.get('quizask', `${q.id}:${p.id}`) ? h('button', { className: 'qz-go', textContent: 'позвать 💌', onclick: () => ask(q) }) : p ? h('small', { textContent: 'приглашение отправлено ✓' }) : null);
    if (!A) return [head, h('p', { className: 'qz-empty', textContent: 'Сначала пройди тест сам(а).' })];

    if (q.kind === 'type') {
      const mine = q.results[typeResult(q, A.answers)], theirs = B && q.results[typeResult(q, B.answers)];
      const rcard = (who, r) => h('div', { className: 'qz-res' }, h('small', { textContent: who }), h('i', { textContent: r.emoji }), h('b', { textContent: r.title }), h('p', { textContent: r.text }));
      return [head, h('div', { className: 'qz-pair' }, rcard('ты', mine), theirs ? rcard(p.name, theirs) : waitBox()),
        theirs ? h('p', { className: 'qz-sum', textContent: mine === theirs ? `Вы оба — ${mine.title.toLowerCase()}. Идеальная пара!` : `Вместе вы — ${mine.title.toLowerCase()} и ${theirs.title.toLowerCase()}.` }) : null];
    }
    if (!B) return [head, waitBox()];
    if (q.kind === 'who') {
      const r = whoRows(q, A, B);
      return [head, h('p', { className: 'qz-sum', textContent: `Согласны в ${r.agreed} из ${r.rows.length} — ${r.pct}%` }),
        h('div', { className: 'qz-rows' }, ...r.rows.map((x) => h('div', { className: 'qz-row' + (x.agree ? ' ok' : ' no') },
          h('b', { textContent: x.text }),
          h('span', { textContent: x.agree ? `✓ ${nameOf(x.a)}` : `спорно — ты: ${nameOf(x.a)}, ${p.name}: ${nameOf(x.b)}` }))))];
    }
    const k = knowScore(q, A, B);
    return [head, h('p', { className: 'qz-sum', textContent: `Ты угадываешь ${k.mine} из ${k.total}, ${p.name} — ${k.theirs} из ${k.total}` }),
      h('div', { className: 'qz-rows' }, ...k.rows.map((x, i) => {
        const a = q.questions[i].a;
        return h('div', { className: 'qz-row' + (x.myOk && x.theirOk ? ' ok' : '') },
          h('b', { textContent: x.q }),
          h('span', { textContent: `ты: ${a[x.a.self] ?? '—'} · ${p.name} думает: ${a[x.b.guess] ?? '—'} ${x.theirOk ? '✓' : '✗'}` }),
          h('span', { textContent: `${p.name}: ${a[x.b.self] ?? '—'} · ты думаешь: ${a[x.a.guess] ?? '—'} ${x.myOk ? '✓' : '✗'}` }));
      }))];
  }

  draw();
}

// счётчик приглашений на иконке «Тесты» и тост, когда партнёр позвал
const born = Date.now();
let greeted = false;
// зовёт и desktop.js при открытии ноутбука: при загрузке хранилище может ещё не успеть
export function badge() {
  const n = meId() ? asksToMe().length : 0;
  document.querySelectorAll('[data-app=quiz]').forEach((b) => (n ? b.setAttribute('data-n', n) : b.removeAttribute('data-n')));
  if (n && !greeted) { greeted = true; toast(`${pName()} ждёт тебя в «Тестах» в ноутбуке 🧩`, 6000); }
}
store.on('quizask', (id) => {
  badge();
  const a = store.get('quizask', id), q = a && QUIZZES.find((x) => x.id === a.test);
  if (q && a.to === meId() && a.at > born) toast(`${pName()} зовёт пройти тест ${q.emoji} «${q.title}» — в ноутбуке, «Тесты»`, 6000);
});
store.on('quiz', badge);
store.onPeople(badge);
