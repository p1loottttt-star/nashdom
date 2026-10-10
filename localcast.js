// «Свой фильм» и «показать вкладку»: у того, кто показывает, играет файл (или его вкладка), партнёру — живой эфир напрямую, WebRTC.
// Договариваются через живой канал пары (store.live 'cast'); сервер видео не видит, файл никуда не загружается.
import * as store from './store.js';
import { file as filePlayer } from './players.js';
import { watchCast } from './caststats.js';
import { badAudio, fixAudio } from './audiofix.js';

const h = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const files = new Map(); // sid → File; живёт только в этой вкладке
// ponytail: только STUN — при строгом NAT (≈10–20% сетей) соединения не будет; нужен TURN-ретранслятор
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
// Opus по умолчанию почти «телефонный» — для кино просим стерео и 256 кбит/с
const hifi = (sdp) => sdp.replace(/^a=fmtp:\d+ [^\r\n]*useinbandfec=1[^\r\n]*/gm, (l) => (l.includes('stereo=1') ? l : l + ';stereo=1;sprop-stereo=1;maxaveragebitrate=256000'));
// отладка стендом tests/perf/cast.mjs: ?castcodec=vp8|h264  ?castdeg=balanced|maintain-resolution|maintain-framerate
// ?castmax=1500 — потолок в кбит/с (на стенде изображает узкий канал)
const Q = new URLSearchParams(location.search), CODEC = Q.get('castcodec') || 'av1', DEG = Q.get('castdeg') || 'balanced', CAP = +Q.get('castmax') * 1000 || 0;
// старт оценки канала с 1,2 Мбит/с вместо ~0,3: иначе первые ~10 с эфир идёт в 480p, пока «разгоняется» (замер 11.10)
const fastStart = (sdp) => { const [head, ...ms] = sdp.split(/(?=^m=)/m); return head + ms.map((m) => (m.startsWith('m=video') ? m.replace(/^a=fmtp:\d+ [^\r\n]*/gm, (l) => (l.includes('x-google-start-bitrate') ? l : l + ';x-google-start-bitrate=1200')) : m)).join(''); };
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
  let pc = null, last = null;
  async function connect(to) {
    last = to;
    pc?.close();
    const cur = pc = new RTCPeerConnection({ iceServers: ICE });
    cur.onicecandidate = (e) => e.candidate && send({ sid: src.sid, to, type: 'ice', cand: e.candidate.toJSON() });
    watchCast(cur, { role: 'host', sid: src.sid, video });
    const list = await tracks();
    for (const t of list.tracks) { if (t.kind === 'video') t.contentHint = 'motion'; cur.addTrack(t, list.stream); }
    if (cur !== pc) return;
    // AV1 первым: при том же битрейте заметно чище H.264 (у Вани канал ~1,5 Мбит/с — замер 11.10); кодирование 720p ≈13 мс.
    // Не умеет браузер партнёра — договорятся на H.264 (он вторым, его декодер есть у всех)
    for (const tr of cur.getTransceivers()) {
      if (tr.sender.track?.kind !== 'video' || !tr.setCodecPreferences) continue;
      const cs = RTCRtpSender.getCapabilities('video')?.codecs || [];
      const want = { vp8: /vp8/i, vp9: /vp9/i, av1: /av1/i }[CODEC] || /h264/i;
      const rank = (c) => (want.test(c.mimeType) ? (/packetization-mode=1/.test(c.sdpFmtpLine || '') ? 0 : 1) : /h264/i.test(c.mimeType) ? (/packetization-mode=1/.test(c.sdpFmtpLine || '') ? 2 : 3) : /vp8/i.test(c.mimeType) ? 4 : 5);
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
    prm.encodings = (prm.encodings?.length ? prm.encodings : [{}]).map((e) => ({ ...e, maxBitrate: CAP || (height > 800 ? 7_000_000 : 4_500_000), maxFramerate: 30 }));
    prm.degradationPreference = DEG;
    s.setParameters(prm).catch(() => {});
  });
  const off = store.live.on('cast', async (m) => {
    if (m.sid !== src.sid || m.to !== me) return;
    try {
      if (m.type === 'want') await connect(m.from);
      else if (m.type === 'answer' && pc) { await pc.setRemoteDescription({ type: 'answer', sdp: fastStart(hifi(m.sdp)) }); tune(pc); }
      else if (m.type === 'ice' && pc) await pc.addIceCandidate(m.cand).catch(() => {});
      else if (m.type === 'bye') { pc?.close(); pc = null; } // зритель смотрит свой экземпляр файла — эфир не нужен
    } catch (e) { console.warn('cast', e); }
  });
  send({ sid: src.sid, to: '*', type: 'hello' });
  const stop = () => { off(); pc?.close(); };
  stop.renew = () => last && connect(last).catch(console.warn); // дорожки поменялись — новое предложение тому же зрителю
  return stop;
}

