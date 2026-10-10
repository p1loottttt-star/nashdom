// «Свой фильм» и «показать вкладку»: у того, кто показывает, играет файл (или его вкладка), партнёру — живой эфир напрямую, WebRTC.
// Договариваются через живой канал пары (store.live 'cast'); сервер видео не видит, файл никуда не загружается.
import * as store from './store.js';
import { file as filePlayer } from './players.js';
import { watchCast } from './caststats.js';

const h = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const files = new Map(); // sid → File; живёт только в этой вкладке
// ponytail: только STUN — при строгом NAT (≈10–20% сетей) соединения не будет; нужен TURN-ретранслятор
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
// Opus по умолчанию почти «телефонный» — для кино просим стерео и 256 кбит/с
const hifi = (sdp) => sdp.replace(/^(a=fmtp:\d+ .*useinbandfec=1.*?)\r?$/gm, (l) => (l.includes('stereo=1') ? l : l + ';stereo=1;sprop-stereo=1;maxaveragebitrate=256000'));
// отладка стендом tests/perf/cast.mjs: ?castcodec=vp8|h264  ?castdeg=balanced|maintain-resolution|maintain-framerate
const Q = new URLSearchParams(location.search), CODEC = Q.get('castcodec') || 'h264', DEG = Q.get('castdeg') || 'balanced';
const send = (m) => store.live.send('cast', { ...m, from: store.me().id });

export function shareFile(file) { const sid = store.uid(); files.set(sid, file); return sid; }

// открывается ли файл в этом браузере и сколько он длится — до того, как звать партнёра
export function probe(file) {
  return new Promise((done) => {
    const v = h('video', { preload: 'metadata', muted: true }), url = URL.createObjectURL(file);
    const end = (r) => { URL.revokeObjectURL(url); v.removeAttribute('src'); done(r); };
    v.onloadedmetadata = () => end({ ok: true, dur: v.duration, w: v.videoWidth });
    v.onerror = () => end({ ok: false });
    setTimeout(() => end({ ok: false }), 15000);
    v.src = url;
  });
}

export const localPlayer = (box, src, on) => (src.host === store.me().id ? (src.mode === 'screen' ? screenHost : host)(box, src, on) : viewer(box, src, on));

// «показать вкладку»: браузер спрашивает, какую вкладку (со звуком) отдать партнёру
const screens = new Map(); // sid → MediaStream
export async function shareTab() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: 30 }, audio: true,
    preferCurrentTab: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include',
  });
  const sid = store.uid();
  screens.set(sid, stream);
  return { sid, stream, label: stream.getVideoTracks()[0]?.label || 'вкладка' };
}

