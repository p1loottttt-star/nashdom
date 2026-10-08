// Все звуки синтезируются WebAudio — без файлов. Контекст создаётся заранее (prepareAudio), запускается на первом касании (так требуют браузеры).
let ctx = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('lr:muted') === '1'; } catch {}

const rnd = Math.random;

// создать контекст — дорого (~70–110 мс: открытие звукового устройства), запустить — бесплатно.
// Создаём заранее, за заставкой (prepareAudio), а на первом касании только запускаем — клик не подвисает
function make() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  }
  return ctx;
}
function ac() {
  make();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const prepareAudio = () => { try { make(); } catch (e) { console.warn(e); } };
addEventListener('pointerdown', ac, { once: true });
// общий контекст и выход для других звуков (радио, lofi.js)
export const audio = () => (ac(), { ctx, master, noiseBuf });

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('lr:muted', muted ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  return muted;
}

// короткий кусок шума через фильтр с огибающей
function noise(t, dur, { type = 'bandpass', f = 2000, f2, q = 1, gain = 0.2, attack = 0.004 } = {}) {
  const c = ac(), src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(master);
  src.start(t, rnd() * 1.5, dur + 0.05);
}

function tone(t, dur, { type = 'sine', f = 440, f2, gain = 0.2, attack = 0.005 } = {}) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const now = () => ac().currentTime;

// бумага сминается: много сухих щелчков
export function crumple(len = 0.8) {
  if (muted) return;
  const t = now();
  for (let i = 0; i < 46; i++) noise(t + rnd() * len, 0.01 + rnd() * 0.035, { f: 1500 + rnd() * 4500, q: 0.8 + rnd() * 2.5, gain: 0.05 + rnd() * 0.22 });
  noise(t, len, { type: 'highpass', f: 3000, gain: 0.03, attack: 0.1 });
}

// лист разворачивается: мягче, ниже, с шелестом
export function unfold(len = 1) {
  if (muted) return;
  const t = now();
  for (let i = 0; i < 22; i++) noise(t + rnd() * len, 0.03 + rnd() * 0.07, { f: 800 + rnd() * 2500, q: 0.7 + rnd() * 1.5, gain: 0.04 + rnd() * 0.12 });
  noise(t + 0.1, len * 0.8, { f: 2500, f2: 5000, q: 0.5, gain: 0.05, attack: 0.25 });
}

// свист броска
export function whoosh() {
  if (muted) return;
  const t = now();
  noise(t, 0.45, { f: 500, f2: 2200, q: 2.5, gain: 0.28, attack: 0.12 });
}

// мягкий удар бумажного комка: сила 0..1, на полу глуше
export function thud(power = 0.5, floor = false) {
  if (muted) return;
  const t = now(), k = Math.min(1, power);
  noise(t, 0.06 + k * 0.04, { type: 'lowpass', f: floor ? 500 : 900, q: 0.7, gain: 0.12 + k * 0.35, attack: 0.002 });
  tone(t, 0.09, { f: floor ? 110 : 170, f2: floor ? 60 : 90, gain: 0.08 + k * 0.2, attack: 0.002 });
  for (let i = 0; i < 6; i++) noise(t + rnd() * 0.08, 0.012, { f: 2000 + rnd() * 3000, q: 2, gain: 0.04 * k });
}

export function tap(power = 0.3) {
  if (muted) return;
  noise(now(), 0.03, { f: 1800, q: 1.5, gain: 0.05 + Math.min(1, power) * 0.12, attack: 0.001 });
}

// «мяу»: пила через подвижный фильтр — гласные м-я-у
export function meow() {
  if (muted) return;
  const c = ac(), t = c.currentTime, d = 0.55 + rnd() * 0.2, p = 0.9 + rnd() * 0.25;
  const o = c.createOscillator(), flt = c.createBiquadFilter(), g = c.createGain(), vib = c.createOscillator(), vg = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(520 * p, t);
  o.frequency.linearRampToValueAtTime(880 * p, t + d * 0.35);
  o.frequency.exponentialRampToValueAtTime(430 * p, t + d);
  vib.frequency.value = 7; vg.gain.value = 12; vib.connect(vg).connect(o.frequency);
  flt.type = 'bandpass'; flt.Q.value = 4;
  flt.frequency.setValueAtTime(700, t);
  flt.frequency.linearRampToValueAtTime(2300, t + d * 0.35);
  flt.frequency.exponentialRampToValueAtTime(800, t + d);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32, t + 0.06);
  g.gain.setValueAtTime(0.32, t + d * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(flt).connect(g).connect(master);
  o.start(t); vib.start(t); o.stop(t + d + 0.05); vib.stop(t + d + 0.05);
}

// мурчание: низкий шум, «рубленый» с частотой ~26 Гц, вдох-выдох
export function purr(len = 2.2) {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const src = c.createBufferSource(), flt = c.createBiquadFilter(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), env = c.createGain();
  src.buffer = noiseBuf; src.loop = true;
  flt.type = 'lowpass'; flt.frequency.value = 260; flt.Q.value = 1;
  lfo.frequency.value = 26; lg.gain.value = 0.5; am.gain.value = 0.5;
  lfo.connect(lg).connect(am.gain);
  env.gain.setValueAtTime(0, t);
  for (let i = 0; i < 3; i++) {
    const a = t + (i * len) / 3;
    env.gain.linearRampToValueAtTime(0.9, a + len / 6);
    env.gain.linearRampToValueAtTime(0.25, a + len / 3);
  }
  env.gain.linearRampToValueAtTime(0, t + len);
  src.connect(flt).connect(am).connect(env).connect(master);
  src.start(t); lfo.start(t); src.stop(t + len + 0.1); lfo.stop(t + len + 0.1);
}

export function pop() {
  if (muted) return;
  tone(now(), 0.12, { f: 520, f2: 1100, gain: 0.15 });
}

export function click() {
  if (muted) return;
  const t = now();
  tone(t, 0.03, { type: 'square', f: 1800, gain: 0.04, attack: 0.001 });
  noise(t, 0.02, { f: 4000, q: 2, gain: 0.06, attack: 0.001 });
}

// мягкий аккорд «включения»
export function chime() {
  if (muted) return;
  const t = now();
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(t + i * 0.07, 1.6, { f, gain: 0.07, attack: 0.02 });
    tone(t + i * 0.07, 1.2, { type: 'triangle', f: f * 2, gain: 0.015, attack: 0.02 });
  });
}

