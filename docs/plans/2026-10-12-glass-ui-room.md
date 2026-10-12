# Стекло в комнате (Э1) — план

> Спека: `docs/specs/2026-10-12-glass-ui-room-design.md`. Прототип: `lab/ui3/glass.html#room`. Выполнять по порядку, чекбоксы — `- [ ]`.

**Цель:** над 3D-комнатой — стеклянные «мы», вопрос дня, ♥ и колокольчик с карточками, полоса Память · ＋Записка · Дом · Ноутбук, листы «Память» и «Дом»; старый `.hud` уходит.

**Устройство:** `notifylogic.js` (чистый список дел) → `hud.js` (разметка, поведение, данные из store) ← room.js отдаёт действия через `initHud(act)`. Стекло — `glass.js` (карта линзы → `backdrop-filter: url()`), запасной `body.flatglass`.

**Стек:** ванильный JS-модуль, Vite, three.js (не трогаем), `@fontsource/onest`, `@phosphor-icons/core` (SVG через `?raw`).

Порт dev этой сессии — **:8126** (`npx vite --port 8126 --strictPort`, превью `love-room-e`).

---

### Задача 1: список дел `notifylogic.js`

**Файлы:** создать `notifylogic.js`, `tests/notify.test.mjs`.

- [ ] Тест:

```js
// Колокольчик: дела от партнёра по важности; новые — те, чьих ключей ещё не видели
import assert from 'node:assert/strict';
import { pending, fresh } from '../notifylogic.js';

assert.deepEqual(pending({}), [], 'нет данных — нет дел');
const all = pending({
  qday: '2026-10-12',
  asks: [{ id: 'a1', title: 'Какой ты фильм' }],
  turns: [{ id: 'g1', at: 5, title: 'Котобой' }],
  gifts: [{ id: 7, title: 'Мишка', note: 'обнимаю' }],
  notes: [{ id: 'n1', text: 'Смотри, что я нашла про Прагу и про то, как туда доехать на поезде' }],
});
assert.deepEqual(all.map((i) => i.kind), ['note', 'gift', 'turn', 'ask', 'qday'], 'порядок важности');
assert.ok(all[0].sub.length <= 61 && all[0].sub.endsWith('…'), 'длинная записка обрезана');
assert.equal(all[1].sub, '«обнимаю»', 'у подарка — подпись');
assert.equal(all[2].key, 'turn:g1:5', 'новый ход — новый ключ');
assert.equal(all[4].go, 'quiz');
const seen = new Set(['note:n1', 'qday:2026-10-12']);
assert.deepEqual(fresh(seen, all).map((i) => i.kind), ['gift', 'turn', 'ask']);
console.log('notify ok');
```

- [ ] `node tests/notify.test.mjs` → падает (нет модуля).
- [ ] Реализация:

```js
// Колокольчик в комнате: что ждёт меня от партнёра. Вход — уже отобранные данные (hud.js), выход — дела по важности.
// Дело = { key, kind, text, sub, go } — key меняется, когда появляется новое (новый ход — новый at), go — куда вести.
const clip = (s = '', n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
export function pending({ notes = [], gifts = [], turns = [], asks = [], qday = null } = {}) {
  return [
    ...notes.map((n) => ({ key: 'note:' + n.id, kind: 'note', text: 'записка', sub: clip(n.text), go: 'desk' })),
    ...gifts.map((g) => ({ key: 'gift:' + g.id, kind: 'gift', text: 'подарок: ' + g.title, sub: g.note ? `«${clip(g.note, 50)}»` : 'коробка на столе', go: 'desk' })),
    ...turns.map((m) => ({ key: `turn:${m.id}:${m.at}`, kind: 'turn', text: `ваш ход · ${m.title}`, sub: 'ждёт тебя в «Играх»', go: 'games', match: m.id })),
    ...asks.map((a) => ({ key: 'ask:' + a.id, kind: 'ask', text: 'зовёт в тест', sub: `«${a.title}»`, go: 'quiz' })),
    ...(qday ? [{ key: 'qday:' + qday, kind: 'qday', text: 'ответил(а) на вопрос дня', sub: 'твоя очередь', go: 'quiz' }] : []),
  ];
}
export const fresh = (seen, items) => items.filter((i) => !seen.has(i.key));
```