// раздача эфира партнёру: tracks() — откуда брать картинку и звук; один зритель — одно соединение
function broadcast(src, tracks, video) {
  const me = store.me().id;
  let pc = null;
  async function connect(to) {
    pc?.close();
    const cur = pc = new RTCPeerConnection({ iceServers: ICE });
    cur.onicecandidate = (e) => e.candidate && send({ sid: src.sid, to, type: 'ice', cand: e.candidate.toJSON() });
    watchCast(cur, { role: 'host', sid: src.sid, video });
    const list = await tracks();
    for (const t of list.tracks) { if (t.kind === 'video') t.contentHint = 'motion'; cur.addTrack(t, list.stream); }
    if (cur !== pc) return;
    // H.264 первым: на ноутбуках его обычно кодирует видеокарта (VP8 — процессор), декодер есть у всех браузеров
    for (const tr of cur.getTransceivers()) {
      if (tr.sender.track?.kind !== 'video' || !tr.setCodecPreferences) continue;
      const cs = RTCRtpSender.getCapabilities('video')?.codecs || [];
      const want = CODEC === 'vp8' ? /vp8/i : /h264/i;
      const rank = (c) => (want.test(c.mimeType) ? (/packetization-mode=1/.test(c.sdpFmtpLine || '') ? 0 : 1) : /vp8|h264/i.test(c.mimeType) ? 2 : 3);
      try { tr.setCodecPreferences([...cs].sort((a, b) => rank(a) - rank(b))); } catch {}
    }
    const offer = await cur.createOffer();
    offer.sdp = hifi(offer.sdp);
    await cur.setLocalDescription(offer);
    send({ sid: src.sid, to, type: 'offer', sdp: offer.sdp });
  }
  // качество: потолок по размеру картинки (720p — 4,5 Мбит/с, 1080p — 7), при слабом канале проседает
  // и разрешение, и частота понемногу ('balanced'), а не одни кадры — иначе в кино фризы (замер 10.10, tests/perf/cast.mjs)
  const tune = (cur) => cur.getSenders().forEach((s) => {
    if (s.track?.kind !== 'video') return;
    const { height = 720 } = s.track.getSettings?.() || {};
    const prm = s.getParameters();
    prm.encodings = (prm.encodings?.length ? prm.encodings : [{}]).map((e) => ({ ...e, maxBitrate: height > 800 ? 7_000_000 : 4_500_000, maxFramerate: 30 }));
    prm.degradationPreference = DEG;
    s.setParameters(prm).catch(() => {});
  });
  const off = store.live.on('cast', async (m) => {
    if (m.sid !== src.sid || m.to !== me) return;
    try {
      if (m.type === 'want') await connect(m.from);
      else if (m.type === 'answer' && pc) { await pc.setRemoteDescription({ type: 'answer', sdp: hifi(m.sdp) }); tune(pc); }
      else if (m.type === 'ice' && pc) await pc.addIceCandidate(m.cand).catch(() => {});
    } catch (e) { console.warn('cast', e); }
  });
  send({ sid: src.sid, to: '*', type: 'hello' });
  return () => { off(); pc?.close(); };
}

// ---------- у того, кто показывает файл: обычный плеер файла + раздача эфира ----------
async function host(box, src, on) {
  const f = files.get(src.sid);
  if (!f) { on('error', 'Фильм выбирали на другой вкладке или страницу перезагрузили — выбери файл ещё раз (📁)'); throw new Error('no file'); }
  const url = URL.createObjectURL(f);
  const p = await filePlayer(box, { url, hls: false }, on);
  const v = p.el;
  let cap = null;
  const stop = broadcast(src, async () => { // у captureStream дорожки появляются, когда видео загрузилось
    cap ||= (v.captureStream || v.mozCaptureStream).call(v);
    for (let i = 0; i < 40 && !cap.getVideoTracks().length; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 150)); // звук приходит чуть позже картинки
    return { stream: cap, tracks: cap.getTracks() };
  }, v);
  // время и длительность для шкалы у партнёра
  const beat = setInterval(() => send({ sid: src.sid, to: '*', type: 'pos', t: v.currentTime, d: v.duration || 0, playing: !v.paused }), 1000);
  // Chrome молча играет файл без звука, если звук в AC3/DTS, — предупредим
  let warned = false;
  v.addEventListener('timeupdate', () => {
    if (warned || v.currentTime < 3 || !('webkitAudioDecodedByteCount' in v)) return;
    warned = true;
    if (v.webkitAudioDecodedByteCount === 0) on('error', 'Звук в этом файле браузер не понимает (обычно AC3/DTS в .mkv) — фильм пойдёт без звука. Подойдёт mp4 со звуком AAC.');
  });
  return {
    ...p,
    type: 'file', title: () => f.name,
    destroy() { clearInterval(beat); stop(); p.destroy(); URL.revokeObjectURL(url); },
  };
}

// ---------- у того, кто показывает вкладку: превью без звука (иначе эхо) + раздача ----------
async function screenHost(box, src, on) {
  const stream = screens.get(src.sid);
  if (!stream || !stream.active) { on('error', 'Показ вкладки закончился — нажми 📺 ещё раз'); throw new Error('no screen'); }
  const v = h('video', { playsInline: true, autoplay: true, muted: true, srcObject: stream });
  box.append(v);
  const stop = broadcast(src, async () => ({ stream, tracks: stream.getTracks() }));
  stream.getVideoTracks()[0]?.addEventListener('ended', () => on('error', 'Показ вкладки остановлен'));
  return {
    type: 'screen', live: true, seekEvents: true,
    title: () => src.name, time: () => 0, duration: () => 0, playing: () => stream.active,
    play: () => {}, pause: () => {}, seek: () => {}, rate: () => {}, volume: () => {},
    destroy() { stop(); stream.getTracks().forEach((t) => t.stop()); screens.delete(src.sid); v.remove(); },
  };
}

