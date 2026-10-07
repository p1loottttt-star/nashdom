// Плееры CoupleTube с одним интерфейсом:
// { type, title(), time(), duration(), playing(), play(), pause(), seek(t), rate(r), volume(v 0..1), destroy(), seekEvents, live, native }
// native=true — у площадки свои кнопки остаются (спрятать нельзя), наша панель управляет поверх.
// on(kind, msg): 'play' | 'pause' | 'seek' | 'error' | 'blocked'. seekEvents=false — перемотку видно только по скачку времени.
const h = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const scripts = {};
const loadScript = (src, ready) => (scripts[src] ||= new Promise((res, rej) => {
  if (ready()) return res();
  document.head.append(h('script', { src, onload: () => res(), onerror: () => rej(new Error('script ' + src)) }));
}));
const frame = (box, src) => {
  const f = h('iframe', { src, allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture', allowFullscreen: true });
  box.append(f);
  return f;
};
// у iframe-плееров время приходит событиями — между ними досчитываем сами
function clock() {
  let t = 0, at = performance.now(), on = false;
  return {
    dur: 0,
    set(time, playing = on) { t = time; at = performance.now(); on = playing; },
    state(playing) { if (playing !== on) { t = this.get(); at = performance.now(); on = playing; } },
    get: () => (on ? t + (performance.now() - at) / 1000 : t),
    playing: () => on,
  };
}
const EMBED_OFF = 'Автор запретил смотреть это видео на других сайтах — выберите другое';

// ---------- YouTube ----------
let ytApi;
const loadYT = () => (ytApi ||= new Promise((res) => {
  if (window.YT?.Player) return res(window.YT);
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
  document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }));
}));

const timeout = (ms, promise, msg) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
async function yt(box, src, on) {
  const YT = await timeout(12000, loadYT(), 'yt api').catch((e) => { on('error', 'YouTube не загружается — похоже, в вашей сети он заблокирован или замедлен'); throw e; });
  const div = h('div');
  box.append(div);
  let p;
  await new Promise((ready) => {
    setTimeout(ready, 15000); // плеер так и не ответил — дальше разберётся tube.js
    p = new YT.Player(div, {
      videoId: src.id, width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, start: src.start || 0, origin: location.origin, controls: 0, fs: 0, iv_load_policy: 3, disablekb: 1 },
      events: {
        onReady: ready,
        onStateChange: (e) => { if (e.data === 1) on('play'); else if (e.data === 2) on('pause'); },
        onError: (e) => on('error', [101, 150, 153].includes(e.data) ? EMBED_OFF : 'YouTube не открыл это видео'),
      },
    });
  });
  return {
    type: 'yt', seekEvents: false,
    state: () => p.getPlayerState?.() ?? -1, // 3 — грузится
    title: () => p.getVideoData?.().title || '',
    time: () => p.getCurrentTime() || 0,
    playing: () => p.getPlayerState() === 1,
    duration: () => p.getDuration() || 0,
    play: () => p.playVideo(), pause: () => p.pauseVideo(), seek: (t) => p.seekTo(t, true), rate: () => {},
    volume: (v) => { p.setVolume(Math.round(v * 100)); if (v > 0) p.unMute(); },
    destroy: () => { p.destroy(); div.remove(); },
  };
}

// ---------- VK Видео (официальный videoplayer.js, нужен js_api=1) ----------
async function vk(box, src, on) {
  await loadScript('https://vk.com/js/api/videoplayer.js', () => window.VK?.VideoPlayer);
  const f = frame(box, `https://vk.com/video_ext.php?oid=${src.oid}&id=${src.id}${src.hash ? '&hash=' + src.hash : ''}&hd=2&js_api=1${src.start ? '&t=' + src.start + 's' : ''}`);
  await new Promise((r) => { f.onload = r; setTimeout(r, 8000); }); // до загрузки iframe первое сообщение API теряется
  const p = window.VK.VideoPlayer(f), c = clock();
  let title = '';
  await new Promise((ready) => {
    p.on('inited', (s) => { title = s.title || ''; ready(); });
    setTimeout(ready, 8000);
  });
  p.on('timeupdate', (s) => { c.set(s.time, s.state === 'playing'); c.dur = s.duration || c.dur; });
  p.on('started', () => { c.state(true); on('play'); });
  p.on('resumed', () => { c.state(true); on('play'); });
  p.on('paused', () => { c.state(false); on('pause'); });
  p.on('ended', () => { c.state(false); on('pause'); });
  p.on('seeked', (s) => { c.set(s.time); on('seek'); });
  p.on('autoplaySoundProhibited', () => on('blocked'));
  p.on('error', () => on('error', 'VK не открыл это видео: оно закрыто или его запретили встраивать'));
  return {
    type: 'vk', seekEvents: true,
    title: () => title,
    time: () => c.get(), playing: () => c.playing(),
    duration: () => c.dur || p.getDuration() || 0, native: true,
    play: () => p.play(), pause: () => p.pause(), seek: (t) => { c.set(t); p.seek(t); }, rate: () => {},
    volume: (v) => (v > 0 ? p.setVolume(v) : p.mute()),
    destroy: () => { p.destroy(); f.remove(); },
  };
}

