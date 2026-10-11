# «Тесты»: каталог по образцу pikuco — план

> Спека: `docs/specs/2026-10-11-quiz-catalog-design.md`. Выполняю сам в этом окне (inline), тексты пакетов и выбор фото — с помощью субагентов, проверка — моя.

**Цель:** каталог тестов как у pikuco (рубрики, фильтры, сортировка, «случайный тест»), четыре новых формата (кто ты из, турнир, тирлист, викторина) с парными итогами, ~32 теста со свободными фото.

**Устройство:** лёгкий каталог в `quizdb.js`, полные тесты в `quizpacks/<id>.js` (грузятся `import.meta.glob`), подсчёты — чистые функции `quizlogic.js`, фото — `public/quiz/<ключ>.webp` + `public/quiz/credits.json`, собирает их `scripts/quizimg.mjs` из Openverse.

**Стек:** без новых зависимостей. Vite, playwright-core (Chrome) для ужатия фото и снимков, node:assert для тестов.

---

### Задача 1. Подсчёты новых форматов (TDD)
**Файлы:** `quizlogic.js`, `tests/quiz.test.mjs`

- [ ] Тесты (дописать в `tests/quiz.test.mjs` перед `console.log`):
```js
// кто ты из: проценты по героям, одинаковые ответы
const tp = typePercents(type, [0, 1, 0]); // y x y
assert.deepEqual(tp.map((r) => [r.key, r.pct]), [['y', 67], ['x', 33], ['z', 0]]);
assert.equal(typeSame(type, { answers: [0, 1, 0] }, { answers: [0, 0, 0] }), 2);
// турнир: сетка одинакова при одном зерне, матчи по ответам
const ord = seeded(16, 'cup-x'); assert.deepEqual(ord, seeded(16, 'cup-x')); assert.deepEqual([...ord].sort((a, b) => a - b), [...Array(16).keys()]);
assert.notDeepEqual(ord, seeded(16, 'cup-y'));
const o4 = [0, 1, 2, 3];
assert.deepEqual(cupPlay(o4, []).cur, [0, 1]); assert.equal(cupPlay(o4, []).size, 4);
assert.deepEqual(cupPlay(o4, [1]).cur, [2, 3]);
assert.deepEqual(cupPlay(o4, [1, 3]).cur, [1, 3]); assert.equal(cupPlay(o4, [1, 3]).size, 2);
assert.equal(cupPlay(o4, [1, 3, 3]).cur, null); assert.equal(cupPlay(o4, [1, 3, 3]).champ, 3);
const cs = cupScore({ items: [{}, {}, {}, {}] }, o4, { answers: [1, 3, 3] }, { answers: [1, 2, 1] });
assert.deepEqual([cs.a.champ, cs.b.champ, cs.first, cs.top[0]], [3, 1, 1, 1]); // первый круг: 1=1, 3≠2; сумма побед: 1 → 1+2=3
assert.deepEqual(cs.a.wins, [0, 1, 0, 2]);
// тирлист: на одной полке, горячие споры (разница 2+)
const ts = tierScore({ items: [{ t: 'a' }, { t: 'b' }, { t: 'c' }] }, { answers: [0, 3, 1] }, { answers: [0, 0, 2] });
assert.deepEqual([ts.same, ts.total, ts.hot.map((r) => r.i)], [1, 3, [1]]);
// викторина
const tv = { questions: [{ q: '1', a: ['a', 'b'], ok: 1 }, { q: '2', a: ['a', 'b'], ok: 0 }] };
assert.equal(triviaRight(tv, [1, 1]), 1);
const tvp = triviaPair(tv, { answers: [1, 0] }, { answers: [0, 0] });
assert.deepEqual([tvp.mine, tvp.theirs, tvp.total], [2, 1, 2]);
// validate новых форматов
const img = (t) => ({ t, img: 'k' });
assert.deepEqual(validate({ id: 'c', kind: 'cup', title: 'x', rubric: 'food', cover: 'k', items: Array.from({ length: 16 }, (_, i) => img('t' + i)) }), []);
assert.ok(validate({ id: 'c', kind: 'cup', title: 'x', rubric: 'food', cover: 'k', items: [img('a')] }).length);
assert.deepEqual(validate({ id: 't', kind: 'tier', title: 'x', rubric: 'food', cover: 'k', items: Array.from({ length: 12 }, (_, i) => img('t' + i)) }), []);
assert.deepEqual(validate({ id: 'v', kind: 'trivia', title: 'x', rubric: 'cinema', cover: 'k', questions: Array.from({ length: 5 }, () => ({ q: '?', a: ['a', 'b'], ok: 1 })) }), []);
assert.ok(validate({ id: 'v', kind: 'trivia', title: 'x', rubric: 'cinema', cover: 'k', questions: Array.from({ length: 5 }, () => ({ q: '?', a: ['a', 'b'], ok: 2 })) }).length);
assert.equal(length({ kind: 'cup', items: Array(16) }), 15); assert.equal(length({ kind: 'tier', items: Array(20) }), 20); assert.equal(length({ kind: 'trivia', questions: Array(7) }), 7);
```
- [ ] `node tests/quiz.test.mjs` → падает (нет функций).
- [ ] Реализация в `quizlogic.js`:
```js
// «кто ты из»: доля ответов на каждого героя, по убыванию (ничья — по порядку результатов)
export function typePercents(quiz, answers) {
  const keys = Object.keys(quiz.results), n = Object.fromEntries(keys.map((k) => [k, 0])); let t = 0;
  quiz.questions.forEach((q, i) => { const k = q.a[answers[i]]?.[1]; if (k in n) { n[k]++; t++; } });
  return keys.map((key) => ({ key, pct: t ? Math.round((n[key] / t) * 100) : 0 })).sort((a, b) => b.pct - a.pct || keys.indexOf(a.key) - keys.indexOf(b.key));
}
export const typeSame = (quiz, A, B) => quiz.questions.filter((_, i) => A.answers[i] != null && A.answers[i] === B.answers[i]).length;

// перемешивание с зерном (mulberry32 от FNV-хеша строки): у обоих одна и та же сетка
export function seeded(n, seed) {
  let x = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const rnd = () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// турнир: по сетке и победителям — текущий матч, размер круга (16/8/4/2), чемпион
export function cupPlay(order, winners) {
  let round = order, k = 0;
  while (round.length > 1) {
    const next = [];
    for (let i = 0; i < round.length; i += 2, k++) {
      if (winners[k] == null) return { cur: [round[i], round[i + 1]], size: round.length, k, champ: null };
      next.push(winners[k]);
    }
    round = next;
  }
  return { cur: null, size: 1, k, champ: round[0] };
}
// турнир вдвоём: победы каждого фото, чемпионы, совпадения первого круга, общий топ по сумме побед
export function cupScore(quiz, order, A, B) {
  const one = (w) => ({ champ: cupPlay(order, w).champ, wins: quiz.items.map((_, i) => w.filter((x) => x === i).length) });
  const a = one(A.answers), b = one(B?.answers || []);
  const half = order.length / 2, first = A.answers.slice(0, half).filter((w, i) => w === B?.answers?.[i]).length;
  const top = quiz.items.map((_, i) => i).sort((x, y) => a.wins[y] + b.wins[y] - (a.wins[x] + b.wins[x]) || x - y).slice(0, 3);
  return { a, b, first, half, top };
}
// тирлист вдвоём: на одной полке, горячие споры (разница в 2+ полки), по убыванию разницы
export function tierScore(quiz, A, B) {
  const rows = quiz.items.map((x, i) => ({ i, t: x.t, a: A.answers[i], b: B.answers[i], d: Math.abs(A.answers[i] - B.answers[i]) }));
  return { rows, same: rows.filter((r) => r.d === 0).length, total: rows.length, hot: rows.filter((r) => r.d >= 2).sort((x, y) => y.d - x.d || x.i - y.i) };
}
// викторина
export const triviaRight = (quiz, answers) => quiz.questions.filter((q, i) => answers[i] === q.ok).length;
export function triviaPair(quiz, A, B) {
  const rows = quiz.questions.map((q, i) => ({ q, a: A.answers[i], b: B.answers[i] }));
  return { rows, mine: triviaRight(quiz, A.answers), theirs: triviaRight(quiz, B.answers), total: rows.length };
}
```
  `length`: `cup` → `items.length - 1`, `tier` → `items.length`, `trivia` → `questions.length`. `validate`: заголовок — `id && title && (topic || rubric)`, `emoji` нужен только старым (без `cover`); `cup` — ровно 16 `items` с `t` и `img`; `tier` — 12–30 `items` с `t` и `img`; `trivia` — ≥5 вопросов, у каждого `q`, ≥2 `a`, `ok` в пределах.
