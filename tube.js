// CoupleTube: смотреть видео вдвоём. Слева плеер (YouTube или прямая ссылка mp4/webm/HLS), справа общий чат.
// Общее состояние { src, playing, pos, at, by } — в store ('tube','now') и для скорости в живом канале пары.
import * as store from './store.js';
import { parseSource, expected, correction, sourceKey } from './sync.js';
import { pop } from './sound.js';
import { createPlayer } from './players.js';
import { createPanel } from './tvpanel.js';
import { shareFile, probe, shareTab } from './localcast.js';
import { clockText } from './tvpanel.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null && k !== false)); return e; };
const TOGETHER = 20 * 60; // столько секунд вдвоём → баллы
const loadVol = () => { try { const v = parseFloat(localStorage.getItem('lr:tubevol')); return Number.isFinite(v) ? v : 1; } catch { return 1; } };
const hhmm = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

// ---------- окно ----------
export function renderTube(el) {
  const me = store.me();
  const partner = () => store.partner();
  const offs = [];

  // экран
  const url = h('input', { type: 'url', placeholder: 'ссылка: YouTube, VK Видео, Rutube, Twitch, Vimeo, Яндекс Диск, Dropbox или .mp4 / .m3u8', required: true });
  const err = h('div', { className: 'terr', hidden: true });
  // Twitch внутри чужого сайта ломается (Ошибка #2000), если браузер режет ему хранилище: Edge «Предотвращение отслеживания» и т. п.
  // ponytail: ошибку плеер Twitch наружу не сообщает — просто показываем подсказку рядом с любым Twitch
  const note = h('div', { className: 'tnote', hidden: true },
    h('b', { textContent: 'Twitch пишет «Ошибка #2000»? ' }),
    'Браузер не даёт ему работать внутри других сайтов. В Edge: Настройки → Конфиденциальность, поиск и службы → Предотвращение отслеживания → Исключения → добавить ',
    h('code', { textContent: location.hostname }),
    ' и обновить страницу. Или откройте эфир на twitch.tv и покажите его вкладкой 📺.');
  // свой фильм с компьютера: играет у меня, партнёру — живой эфир (localcast.js)
  const fileIn = h('input', { type: 'file', accept: 'video/*,.mkv,.avi,.mov,.m4v', hidden: true, onchange: async () => {
    const f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    showErr(''); title.textContent = `проверяю «${f.name}»…`;
    const info = await probe(f);
    if (!info.ok || !info.w) { title.textContent = ''; return showErr(info.ok ? 'В этом файле нет видео, которое понимает браузер.' : 'Браузер не открывает этот файл. Подойдут mp4 и webm; старые AVI (xvid) — нет.'); }
    const sid = shareFile(f);
    publish({ src: { type: 'local', host: me.id, sid, name: f.name.slice(0, 120), dur: info.dur }, playing: true, pos: 0 });
    system('показываю свой фильм — у партнёра он пойдёт живым эфиром');
  } });
  const pick = h('button', { type: 'button', className: 'tpick', textContent: '📁 свой фильм', title: 'выбрать видео на этом компьютере', onclick: () => fileIn.click() }, fileIn);
  // показать партнёру вкладку браузера со звуком (то, что у него не открывается: YouTube из России и т. п.)
  const tabBtn = navigator.mediaDevices?.getDisplayMedia && h('button', { type: 'button', className: 'tpick', textContent: '📺 вкладка', title: 'показать партнёру вкладку браузера со звуком', onclick: async () => {
    try {
      const { sid, label } = await shareTab();
      publish({ src: { type: 'local', mode: 'screen', host: me.id, sid, name: label.slice(0, 120) }, playing: true, pos: 0 });
      system('показываю вкладку — партнёр видит её живым эфиром');
    } catch (e) { if (e.name !== 'NotAllowedError') showErr('Не получилось показать вкладку: ' + e.message); }
  } });
  const bar = h('form', { className: 'tbar', onsubmit: (e) => {
    e.preventDefault();
    const src = parseSource(url.value);
    if (!src) return showErr('Эту ссылку открыть не получится. Подходят YouTube, VK Видео, Rutube, Twitch, Vimeo, публичные ссылки Яндекс Диска и Dropbox, прямые .mp4/.webm/.m3u8. Кинотеатры с защитой (Кинопоиск, Okko, Netflix) встроить нельзя.');
    url.value = '';
    publish({ src, playing: true, pos: src.start || 0 });
    system('видео открывается у обоих');
  } }, url, h('button', { textContent: 'смотреть вместе' }), pick, tabBtn);
  const stage = h('div', { className: 'tstage' });
  const join = h('button', { className: 'tjoin', hidden: true, textContent: '▶ нажми, чтобы смотреть вместе', onclick: () => { join.hidden = true; P?.play(); } });
  const empty = h('div', { className: 'tempty' }, h('b', { textContent: '🎬 Кино вдвоём' }),
    h('span', { textContent: 'Вставьте ссылку сверху — видео откроется у обоих. Пауза, перемотка и реакции тоже общие.' }));
  const alt = h('div', { className: 'talt', hidden: true });
  const screen = h('div', { className: 'tscreen' }, stage, empty, join, alt);
  const title = h('span', { className: 'ttitle' });
  let vol = loadVol();
  const panel = createPanel({
    volume: vol,
    onToggle: () => {
      if (!P || !S) return;
      const go = !S.playing;
      if (go) P.play(); else P.pause(); // прямо по клику: так браузер разрешает звук
      publish({ playing: go, pos: P.time() });
    },
    onSeek: (t) => { if (P && S && !P.live) publish({ playing: S.playing, pos: t }); },
    onVolume: (v) => { vol = v; try { localStorage.setItem('lr:tubevol', v); } catch {} P?.volume(v); },
    onFullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : tvbox.requestFullscreen?.()).catch?.(() => {}),
    onSubs: () => { if (P?.subs) { P.subs(!P.subsOn()); drawPanel(); } }, // субтитры — у каждого свои, не общие
  });
  const together = h('span', { className: 'ttogether' });
  const tvbox = h('div', { className: 'tvbox' }, screen, panel.el); // экран + панель; в полный экран уходят вместе
  const tv = h('div', { className: 'tv' }, bar, err, note, h('div', { className: 'tnow' }, title, together), tvbox);

  // чат
  const status = h('small');
  // очистить чат у обоих — со вторым нажатием «точно?»
  const wipe = h('button', { type: 'button', className: 'twipe', textContent: 'очистить', title: 'удалить всю переписку у обоих', onclick: () => {
    if (!wipe.classList.contains('sure')) { wipe.classList.add('sure'); wipe.textContent = 'точно? у обоих'; setTimeout(() => { wipe.classList.remove('sure'); wipe.textContent = 'очистить'; }, 4000); return; }
    store.clearChat('tube').catch(() => system('не получилось очистить — проверь интернет'));
  } });
  const head = h('header', {}, h('i', { className: 'tava' }), h('div', {}, h('b'), status), wipe);
  const msgs = h('div', { className: 'tmsgs' });
  const typing = h('div', { className: 'ttyping' });
  const input = h('input', { placeholder: 'написать…', maxLength: 1000, autocomplete: 'off' });
  let typedAt = 0;
  input.oninput = () => { if (Date.now() - typedAt > 1500) { typedAt = Date.now(); store.live.send('typing', { who: me.id }); } };
  const send = h('form', { className: 'tsend', onsubmit: (e) => {
    e.preventDefault();
    const t = input.value.trim(); if (!t) return;
    input.value = ''; typedAt = 0;
    store.say('tube', t).catch(() => system('не отправилось — проверь интернет'));
  } }, input, h('button', { textContent: '➤', title: 'отправить' }));
  const chat = h('aside', { className: 'tchat' }, head, msgs, typing, send);
  el.append(h('div', { className: 'tube' }, tv, chat));

  // ---------- чат: сообщения, «печатает», кто в сети ----------
  const shown = new Set();
  const stick = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 60;
  // bulk — история при открытии: без чтения прокрутки на каждое сообщение (это пересчёт раскладки окна) и без звука
  function addMsg(m, bulk = false) {
    if (m.room !== 'tube' || shown.has(m.id)) return;
    shown.add(m.id);
    const mine = m.user_id === me.id, end = !bulk && stick();
    msgs.append(h('div', { className: 'tmsg' + (mine ? ' me' : '') }, h('p', { textContent: m.text }), h('small', { textContent: hhmm(m.created_at) }),
      mine ? h('button', { type: 'button', className: 'tdel', textContent: '×', title: 'удалить у обоих', onclick: (e) => { const row = e.currentTarget.parentNode; row.classList.add('gone'); store.unsay(m.id).catch(() => { row.classList.remove('gone'); system('не удалилось — проверь интернет'); }); } }) : null));
    msgs.lastChild.dataset.id = m.id;
    if (bulk) return;
    if (end || mine) msgs.scrollTop = msgs.scrollHeight;
    if (!mine) { typing.textContent = ''; pop(); }
  }
  function system(text, bulk = false) {
    msgs.append(h('div', { className: 'tsys', textContent: text }));
    if (!bulk && stick()) msgs.scrollTop = msgs.scrollHeight;
  }
  store.messages('tube').then((list) => {
    if (!list.length) system('Здесь ваш общий чат. Пишите прямо во время фильма.', true);
    list.forEach((m) => addMsg(m, true));
    requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; }); // вниз — один раз, когда браузер и так считает раскладку
  }).catch(console.warn);
  offs.push(store.onMessage(addMsg));
  offs.push(store.onUnmessage((x) => {
    if (x.id != null) { msgs.querySelector(`.tmsg[data-id="${x.id}"]`)?.remove(); shown.delete(x.id); }
    else if (x.room === 'tube') { msgs.replaceChildren(); shown.clear(); system('Чат очищен'); }
  }));
  let typingT = 0;
  offs.push(store.live.on('typing', () => {
    typing.textContent = `${partner()?.name || 'партнёр'} печатает…`;
    clearTimeout(typingT); typingT = setTimeout(() => { typing.textContent = ''; }, 3000);
  }));

  const watching = () => { const p = partner(); return !!p && store.live.presence()[p.id]?.app === 'tube'; };
  function drawHead() {
    const p = partner(), pr = p && store.live.presence()[p.id];
    head.querySelector('.tava').textContent = p?.emoji || '💌';
    head.querySelector('.tava').style.background = p?.color || '#ccc';
    head.querySelector('b').textContent = p?.name || 'Пока одни';
    status.textContent = !p ? 'пригласи партнёра в «Профиле»' : pr?.app === 'tube' ? '● смотрит с тобой' : pr ? '● в сети' : 'не в сети';
    status.className = pr ? 'on' : '';
  }
  drawHead();
  offs.push(store.live.onPresence(drawHead), store.onPeople(drawHead));
  store.live.track({ app: 'tube' });

  // ---------- синхронизация ----------
  let S = store.get('tube', 'now') || null, P = null, loadedKey = '', loading = null, ignoreUntil = 0, notPlaying = 0;
  let lastT = 0, lastWall = 0, togetherSec = 0, awardedKey = '', playAskedAt = 0, generation = 0, ytStuck = 0, altFor = '';

  function publish(patch) {
    S = { ...S, ...patch, at: store.serverNow(), by: me.id };
    store.put('tube', 'now', S).catch(console.warn);
    store.live.send('tube', S);
    ensurePlayer(); tick();
  }
  function remote(s) {
    if (!s?.src || (S && s.at <= S.at)) return;
    const was = S;
    S = s;
    const who = partner()?.name || 'партнёр';
    if (s.by !== me.id) {
      if (!was || sourceKey(was.src) !== sourceKey(s.src)) system(`${who} включает видео`);
      else if (was.playing !== s.playing) system(s.playing ? `${who} продолжает` : `${who} ставит на паузу`);
    }
    ensurePlayer(); tick();
  }
  offs.push(store.live.on('tube', remote), store.on('tube', (id, v) => id === 'now' && remote(v)));

  function showErr(text) { err.textContent = text; err.hidden = !text; }

  // события моего плеера: совпало с общим состоянием — это эхо, иначе публикуем
  function onPlayer(kind, msg) {
    if (kind === 'error') { join.hidden = true; if (S?.src?.type === 'yt') showAlt(); return showErr(msg); }
    if (kind === 'blocked') { join.hidden = false; return; }
    if (kind === 'note') return system(msg); // подсказки плеера (перевод звука) — в чат, только себе
    if (!P || !S || performance.now() < ignoreUntil) return;
    const t = P.time(), exp = expected(S, store.serverNow());
    if (kind === 'play' && S.playing) return; // у всех уже играет: я просто догоняю, подгонка сама перемотает
    if (kind === 'pause' && (!S.playing || notPlaying > 0)) return; // пауза до того, как видео пошло (браузер не дал звук), — не моё решение
    if (kind === 'pause' && performance.now() - playAskedAt < 3000) { join.hidden = false; return; } // браузер сам остановил наш автозапуск
    if (kind === 'seek' && Math.abs(t - exp) < 1.2) return;
    publish({ playing: kind === 'seek' ? P.playing() : kind === 'play', pos: t });
  }

  async function ensurePlayer() {
    if (!S?.src) return;
    const key = sourceKey(S.src);
    if (key === loadedKey) return;
    loadedKey = key; showErr(''); join.hidden = true; empty.hidden = true; alt.hidden = true; note.hidden = true; ytStuck = 0;
    P?.destroy(); P = null; togetherSec = 0;
    const gen = ++generation; // события закрытого плеера (например, «не в эфире» от прошлого Twitch) не трогают новый
    const my = loading = createPlayer(stage, S.src, (k, m) => gen === generation && onPlayer(k, m));
    const p = await my.catch((e) => { console.warn(e); showErr('Плеер не загрузился'); return null; });
    if (loading !== my) return p?.destroy(); // пока грузили, включили другое
    P = p; ignoreUntil = performance.now() + 1500; notPlaying = 1;
    P?.volume(vol);
    note.hidden = P?.type !== 'twitch';
    // у чужих плееров (Twitch, VK…) бывают свои заставки — подсказка сверху и не закрывает их кнопки
    join.classList.toggle('hint', !!P?.native);
    join.textContent = P?.native ? 'нажми ▶ в самом плеере — и смотрим вместе' : '▶ нажми, чтобы смотреть вместе';
    title.textContent = P?.title() || '';
    tick();
  }

  function tick() {
    if (!P || !S) return;
    if (P.follower) { // эфир чужого файла: время и пауза живут у того, кто показывает
      if (P.blocked()) { P.play(); if (++notPlaying > 4 && err.hidden) join.hidden = false; } else { notPlaying = 0; join.hidden = true; }
      return countTogether(P.playing());
    }
    const now = store.serverNow(), exp = expected(S, now), t = P.time(), playing = P.playing();
    if (!title.textContent) title.textContent = P.title();
    // перемотку в YouTube видно только по скачку времени
    const wall = performance.now();
    if (!P.seekEvents && wall > ignoreUntil && lastWall) {
      const jump = Math.abs((t - lastT) - (playing ? (wall - lastWall) / 1000 : 0));
      // ponytail: t≈0 бывает во время рекламы — это не перемотка
      if (jump > 2 && t > 0.5 && Math.abs(t - exp) > 1.5) { lastT = t; lastWall = wall; return onPlayer('seek'); }
    }
    lastT = t; lastWall = wall;

    if (S.playing && !playing) { P.play(); playAskedAt = wall; if (++notPlaying > 6 && err.hidden) join.hidden = false; } // браузер не дал включить звук сам
    else if (!S.playing && playing) { ignoreUntil = wall + 800; P.pause(); }
    if (playing) { notPlaying = 0; join.hidden = true; }
    // YouTube висит на загрузке — у человека он, скорее всего, замедлен: предложим копию
    if (P.type === 'yt' && S.playing && P.state() === 3) { if (++ytStuck > 16) showAlt(); } else ytStuck = 0;
    const c = P.live ? { seek: false, rate: 1 } : correction(t - exp, P.type === 'file' ? 'file' : 'yt'); // эфир синхронен сам
    if (c.seek) { ignoreUntil = wall + 1200; P.seek(exp); }
    P.rate(c.rate);

    countTogether(playing);
  }
  async function rutubeSearch(q) {
    const d = await fetch('https://rutube.ru/api/search/video/?format=json&query=' + encodeURIComponent(q.slice(0, 120)), { signal: AbortSignal.timeout(6000) }).then((x) => x.json()).catch(() => null);
    return (d?.results || []).slice(0, 6).filter((v) => /^[0-9a-f]{32}$/.test(v.id)).map((v) => ({ url: v.video_url || `https://rutube.ru/video/${v.id}/`, title: String(v.title || ''), author: v.author?.name || '', thumb: v.thumbnail_url || '', duration: +v.duration || 0 }));
  }
  // YouTube не грузится: ищем это же видео на Rutube (через наш сервер) и даём поиск в VK Видео
  async function showAlt() {
    const id = S?.src?.type === 'yt' && S.src.id;
    if (!id || altFor === id) return;
    altFor = id;
    alt.hidden = false;
    alt.replaceChildren(h('b', { textContent: 'YouTube у тебя не грузится' }), h('p', { textContent: 'Похоже, в твоей сети он замедлен. Ищу это видео на Rutube…' }));
    const r = await fetch('/api/alt?id=' + id).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    // поиск Rutube отвечает только российским адресам — у нашего сервера (США) пусто, пробуем из браузера человека
    // ponytail: зависит от того, разрешает ли Rutube такие запросы с чужих сайтов; не вышло — остаются ссылки на поиск
    let list = r?.rutube || [];
    if (!list.length && r?.title) list = await rutubeSearch(r.title);
    if (altFor !== id || S?.src?.id !== id) return;
    alt.replaceChildren(...[
      h('b', { textContent: 'YouTube у тебя не грузится' }),
      h('p', { textContent: !r?.title ? 'Название ролика узнать не получилось.' : list.length ? `«${r.title}» — нашлось на Rutube, смотрим там?` : `«${r.title}» — на Rutube не нашлось.` }),
      list.length ? h('div', { className: 'talt-list' }, ...list.map((v) => h('button', { type: 'button', className: 'talt-item', onclick: () => {
        const src = parseSource(v.url); if (!src) return;
        alt.hidden = true; publish({ src, playing: true, pos: 0 }); system('переключаемся на Rutube');
      } }, v.thumb ? h('img', { src: v.thumb, alt: '', loading: 'lazy' }) : null, h('span', {}, h('b', { textContent: v.title }), h('small', { textContent: [v.author, v.duration ? clockText(v.duration) : ''].filter(Boolean).join(' · ') }))))) : null,
      h('div', { className: 'talt-row' },
        r?.title && !list.length ? h('a', { href: 'https://rutube.ru/search/?query=' + encodeURIComponent(r.title), target: '_blank', rel: 'noopener', textContent: 'искать на Rutube ↗' }) : null,
        r?.title ? h('a', { href: 'https://vkvideo.ru/?q=' + encodeURIComponent(r.title), target: '_blank', rel: 'noopener', textContent: 'искать в VK Видео ↗' }) : null,
        r?.title ? h('span', { className: 'talt-hint', textContent: 'нашёл — вставь ссылку сверху' }) : null,
        partner() ? h('span', { textContent: 'или пусть партнёр, у кого YouTube открывается, покажет его вкладкой 📺' }) : null,
        h('button', { type: 'button', textContent: 'закрыть', onclick: () => { alt.hidden = true; } }))].filter(Boolean));
  }

  // 20 минут вдвоём → баллы паре
  function countTogether(playing) {
    if (S.playing && playing && watching()) {
      togetherSec += 0.5;
      const key = `${sourceKey(S.src)}:${new Date().toISOString().slice(0, 10)}`;
      if (togetherSec >= TOGETHER && awardedKey !== key) { awardedKey = key; store.award('watch', key); }
    }
  }
  if (/[?&]debug/.test(location.search)) window.__tube = { get P() { return P; }, get S() { return S; }, showAlt }; // ?debug — для проверок
  const loop = setInterval(() => (el.isConnected ? tick() : el.onclose()), 500);

  // ---------- панель: время, шкала ----------
  function drawPanel() {
    if (!el.isConnected) return;
    const d = P?.duration() || 0;
    panel.update({ t: P?.time() || 0, duration: d, playing: !!S?.playing, isLive: !!P?.live, subs: P?.subs ? P.subsOn() : null });
    together.textContent = togetherSec >= 60 ? `смотрим вместе ${Math.floor(togetherSec / 60)} мин ♥` : '';
  }
  const ui = setInterval(drawPanel, 250);
  // клавиши, пока открыт CoupleTube и курсор не в поле ввода
  const keys = (e) => {
    if (!el.isConnected || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); panel.el.querySelector('.tp-btn.big').click(); }
    else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { if (P && S) { e.preventDefault(); e.stopPropagation(); publish({ playing: S.playing, pos: Math.max(0, P.time() + (e.code === 'ArrowRight' ? 10 : -10)) }); } }
    else if (e.code === 'KeyF') tvbox.requestFullscreen?.().catch(() => {});
    else if (e.code === 'KeyM') panel.toggleMute();
    else if (e.code === 'KeyC') panel.toggleSubs();
  };
  addEventListener('keydown', keys, true);
  ensurePlayer();

  // состояние, брошенное «играющим» много часов назад, считаем паузой (у кого-то закрылась вкладка)
  if (S?.playing && store.serverNow() - S.at > 4 * 3600e3) S = { ...S, playing: false };

  let closed = false;
  el.onclose = () => {
    if (closed) return;
    closed = true;
    // ухожу один — ставлю на паузу там, где остановился, чтобы потом продолжить с этого места
    if (P && S?.playing && (!watching() || (S.src.type === 'local' && S.src.host === me.id))) { // свой фильм без меня не покажется
      S = { ...S, playing: false, pos: P.time(), at: store.serverNow(), by: me.id };
      store.put('tube', 'now', S).catch(console.warn);
    }
    clearInterval(loop); clearInterval(ui); clearTimeout(typingT); removeEventListener('keydown', keys, true);
    offs.forEach((f) => f());
    P?.destroy(); P = null; loading = null;
    store.live.track({});
  };
}