- [ ] `npm test` → `notify ok`, остальные зелёные. Коммит `notifylogic: список дел колокольчика`.

### Задача 2: данные из «Тестов» и «Игр», без тостов-приглашений

**Файлы:** `quiz.js` (~304–325), `games.js` (~19–30, ~88–101), `desktop.js` (`openDesktop`, `openApp`, `APPS.games`).

- [ ] `quiz.js`: экспортировать то, что уже посчитано:

```js
export const invites = () => asksToMe().map((a) => ({ id: a.id, title: CATALOG.find((x) => x.id === a.test)?.title || 'тест' }));
export const qdayWaiting = () => (dayWaiting() ? dayStr() : null);
export function qdayInfo() { // для чипа в комнате
  const me = meId(), p = store.partner(), d = dayStr();
  const both = (x) => !!(dayRec(x, me) && dayRec(x, p?.id));
  return { streak: p ? qdayStreak(both, d) : 0, mine: !!dayRec(d, me), theirs: !!dayRec(d, p?.id) };
}
```

  В `badge()` убрать строку с `greeted`/`toast(...)`; в `store.on('quizask')` и `store.on('qday')` оставить только `badge()` (тосты убрать). `born`, `greeted` удалить, если больше не нужны.
- [ ] `games.js`: `export const myTurns = () => matches().filter((m) => isMine(m)).map((m) => ({ id: m.id, at: m.at, title: byKind(m.kind).title }));` В `badge()` убрать тост, `store.on('game')` — только `badge()`. `renderGames(el, opts = {})`: `let open = opts.match || null;`.
- [ ] `desktop.js`: `openDesktop(app, done, opts)` → `if (app) openApp(app, opts)`; `openApp(name, opts)` передаёт `render: (el) => A.render(el, opts)`; `APPS.games.render` — `(el, o) => renderGames(el, o)` (сейчас `renderGames` передан прямо — проверить и протянуть `opts`). Если окно уже открыто (`isOpen(name)`) и есть `opts.match` — `closeWin(name)` и открыть заново.
- [ ] `npm test`, открыть ноутбук на :8126 — «Тесты» и «Игры» работают, тостов-приглашений нет. Коммит `тесты/игры: данные для колокольчика, без тостов-приглашений`.

### Задача 3: стекло, шрифт, значки

**Файлы:** создать `glass.js`, `icons.js`; `package.json`.

- [ ] `npm i @fontsource/onest @phosphor-icons/core`.
- [ ] `glass.js` — копия `lab/ui3/glass.js` с двумя правками: карта кэшируется по ключу `w×h×r` (один `<filter>` на размер), и `watchGlass(root)` пересчитывает при изменении размера:

```js
const byKey = new Map();
export function glass(el, { scale = 46, blur = 3, sat = 1.7, bevel = 22 } = {}) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return;
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, h / 2, w / 2), key = `${w}x${h}x${r}x${scale}`;
  let id = byKey.get(key);
  if (!id) { id = 'lg' + byKey.size; byKey.set(key, id); /* …создать <filter id> как в прототипе… */ }
  el.style.setProperty('--lgf', `url(#${id})`);
}
const ro = new ResizeObserver((es) => es.forEach((e) => glass(e.target)));
export const watchGlass = (root) => root.querySelectorAll('.lg').forEach((e) => ro.observe(e));
```

  В CSS: `.lg { backdrop-filter: var(--lgf, ) blur(3px) saturate(1.7) }`, `body.flatglass .lg { backdrop-filter: blur(16px) saturate(1.7) }` — переключение без пересоздания фильтров.
- [ ] `icons.js`: `import x from '@phosphor-icons/core/regular/<имя>.svg?raw'` (проверить путь в `node_modules/@phosphor-icons/core/assets`), экспорт `icon(name)` → строка SVG с `fill="currentColor"`. Нужны: images-square, pencil-simple-line, armchair, laptop, bell-simple, heart (fill), fire (fill), x, hand-grabbing, storefront, speaker-high, speaker-slash, plus, images, chat-circle-text.
- [ ] Onest: `import '@fontsource/onest/400.css'` (и 500, 600, 700) в `hud.js`.
- [ ] `npm run build` проходит. Коммит.

### Задача 4: `hud.js` — разметка и поведение

**Файлы:** создать `hud.js`; `index.html` (CSS — блок `/* ---- стекло (hud.js) ---- */`, все классы `lg-*`).

- [ ] Разметка строится в JS (`h()` как в desktop.js), корень `<div id="lgui">`: `.lg-us`, `.lg-day`, `.lg-tr` (`.lg-hearts`, `.lg-bell` + `.lg-badge`), `.lg-cards`, `.lg-list`, `nav.lg-bar` (4 кнопки, у записки `.lg-compose`), `.lg-sheet` (один, содержимое меняется). CSS — из `lab/ui3/glass.html` строки 21–53 и 95–100 с префиксом `lg-`; лист — `.sheet` оттуда же.
- [ ] Прятать: `body.busy #lgui, body.editing #lgui, body.zoomed #lgui, body.aim #lgui { opacity: 0; pointer-events: none }`.
- [ ] Интерфейс:

```js
// act от room.js: { write(), arrange(), boxCount(), laptop(app, opts), album(a|null), toDesk(), isIdle(), mute: { on(), toggle() } }
export function initHud(act) { … }
```

- [ ] «мы»: аватары — `avatar()` из profile.js (размер 42); точка — `store.live.presence()[partner.id]`; строка 2: `${pname} дома · у неё ${hh:mm}, ${temp}°, ${text}` (погода — `fetchWeather(partner.city)` раз в 15 мин, кэш; `cityHour`, `wxLabel`); не в сети — `${pname} не в сети`; нет партнёра — «позови вторую половинку». Обновление: `store.live.onPresence`, `store.onPeople`, таймер 60 с.
- [ ] Вопрос дня: `qdayInfo()`; `theirs && !mine` → «Вопрос дня · серия N — {pname} уже ответил(а)»; `!theirs && !mine` → «Вопрос дня · серия N»; оба → класс `.lg-day.small` (огонёк + N). Нажатие — `act.laptop('quiz')`. Подписка: `store.on('qday')`.
- [ ] ♥: `store.balance()`, `store.onLedger`; нажатие — `act.laptop('shop', { tab: 'earn' })` (в `renderShop(el, opts)` — `let tab = opts.tab || 'room'`).
- [ ] Колокольчик: `collect()` собирает вход для `pending`:

```js
const pn = () => store.partner()?.name;
function collect() {
  const me = store.me()?.id, read = new Set(store.all('read').map((r) => r.id)), bin = new Set(store.all('trash').map((t) => t.id));
  return {
    notes: pn() ? store.all('notes').filter((n) => n.from === pn() && !read.has(n.id) && !bin.has(n.id)) : [],
    gifts: store.ledger().filter((r) => r.reason === 'gift' && r.to_user === me && !r.opened).map((r) => ({ id: r.id, note: r.note, title: SHOP_BY_ID[r.item]?.title || 'подарок' })),
    turns: myTurns(), asks: invites(), qday: qdayWaiting(),
  };
}
```

  (`SHOP_BY_ID` — из data/shop-модуля, где лежит `ot`-словарь вещей; найти экспорт по `export const` в `data.js`/`shop.js`.) Пересчёт на `store.on('notes'|'read'|'trash'|'game'|'quizask'|'qday'|'quiz')`, `store.onLedger`, `store.onPeople`. Первый пересчёт кладёт все ключи в `seen` без карточек; дальше `fresh(seen, items)` → карточка последнего нового, ключи — в `seen`.
- [ ] Карточка: `.lg-card.lg` с аватаром партнёра, `<b>{pname}</b> · {text}`, `sub`, время «сейчас»; через 6 с — класс `out`, удалить. Нажатие — `go(item)`.
- [ ] `go(item)`: `desk` → `act.toDesk()`; `games` → `act.laptop('games', { match: item.match })`; `quiz` → `act.laptop('quiz')`. Закрыть список.
- [ ] Список (`.lg-list`): строки дел, пусто — «всё сделано ♥». Открывается/закрывается колокольчиком, Esc, кликом мимо.
- [ ] «Соня пришла домой»: в `onPresence` — был не в сети → в сети (и прошло > 10 с от загрузки) → карточка без записи в seen.
- [ ] Полоса: Память → `sheet('memory')`, Записка → `act.write()`, Дом → `sheet('home')`, Ноутбук → `act.laptop()`. Работает, только если `act.isIdle()`.
- [ ] Лист «Память»: `listAlbums()` → обложки (`a.color`, фото обложки `store.media(a.cover)`, `a.title`, `a.pageIds?.length`), «＋ альбом» → `act.album(null)`; строки «Галерея» → `act.laptop('gallery')`, «Мысли» → `act.laptop('thoughts')` (проверить имена в `APPS`).
- [ ] Лист «Дом»: «Расставить» + `act.boxCount()` → `act.arrange()`; «Магазин» → `act.laptop('shop')`; «Звук» — переключатель `act.mute`.
- [ ] После вставки — `watchGlass(lgui)`. Коммит `hud: стеклянная комната`.