export function shutdown() {
  if (muted) return;
  const t = now();
  [783.99, 659.25, 523.25].forEach((f, i) => tone(t + i * 0.08, 0.7, { f, gain: 0.06, attack: 0.02 }));
}

// когти по канату когтеточки
export function scratch(len = 3) {
  if (muted) return;
  const t = now();
  for (let i = 0; i < len * 4; i++) noise(t + i * 0.25 + rnd() * 0.05, 0.12, { f: 1800 + rnd() * 1500, f2: 900, q: 1.2, gain: 0.07 + rnd() * 0.05, attack: 0.02 });
}

// мягкое приземление лап
export function paws() {
  if (muted) return;
  const t = now();
  noise(t, 0.05, { type: 'lowpass', f: 400, gain: 0.12, attack: 0.002 });
  noise(t + 0.05, 0.04, { type: 'lowpass', f: 450, gain: 0.08, attack: 0.002 });
}

// дождь за окном: шум в петле через фильтры, громкость = сила дождя. Звук стартует после первого касания (ac)
let rainSrc = null, rainGain = null, rainLevel = 0;
export function setRain(level) {
  rainLevel = level;
  if (!ctx) return; // включится в ac() при первом касании
  if (!rainSrc && level > 0) {
    rainSrc = ctx.createBufferSource(); rainSrc.buffer = noiseBuf; rainSrc.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(hp).connect(lp).connect(rainGain).connect(master);
    rainSrc.start();
  }
  rainGain?.gain.setTargetAtTime(level * 0.11, ctx.currentTime, 1.5);
}
addEventListener('pointerdown', () => setTimeout(() => setRain(rainLevel)), { once: true });

// гром: низкий рокот, далёкий или близкий
export function thunder(power = 0.7) {
  if (muted) return;
  const t = now();
  noise(t, 0.25, { type: 'lowpass', f: 900, f2: 200, gain: 0.25 * power, attack: 0.01 });
  noise(t + 0.08, 3.2 + power * 1.5, { type: 'lowpass', f: 260, f2: 60, q: 0.7, gain: 0.5 * power, attack: 0.25 });
  for (let i = 0; i < 4; i++) noise(t + 0.4 + rnd() * 1.6, 0.6 + rnd(), { type: 'lowpass', f: 180, q: 0.6, gain: 0.2 * power, attack: 0.1 });
}
