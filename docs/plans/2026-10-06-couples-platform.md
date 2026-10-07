# Платформа для пар: план реализации

**Цель:** перевести «Наш дом» на Supabase с аккаунтами и парами, добавить профили, баллы, магазин, подарки и CoupleTube.
**Архитектура:** статика без сборки. `store.js` = фасад над `backend-sb.js` (Supabase) или `backend-local.js` (localStorage + BroadcastChannel). Приложения ноутбука лежат отдельными модулями и регистрируются в `desktop.js`.
**Стек:** three.js 0.170, supabase-js 2 (ESM, jsdelivr), YouTube IFrame API, hls.js, Vercel (одна функция `api/config`).
**Спека:** `docs/specs/2026-10-06-couples-platform-design.md`. Исполнение: в этой сессии, `decor.js` параллельно пишет субагент.

## Интерфейс store.js (фиксируется до остальных задач)
```
initStore()                       // режим, вход, онбординг, загрузка
isCloud()
all(kind) get(kind,id) put(kind,id,v) del(kind,id) uid() uploadPhoto(file,max)
on(kind, cb)                      // cb(id, value|undefined, fromPartner) — правки партнёра
me() partner() couple()           // {id,name,emoji,color,avatar,birthday,about} / {title,started,invite}
saveProfile(patch) saveCouple(patch) signOut()
live: send(ev,payload) on(ev,cb) presence(cb) track(state)   // канал пары
messages(room) say(room,text) onMessage(cb)
ledger() balance() award(reason,ref) buy(item,toUserId,note) openGift(id) onLedger(cb)
serverNow()
```

## Задачи
1. **Бэкенд-конфиг.** `api/config.js` отдаёт `{url, key}` из `SUPABASE_URL`/`SUPABASE_ANON_KEY` (или 503). Удалить `api/{ping,state,item,upload,_auth}.js`, `@vercel/blob` из package.json, `SITE_PASS` из Vercel env.
2. **backend-local.js.** Данные в `lr:store`, профили a/b и пара в `lr:local-couple`, лента в `lr:ledger`, чат в `lr:msgs`. BroadcastChannel `lr-live` разносит правки, сообщения, ленту и live-события по вкладкам; присутствие через пульс раз в 2 с. Выбор «кто я»: `?as=b`. award/buy повторяют правила SQL по `catalog.js`.
3. **backend-sb.js.** createClient → сессия → профиль/пара/участники → items (data not null) → лента → подписки postgres_changes на items/messages/ledger/profiles/couples/members по `couple_id` → закрытый канал `couple:<id>` (broadcast + presence). uploadPhoto → Storage `house/<couple>/<uuid>.jpg`. serverNow по `server_now()` с поправкой на половину RTT.
4. **auth.js.** Экран в стиле `#gate`: вход/регистрация, создание дома (название, дата начала, моё имя) или вход по коду (`?invite=` подставляется сам), предложение перенести локальные данные (data:-картинки догружаются).
5. **Перевод приложений.** `whoSelect` → имя из `me()` (в облаке без выбора); `since()` берёт `couple().started`; plans PEOPLE и gallery `who()` из профилей; data.js теряет me/her/start/photos. Начисления: записка, фото, альбом, этап, план, ежедневный визит.
6. **Живые обновления.** `store.on`: notes → новая записка в комнате, wall → полароид, photos/folders/plans/thoughts → перерисовать открытое окно, albums → полка.
7. **catalog.js + shop.js + profile.js.** Магазин (баланс, как заработать, «для дома»/«подарки», покупка, подарок с запиской) и Профиль (мой/партнёра, дом, приглашение, история, выход). Иконки в док и на рабочий стол.
8. **decor.js (субагент).** `createDecor({scene, clickables, TOP, M, fabric, rbox, add, floatAt})` → `{ show(owned: string[], boxes: {id,item,from,note}[], onOpen) }`. Вещи на заранее выбранных свободных местах комнаты, коробка с бантом, открытие с анимацией.
9. **tube.js + sync.js.** `sync.js` (чистые функции: `parseSource(url)`, `expected(state, now)`, `correction(diff, type)`) + `tests/sync.test.mjs`. `tube.js`: адаптеры yt/html5 (hls.js по требованию), синхронизация, чат, «печатает», присутствие, реакции, начисление за 20 минут вдвоём.
10. **Проверка.** `node tests/sync.test.mjs`, затем браузер в локальном режиме на двух вкладках по списку из спеки. После этого выкат `vercel deploy --prod --yes`, `api/config` и анонимный запрос к RLS. Обновить HANDOFF.md и память.