// ---------- Rutube (postMessage API) ----------
async function rutube(box, src, on) {
  const f = frame(box, `https://rutube.ru/play/embed/${src.id}${src.p ? '?p=' + encodeURIComponent(src.p) : ''}`);
  const c = clock();
  const send = (type, data = {}) => f.contentWindow?.postMessage(JSON.stringify({ type, data }), '*');
  let ready, alive = false;
  const isReady = new Promise((r) => { ready = () => { alive = true; r(); }; setTimeout(r, 8000); });
  const onMsg = (e) => {
    if (e.source !== f.contentWindow) return;
    let m; try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    const d = m?.data || {};
    if (m?.type === 'player:ready') ready();
    else if (m?.type === 'player:currentTime') c.set(d.time);
    else if (m?.type === 'player:durationChange') c.dur = d.duration;
    else if (m?.type === 'player:changeState') {
      if (d.state === 'playing') { c.state(true); on('play'); }
      else if (d.state === 'paused' || d.state === 'stopped') { c.state(false); on('pause'); }
    } else if (m?.type === 'player:error') on('error', 'Rutube не открыл это видео: оно закрыто или его запретили встраивать');
  };
  addEventListener('message', onMsg);
  await isReady;
  if (!alive) on('error', 'Rutube не отвечает: сайт недоступен из вашей сети или видео закрыто');
  if (src.start) send('player:setCurrentTime', { time: src.start });
  return {
    type: 'rutube', seekEvents: false,
    title: () => '',
    time: () => c.get(), playing: () => c.playing(),
    play: () => send('player:play'), pause: () => send('player:pause'),
    seek: (t) => { c.set(t); send('player:setCurrentTime', { time: t }); }, rate: () => {},
    duration: () => c.dur, native: true,
    volume: (v) => send('player:setVolume', { volume: v }),
    destroy: () => { send('player:remove'); removeEventListener('message', onMsg); f.remove(); },
  };
}

// ---------- Twitch (записи с перемоткой; эфир синхронен сам по себе) ----------
async function twitch(box, src, on) {
  await loadScript('https://player.twitch.tv/js/embed/v1.js', () => window.Twitch?.Player);
  const div = h('div');
  box.append(div);
  const T = window.Twitch.Player;
  const p = new T(div, { width: '100%', height: '100%', autoplay: false, parent: [location.hostname], ...(src.video ? { video: 'v' + src.video, time: `${src.start || 0}s` } : { channel: src.channel }) });
  await new Promise((ready) => { p.addEventListener(T.READY, ready); setTimeout(ready, 8000); });
  let going = false; // isPaused() врёт, пока плеер ждёт клика, — верим событиям
  p.addEventListener(T.PLAYING, () => { going = true; on('play'); });
  p.addEventListener(T.PAUSE, () => { going = false; on('pause'); });
  p.addEventListener(T.ENDED, () => { going = false; on('pause'); });
  p.addEventListener(T.SEEK, () => on('seek'));
  p.addEventListener(T.OFFLINE, () => on('error', `${src.channel} сейчас не в эфире`));
  return {
    type: 'twitch', seekEvents: true, live: !src.video,
    title: () => src.channel || '',
    time: () => p.getCurrentTime() || 0,
    playing: () => going && !p.isPaused(),
    duration: () => p.getDuration() || 0, native: true,
    play: () => p.play(), pause: () => p.pause(), seek: (t) => p.seek(t), rate: () => {},
    volume: (v) => { p.setMuted(v === 0); if (v > 0) p.setVolume(v); },
    destroy: () => div.remove(),
  };
}