### Задача 5: room.js и index.html — подключить и убрать старое

**Файлы:** `room.js` (836–871 погода, 1124 goScreen, 1492–1494 tip, 1603–1607 звук/записка, 1688–1690 расставить), `index.html` (1212–1213, CSS `.hud`, `.tip`).

- [ ] Удалить из index.html `<div class="hud">…</div>` и CSS `.hud`; `#tip` оставить, текст пустой, `bottom: 124px` (над полосой), `.tip:empty { display: none }`.
- [ ] room.js: `TIP = ''`; погода — убрать `wxPill` (функция погоды остаётся для окна и света, только без пилюли); убрать `muteBtn`, `#write`, `arrangeBtn` обработчики (логику перенести в функции):

```js
const writeNote = () => { if (state === 'room' || state === 'zoom') { modal.hidden = false; pad.open(); } };
const arrange = () => { if (state !== 'room') return; state = 'edit'; body.classList.add('editing'); placer.edit(); sfx.pop(); };
initHud({
  write: writeNote, arrange, boxCount: () => placer.boxCount(),
  laptop: (app, opts) => { if (state === 'room' || state === 'zoom') goScreen(app, opts); },
  album: (a) => { if (state === 'room' || state === 'zoom') openShelfAlbum(a); },
  toDesk: () => { if (state === 'room') zoomTo(zonesys.byId('desk')); },
  isIdle: () => state === 'room' || state === 'zoom',
  mute: { on: () => !sfx.isMuted(), toggle: () => sfx.toggleMute() },
});
```

  `drawArrange()` — вызывать `hud.refresh?.()` вместо текста кнопки (или убрать: лист «Дом» читает `boxCount()` при открытии).
- [ ] `goScreen(app, opts)` → `openDesktop(app, done, opts)`.
- [ ] Плавность: в `tuneGfx` после решения автоподстройки — `body.classList.toggle('flatglass', tuner.tier === TOP_TIER)`. `?flatglass` в адресе — включить принудительно (для замера).
- [ ] Проверка на :8126: комната, все кнопки, `?as=b` во второй вкладке. Коммит.

### Задача 6: тосты в стекле

**Файлы:** `index.html` (`.toast` ~439, 975).

- [ ] `.toast` — стекло: `background: rgba(40,20,48,.55); backdrop-filter: blur(16px) saturate(1.7); color: #fff; border-radius: 999px; font: 600 14px Onest; border: 0; box-shadow` как у `.lg`; `bottom: 110px` (над полосой), в `toast()` шаг стопки 54 → от 110. Коммит.

### Задача 7: стенд и замер

**Файлы:** создать `tests/perf/glass.mjs` (по образцу `tests/perf/desk.mjs`).

- [ ] Стенд: открыть `/?as=a` и `/?as=b` (локальный режим, `?local`), снимки a 1440×900 и 390×844: комната, лист «Память», лист «Дом»; b пишет записку через `store.put('notes', …)` в `page.evaluate` (импорт `/store.js`) → у a карточка видна, счётчик 1; a помечает `read` → счётчик 0. Время кадра: 300 кадров `__room.step` или `requestAnimationFrame` замер со стеклом и с `?flatglass`.
- [ ] Запуск `node tests/perf/glass.mjs scratchpad/glass 8126`, посмотреть снимки.
- [ ] `npm test`, `npm run build`, `node tests/perf/bench.mjs --no-profile` (только от сети!) — не хуже прежнего.
- [ ] HANDOFF.md — раздел «12.10 — стекло в комнате (Э1)», NEXT.md — «СЕЙЧАС: Э2 редактор альбома». Коммит, `git push`, выкат `vercel deploy --prod --yes`.
