// Звук скачанных фильмов, который Chrome не декодирует (AC3, E-AC3, DTS, TrueHD в .mkv/.mp4):
// ffmpeg.wasm читает дорожку прямо из файла (WORKERFS — без копирования в память), кусками по 20 с на опережение,
// переводит в обычный звук, и он играет через WebAudio в такт с видео. Видео — ведущее: разошлись больше чем на 0,15 с — звук перезапускается с места видео.
// Тот же звук уходит в эфир партнёру (stream — дорожка MediaStreamDestination).
import { audio } from './sound.js';

const BAD = ['A_AC3', 'A_EAC3', 'A_DTS', 'A_TRUEHD', 'A_MLP', 'ac-3', 'ec-3', 'dtsc', 'dtsh', 'dtsl', 'mlpa'];
const GOOD = ['A_AAC', 'A_OPUS', 'A_VORBIS', 'A_MPEG/L3', 'A_FLAC', 'mp4a', 'Opus', 'fLaC'];
// ponytail: ядро ffmpeg (~31 МБ) с jsdelivr, закреплено на версии; браузер кэширует. Положить к себе — если CDN станет проблемой
const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const D = 10, RATE = 48000, LAT = 0.08; // кусок 10 с ≈ 1 с работы ffmpeg (замер 11.10 на 4,5-ГБ mkv)

// какой звук в файле: ищем коды дорожек в начале и конце (заголовок mkv — в начале, moov у mp4 бывает в конце)
export async function badAudio(file) {
  const read = async (a, b) => new TextDecoder('latin1').decode(await file.slice(Math.max(0, a), b).arrayBuffer());
  const text = (await read(0, 4 << 20)) + (file.size > 6 << 20 ? await read(file.size - (2 << 20), file.size) : '');
  if (GOOD.some((m) => text.includes(m))) return null; // есть дорожка, которую браузер понимает, — он её и выберет
  return BAD.find((m) => text.includes(m)) || null;
}