// ---------- у того, кто показывает файл: обычный плеер файла + раздача эфира ----------
async function host(box, src, on) {
  const f = files.get(src.sid);
  if (!f) { on('error', 'Фильм выбирали на другой вкладке или страницу перезагрузили — выбери файл ещё раз (📁)'); throw new Error('no file'); }
  const url = URL.createObjectURL(f);
  const p = await filePlayer(box, { url, hls: false }, on);
  const v = p.el;
  // звук, который браузер не декодирует (AC3/DTS в скачанных .mkv), — переводим на лету (audiofix.js)
  const note = (t) => on('note', t);
  let fix = (await badAudio(f).catch(() => null)) ? fixAudio(v, f, note) : null;
  let cap = null;
  const stop = broadcast(src, async () => { // у captureStream дорожки появляются, когда видео загрузилось
    cap ||= (v.captureStream || v.mozCaptureStream).call(v);
    for (let i = 0; i < 40 && !cap.getVideoTracks().length; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 150)); // звук приходит чуть позже картинки
    if (fix) return { stream: cap, tracks: [...cap.getVideoTracks(), ...fix.stream.getAudioTracks()] };
    return { stream: cap, tracks: cap.getTracks() };
  }, v);
  // время и длительность для шкалы у партнёра
  const pos = () => send({ sid: src.sid, to: '*', type: 'pos', t: v.currentTime, d: v.duration || 0, playing: !v.paused });
  const beat = setInterval(pos, 1000);
  for (const e of ['play', 'pause', 'seeked']) v.addEventListener(e, pos); // пауза и перемотка — партнёру сразу, а не через секунду
  // запасной путь: по заголовку не распознали, а звук так и не декодируется — тоже переводим, эфир переподключаем со звуком
  let checked = !!fix;
  v.addEventListener('timeupdate', () => {
    if (checked || v.currentTime < 3 || !('webkitAudioDecodedByteCount' in v)) return;
    checked = true;
    if (v.webkitAudioDecodedByteCount === 0) { fix = fixAudio(v, f, note); stop.renew(); }
  });
  return {
    ...p,
    type: 'file', title: () => f.name,
    destroy() { clearInterval(beat); stop(); fix?.destroy(); p.destroy(); URL.revokeObjectURL(url); },
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
  let own = null, ownFix = null, ownUrl = '', ownSync = 0;
  const ask = () => own || send({ sid: src.sid, to: src.host, type: 'want' });
  const hostTime = () => (going ? t + (performance.now() - at) / 1000 : t);
  // тот же фильм есть и у меня: играю свой файл в оригинальном качестве, держусь за время показывающего; эфир отключаю
  const pickOwn = src.mode === 'screen' ? null : h('input', { type: 'file', accept: 'video/*,.mkv,.avi,.mov,.m4v', hidden: true });
  const ownBtn = pickOwn && h('button', { type: 'button', className: 'town', textContent: '📁 у меня тоже есть этот фильм', title: 'смотреть свой файл в оригинальном качестве, в такт с партнёром' });
  if (ownBtn) { ownBtn.append(pickOwn); ownBtn.onclick = (e) => e.target === ownBtn && pickOwn.click(); box.append(ownBtn); }
  if (pickOwn) pickOwn.onchange = async () => {
    const f = pickOwn.files[0]; pickOwn.value = ''; if (!f) return;
    const info = await probe(f);
    if (!info.ok) return on('note', 'Этот файл браузер не открывает — остаёмся на эфире');
    if (dur && Math.abs(info.dur - dur) > 3) on('note', `Твой файл длиннее или короче на ${Math.round(Math.abs(info.dur - dur))} с — это может быть другая версия, и время чуть съедет`);
    own?.remove(); ownFix?.destroy(); if (ownUrl) URL.revokeObjectURL(ownUrl);
    own = h('video', { playsInline: true, preload: 'auto', src: (ownUrl = URL.createObjectURL(f)) });
    own.volume = v.volume; own.muted = v.muted;
    box.insertBefore(own, v); v.hidden = true; v.muted = true; wait.remove(); ownBtn.remove();
    send({ sid: src.sid, to: src.host, type: 'bye' }); pc?.close(); pc = null; v.srcObject = null;
    ownFix = (await badAudio(f).catch(() => null)) ? fixAudio(own, f, (x) => on('note', x)) : null;
    on('note', 'Смотришь свой файл в оригинальном качестве — время и пауза общие с партнёром ✓');
    clearInterval(ownSync);
    // держимся за время показывающего: далеко — перемотка, близко — чуть быстрее/медленнее (незаметно)
    ownSync = setInterval(() => {
      if (!own) return;
      const want = hostTime(), d = want - own.currentTime;
      if (going && own.paused) own.play().catch((er) => er.name === 'NotAllowedError' && on('blocked'));
      if (!going && !own.paused) own.pause();
      if (Math.abs(d) > 0.6) { own.currentTime = want + (going ? 0.15 : 0); own.playbackRate = 1; }
      else own.playbackRate = going ? 1 + Math.max(-0.05, Math.min(0.05, d * 0.5)) : 1;
    }, 250);
  };

  const off = store.live.on('cast', async (m) => {
    if (m.sid !== src.sid || (m.to !== me && m.to !== '*')) return;
    try {
      if (m.type === 'hello') ask();
      else if (own && m.type === 'offer') return; // смотрю свой файл — эфир не принимаю
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
    if (!own && st !== 'connected' && st !== 'connecting' && Date.now() - gotOffer > 6000) ask();
  }, 3000);
  return {
    type: 'local', follower: true, seekEvents: true, live: src.mode === 'screen',
    title: () => src.name,
    time: hostTime,
    duration: () => dur,
    playing: () => going && !(own || v).paused,
    blocked: () => (own ? going && own.paused : !!v.srcObject && v.paused), // эфир пришёл, но браузер не дал включить звук без клика
    play: () => (own || v).play().catch(() => {}), pause: () => {}, seek: () => {}, rate: () => {},
    volume: (x) => { for (const e of [v, own]) if (e) { e.volume = x; e.muted = x === 0; } if (own) v.muted = true; },
    destroy() {
      clearInterval(retry); clearInterval(ownSync); off(); pc?.close(); v.srcObject = null; v.remove(); wait.remove(); ownBtn?.remove();
      ownFix?.destroy(); own?.remove(); if (ownUrl) URL.revokeObjectURL(ownUrl);
    },
  };
}