// ---------- у партнёра: принимает эфир; время и пауза — у того, кто показывает ----------
async function viewer(box, src, on) {
  const me = store.me().id;
  const v = h('video', { playsInline: true, autoplay: true });
  const wait = h('div', { className: 'tempty', textContent: `подключаюсь к фильму «${src.name}»…` });
  box.append(v, wait);
  let pc = null, gotOffer = 0, t = 0, at = performance.now(), going = false, dur = src.dur || 0;
  const ask = () => send({ sid: src.sid, to: src.host, type: 'want' });

  const off = store.live.on('cast', async (m) => {
    if (m.sid !== src.sid || (m.to !== me && m.to !== '*')) return;
    try {
      if (m.type === 'hello') ask();
      else if (m.type === 'pos') { t = m.t; at = performance.now(); going = m.playing; dur = m.d || dur; }
      else if (m.type === 'offer') {
        gotOffer = Date.now();
        pc?.close();
        const cur = pc = new RTCPeerConnection({ iceServers: ICE });
        watchCast(cur, { role: 'viewer', sid: src.sid, video: v });
        cur.ontrack = (e) => {
          // буфер приёма 0,8 с вместо ~0,03: кино не разговор, задержка не мешает, а скачки сети сглаживаются
          try { if ('jitterBufferTarget' in e.receiver) e.receiver.jitterBufferTarget = 800; else e.receiver.playoutDelayHint = 0.8; } catch {}
          if (v.srcObject === e.streams[0]) return;
          v.srcObject = e.streams[0];
          v.play().catch((er) => er.name === 'NotAllowedError' && on('blocked'));
        };
        cur.onicecandidate = (e) => e.candidate && send({ sid: src.sid, to: src.host, type: 'ice', cand: e.candidate.toJSON() });
        cur.onconnectionstatechange = () => {
          if (cur.connectionState === 'connected') wait.remove();
          if (cur.connectionState === 'failed') on('error', 'Не получилось соединиться напрямую — похоже, строгий роутер или VPN. Попробуйте без VPN или с другой сети.');
        };
        await cur.setRemoteDescription({ type: 'offer', sdp: m.sdp });
        const ans = await cur.createAnswer();
        ans.sdp = hifi(ans.sdp);
        await cur.setLocalDescription(ans);
        send({ sid: src.sid, to: src.host, type: 'answer', sdp: ans.sdp });
      } else if (m.type === 'ice' && pc) await pc.addIceCandidate(m.cand).catch(() => {});
    } catch (e) { console.warn('cast', e); }
  });
  ask();
  // показывающий мог открыть CoupleTube позже или переподключиться — напоминаем о себе, пока нет эфира
  const retry = setInterval(() => {
    const st = pc?.connectionState;
    if (st !== 'connected' && st !== 'connecting' && Date.now() - gotOffer > 6000) ask();
  }, 3000);
  return {
    type: 'local', follower: true, seekEvents: true, live: src.mode === 'screen',
    title: () => src.name,
    time: () => (going ? t + (performance.now() - at) / 1000 : t),
    duration: () => dur,
    playing: () => going && !v.paused,
    blocked: () => !!v.srcObject && v.paused, // эфир пришёл, но браузер не дал включить звук без клика
    play: () => v.play().catch(() => {}), pause: () => {}, seek: () => {}, rate: () => {},
    volume: (x) => { v.volume = x; v.muted = x === 0; },
    destroy() { clearInterval(retry); off(); pc?.close(); v.srcObject = null; v.remove(); wait.remove(); },
  };
}