// ---------- Vimeo (официальный player.js) ----------
async function vimeo(box, src, on) {
  await loadScript('https://player.vimeo.com/api/player.js', () => window.Vimeo?.Player);
  const div = h('div');
  box.append(div);
  const p = new window.Vimeo.Player(div, { url: `https://vimeo.com/${src.id}${src.h ? '/' + src.h : ''}`, responsive: false, width: 640 });
  const c = clock();
  let title = '';
  await p.ready().catch(() => on('error', 'Vimeo не открыл это видео: оно закрыто или его запретили встраивать'));
  p.getVideoTitle().then((t) => { title = t; }).catch(() => {});
  if (src.start) p.setCurrentTime(src.start).catch(() => {});
  p.on('timeupdate', (d) => { c.set(d.seconds); c.dur = d.duration || c.dur; });
  p.on('play', () => { c.state(true); on('play'); });
  p.on('pause', () => { c.state(false); on('pause'); });
  p.on('ended', () => { c.state(false); on('pause'); });
  p.on('seeked', (d) => { c.set(d.seconds); on('seek'); });
  return {
    type: 'vimeo', seekEvents: true,
    title: () => title,
    time: () => c.get(), playing: () => c.playing(),
    play: () => p.play().catch((e) => e.name === 'NotAllowedError' && on('blocked')), pause: () => p.pause().catch(() => {}),
    seek: (t) => { c.set(t); p.setCurrentTime(t).catch(() => {}); },
    rate: (r) => p.setPlaybackRate(r).catch(() => {}),
    duration: () => c.dur, native: true,
    volume: (v) => p.setVolume(v).catch(() => {}),
    destroy: () => { p.destroy().catch(() => {}); div.remove(); },
  };
}

// ---------- файл по ссылке: mp4/webm/HLS, Dropbox, Яндекс Диск ----------
export async function file(box, src, on) {
  let url = src.url;
  if (src.yadisk) { // у публичной ссылки Диска прямой адрес временный — берём свежий у API
    const r = await fetch('https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=' + encodeURIComponent(src.url)).then((x) => x.json()).catch(() => null);
    if (!r?.href) { on('error', 'Яндекс Диск не отдал файл: проверьте, что ссылка публичная и ведёт на видеофайл'); throw new Error('yadisk'); }
    url = r.href;
  }
  const v = h('video', { playsInline: true, preload: 'auto' }); // кнопки — наша панель
  box.append(v);
  let hls = null;
  if (src.hls && !v.canPlayType('application/vnd.apple.mpegurl')) {
    const { default: Hls } = await import('https://cdn.jsdelivr.net/npm/hls.js@1/+esm');
    hls = new Hls();
    hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) on('error', 'Поток не открылся — ссылка устарела или закрыта'); });
    hls.loadSource(url); hls.attachMedia(v);
  } else v.src = url;
  v.onplay = () => on('play'); v.onpause = () => on('pause');
  v.onseeking = () => on('seek'); // seeking, а не seeked: иначе подгонка успеет откатить перемотку, пока грузится кусок
  v.onerror = () => on('error', v.error?.code === 4 ? 'Браузер не может играть этот файл: нужен mp4 (H.264 + AAC) или webm' : 'Видео не открылось — проверьте ссылку');
  return {
    type: 'file', seekEvents: true, el: v,
    title: () => (src.yadisk ? 'Яндекс Диск' : decodeURIComponent(src.url.split('/').pop().split('?')[0])),
    time: () => v.currentTime,
    playing: () => !v.paused,
    play: () => v.play().catch((e) => e.name === 'NotAllowedError' && on('blocked')),
    pause: () => v.pause(),
    seek: (t) => { v.currentTime = t; },
    rate: (r) => { if (Math.abs(v.playbackRate - r) > 0.004) v.playbackRate = r; },
    duration: () => (Number.isFinite(v.duration) ? v.duration : 0),
    volume: (x) => { v.volume = x; v.muted = x === 0; },
    destroy: () => { hls?.destroy(); v.removeAttribute('src'); v.load(); v.remove(); },
  };
}

// свой файл: у хозяина играет сам файл, у партнёра — живой эфир (localcast.js)
const local = (box, src, on) => import('./localcast.js').then((m) => m.localPlayer(box, src, on));
const MAKERS = { yt, vk, rutube, twitch, vimeo, file, local };
export const createPlayer = (box, src, on) => (MAKERS[src.type] || file)(box, src, on);