// скачать в blob: URL с прогрессом (toBlobURL из @ffmpeg/util падает, когда CDN отдаёт сжатое и длина не сходится)
async function blobURL(url, type, progress, size = 32.1e6) {
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`);
  const rd = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; progress?.(Math.min(0.99, got / size)); }
  return URL.createObjectURL(new Blob(parts, { type }));
}

let loading = null;
function loadFF(progress) {
  return (loading ||= (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ff = new FFmpeg();
    await ff.load({ coreURL: await blobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await blobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm', progress) });
    return ff;
  })().catch((e) => { loading = null; throw e; }));
}

export function fixAudio(v, file, note) {
  const { ctx } = audio();
  const gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
  gain.connect(ctx.destination); gain.connect(dest);
  const vol = () => { gain.gain.value = v.muted ? 0 : v.volume; };
  vol();
  let ff = null, dir = '', name = '', dead = false, gen = 0, srcs = [], anchor = null, queue = Promise.resolve();
  const chunks = new Map(); // номер куска → Promise<AudioBuffer>

  // один ffmpeg — по очереди; кусок k = [k·20 с, (k+1)·20 с), стыкуется с соседним до сэмпла
  const stat = (window.__afix = { ms: [], exec: [], restarts: 0, drift: [] }); // отладка: сколько мс уходит на кусок 20 с, сколько раз сверка перезапускала звук
  const decode = (k) => (queue = queue.then(async () => {
    const t0 = performance.now(), out = `/a${k}.raw`;
    // -probesize/-analyzeduration: без них ffmpeg каждый раз ~3 с «принюхивается» к файлу
    await ff.exec(['-hide_banner', '-nostdin', '-probesize', '1000000', '-analyzeduration', '0', '-ss', String(k * D), '-i', `${dir}/${name}`, '-t', String(D), '-map', '0:a:0', '-vn', '-ac', '2', '-ar', String(RATE), '-f', 'f32le', out]);
    stat.exec.push(Math.round(performance.now() - t0));
    const raw = await ff.readFile(out); ff.deleteFile(out).catch(() => {});
    const f = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2), n = f.length >> 1;
    const buf = ctx.createBuffer(2, Math.max(1, n), RATE), L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
    stat.ms.push(Math.round(performance.now() - t0));
    return buf;
  }));
  const get = (k) => {
    if (!chunks.has(k)) chunks.set(k, decode(k).catch((e) => { chunks.delete(k); throw e; }));
    for (const j of chunks.keys()) if (j < k - 1 || j > k + 2) chunks.delete(j); // в памяти — только соседние куски
    return chunks.get(k);
  };
  const stop = () => { gen++; for (const s of srcs) { try { s.stop(); } catch {} } srcs = []; anchor = null; };

  // играть с места видео: первый кусок — со смещения, дальше цепочкой, каждый следующий заранее
  async function play() {
    stop();
    if (!ff || v.paused || dead) return;
    const my = gen;
    try {
      let k = Math.floor(v.currentTime / D), buf = await get(k);
      for (;;) { // пока резали кусок, видео ушло дальше
        if (my !== gen) return;
        const at = ctx.currentTime + LAT, pos = v.currentTime + LAT * v.playbackRate, kk = Math.floor(pos / D);
        if (kk !== k) { k = kk; buf = await get(k); continue; }
        anchor = { pos, at, rate: v.playbackRate };
        chain(my, k, buf, at, pos - k * D);
        return;
      }
    } catch (e) { if (my === gen) note?.('Звук не получилось перевести: ' + (e.message || e)); }
  }
  function chain(my, k, buf, at, off) {
    const s = ctx.createBufferSource();
    s.buffer = buf; s.playbackRate.value = anchor.rate; s.connect(gain);
    s.start(at, Math.max(0, off));
    srcs.push(s); s.onended = () => { srcs = srcs.filter((x) => x !== s); };
    const end = at + (buf.duration - off) / anchor.rate;
    if (k * D + buf.duration >= (v.duration || Infinity) - 0.05) return; // конец фильма
    // следующий кусок режем сразу (≈1 с), а ставим в очередь за 5 с до стыка — так впереди всегда 1–2 куска, а не весь фильм
    const next = get(k + 1);
    setTimeout(() => next.then((b) => { if (my !== gen) return; if (end > ctx.currentTime + 0.01) chain(my, k + 1, b, end, 0); else play(); }).catch(() => {}), Math.max(0, (end - ctx.currentTime - 5) * 1000));
  }
  // сверка с видео: разошлись — перезапуск с места видео (часы видео и звуковой карты немного разные)
  // разовый рывок (нагрузка) не повод повторять слова: перезапуск, только если расхождение держится дольше секунды
  let off = 0;
  const watch = setInterval(() => {
    if (!anchor || v.paused) { off = 0; return; }
    const d = v.currentTime - (anchor.pos + (ctx.currentTime - anchor.at) * anchor.rate);
    off = Math.abs(d) > 0.25 ? off + 1 : 0;
    if (off >= 3) { off = 0; stat.restarts++; stat.drift.push([Math.round(v.currentTime), Math.round(d * 1000)]); play(); }
  }, 500);
  let rateT = 0;
  const on = { playing: play, pause: stop, waiting: stop, seeking: stop, seeked: play, volumechange: vol, ratechange: () => { clearTimeout(rateT); rateT = setTimeout(play, 300); } };
  for (const [e, f] of Object.entries(on)) v.addEventListener(e, f);

  (async () => {
    note?.('Звук этого файла браузер сам не понимает — перевожу его на лету. Первый раз грузится переводчик (~30 МБ)…');
    let last = 0;
    ff = await loadFF((k) => { const p = Math.round(k * 100); if (p >= last + 25 && p < 100) { last = p; note?.(`переводчик звука: ${p}%`); } });
    if (dead) return;
    dir = '/f' + Date.now(); name = file.name;
    await ff.createDir(dir);
    await ff.mount('WORKERFS', { files: [file] }, dir);
    note?.('Звук включён ✓');
    play();
  })().catch((e) => { console.warn(e); note?.('Не получилось включить звук этого файла. Подойдёт mp4 со звуком AAC.'); });

  return {
    stream: dest.stream,
    destroy() {
      dead = true; stop(); clearInterval(watch);
      for (const [e, f] of Object.entries(on)) v.removeEventListener(e, f);
      gain.disconnect();
      if (ff && dir) ff.unmount(dir).then(() => ff.deleteDir(dir)).catch(() => {});
    },
  };
}