- [ ] `node tests/quiz.test.mjs` → `quiz: ok`. Коммит.

### Задача 2. Каталог и пакеты
**Файлы:** `quizdb.js`, `quizpacks/*.js`, `quizcat.js` (новый, мост для интерфейса), `tests/quiz.test.mjs`

- [ ] `quizdb.js`: `RUBRICS = { cinema: 'кино и сериалы', anim: 'анимация и аниме', games: 'игры', nature: 'животные и природа', food: 'еда', travel: 'путешествия', soul: 'характер', pair: 'для пар' }`; `FORMATS = { type: 'кто ты из', cup: 'турнир', tier: 'тирлист', trivia: 'викторина', pair: 'парные' }`; у старых тестов поле `rubric` (кто из нас/знаешь/это или то/чек-лист/вечер → `pair`; type-dessert → food, type-cat → nature, type-movie → cinema, type-weather → soul, type-date → pair); `NEW` — записи `{ id, kind, rubric, title, desc, n, pop, added, cover, fan? }`.
- [ ] `quizcat.js`: `CATALOG = [...QUIZZES, ...NEW]`; `const PACKS = import.meta.glob('./quizpacks/*.js')`; `loadQuiz(id)` → старый тест как есть, новый — `(await PACKS['./quizpacks/' + id + '.js']()).default` слитый с записью каталога; `format(q)` → `type|cup|tier|trivia|pair`.
- [ ] Тест: каждый файл `quizpacks/*.js` импортируется, проходит `validate`, есть в `NEW` с тем же `kind` и `n === length(pack)`; каждый ключ фото (`cover`, `img` вопросов/результатов/пунктов) есть в `pack.imgs`; если `public/quiz/credits.json` существует — у каждого ключа файл `public/quiz/<ключ>.webp` и запись с `by, src, lic`.
- [ ] Коммит.

### Задача 3. Сбор фото `scripts/quizimg.mjs`
- [ ] `node scripts/quizimg.mjs search [id…]` — ключи из `imgs` всех (или указанных) пакетов без файла и без выбора → Openverse `GET /v1/images/?q=<запрос>&license=cc0,pdm,by,by-sa&mature=false&page_size=12` → кандидаты в `scripts/qimg/cand.json`; лист `shots/qimg/<id>.png` (Chrome, сетка превью `thumbnail` с подписями `ключ #n`).
- [ ] Выбор — `scripts/qimg/picks.json` `{ ключ: n }` (n из листа), правлю руками или субагент.
- [ ] `node scripts/quizimg.mjs fetch` — скачать оригинал (Node `fetch`), в Chrome: `data:` → canvas 640×480 по центру (cover) → `toDataURL('image/webp', .74)` → `public/quiz/<ключ>.webp`; `credits.json` += `{ by, src: foreign_landing_url, lic: 'CC BY 2.0'|'CC0'|'PDM', lic_url, title }`.
- [ ] Коммит скрипта (без кандидатов: `scripts/qimg/cand.json` и `shots/` в .gitignore).

### Задача 4. Пилот: по тесту каждого формата
- [ ] `quizpacks/hp.js` (кто ты из «Гарри Поттера», fan), `cup-dessert.js`, `tier-food.js`, `trivia-movies.js` + записи в `NEW`.
- [ ] Фото: `search` → выбор глазами → `fetch`. Тест задачи 2 зелёный.

### Задача 5. Интерфейс каталога (`quiz.js`, CSS в `index.html`)
- [ ] Список: вопрос дня, строка фильтров (рубрики-чипсы; селекты «формат», «длина», «сначала»), поиск, кнопка «случайный тест» (непройденный; пройдено всё — любой).
- [ ] Карточка: фото-обложка в белой рамке на ленте (у старых — наклейка), формат · рубрика · `n` + единица, «фан-тест» строкой, отметки, кнопки как сейчас.
- [ ] `credits.json` грузится один раз при первом открытии, потом перерисовка.

### Задача 6. Прохождение
- [ ] Экран старта (новые тесты): обложка, формат, название, описание, «N …», пометка фан-теста, «Поехали!».
- [ ] type: фото вопроса (если есть) слева, варианты справа (на узком окне — сверху вниз), «‹ шаг назад», «сброс».
- [ ] cup: два фото с подписями, круг («1/8 финала», «четвертьфинал», «полуфинал», «финал»), матч k из 15, выбор — клик по фото.
- [ ] tier: сверху лента нерасставленных фото; полки «топ / норм / так себе / мимо» цветными этикетками; перетаскивание (pointer events) или клик по фото → по полке; «готово», когда разложено всё.
- [ ] trivia: вопрос, фото, варианты; после клика — верно/неверно, правильный подсвечен, «дальше».

### Задача 7. Итоги и «авторы фото»
- [ ] type: герой (фото мира, имя, характер, фан-пометка) + полоски процентов по всем; с партнёром — две карточки, «вместе вы — X и Y», «ответили одинаково N из M».
- [ ] cup: победитель крупно, финалист; с партнёром — оба победителя, общий топ-3, «в первом круге сошлись N из 8».
- [ ] tier: доска(и) полок мини-фото; с партнёром — «на одной полке N из M», горячие споры.
- [ ] trivia: счёт и звание; с партнёром — кто знает лучше, по вопросам оба ответа.
- [ ] «авторы фото» — ссылка внизу каталога → список (фото-миниатюра, название, автор, лицензия, источник), «фото уменьшены и кадрированы».

### Задача 8. Проверка и выкат пилота
- [ ] `npm test`; `tests/perf/quizflow.mjs` — порт из аргумента; добавить по одному прохождению каждого нового формата двумя вкладками и проверку итогов.
- [ ] Снимки `node tests/shot.mjs` каталога, старта, вопроса, турнира, тирлиста, итогов. `tests/perf/bench.mjs --no-profile` до/после.
- [ ] Выкат (git push, `vercel deploy --prod --yes`), показать Ване.

### Задача 9. Остальные ~28 тестов пакетами
- [ ] Тексты: субагенты по 3–4 теста по схеме пилота (свои слова, без ИИ-маркеров, герои только текстом), я читаю каждый.
- [ ] Фото: `search` → выбор (субагенты смотрят листы, я проверяю) → `fetch`.
- [ ] Тесты, снимки, выкат после каждого пакета.
