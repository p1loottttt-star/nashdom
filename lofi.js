// Радио: lofi-мелодии, которые синтезируются на лету WebAudio — без файлов и чужих лицензий.
// Электропиано (аккорды), бас, мягкие барабаны со свингом, мелодия из нот аккорда, треск пластинки и «плывущая» плёнка.
// Каждый трек — своя гармония, темп и зерно мелодии; через 48 тактов радио «перестраивается» на следующий.
import { audio } from './sound.js';

const TRACKS = [
  { name: 'Тёплый вечер', bpm: 74, seed: 11, chords: [[41, 53, 57, 60, 64], [40, 52, 55, 59, 62], [38, 50, 53, 57, 60], [36, 48, 52, 55, 59]] },
  { name: 'Дождь на окне', bpm: 70, seed: 23, chords: [[45, 60, 64, 67, 71], [38, 53, 57, 60, 64], [43, 53, 59, 64], [36, 52, 55, 59, 62]] },
  { name: 'Кофе вдвоём', bpm: 82, seed: 37, chords: [[39, 51, 55, 58, 62], [36, 51, 55, 58, 60], [41, 53, 56, 60, 63], [46, 50, 53, 56, 58]] },
  { name: 'Ночной трамвай', bpm: 78, seed: 41, chords: [[38, 53, 57, 60, 64], [43, 53, 59, 64], [40, 52, 55, 59, 62], [45, 55, 61, 64]] },
  { name: 'Коты спят', bpm: 68, seed: 59, chords: [[43, 55, 59, 62, 66], [42, 54, 57, 61, 64], [40, 52, 55, 59, 62], [38, 50, 54, 57, 61]] },
];
const BARS = 48;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

let A = null, bus = null, wow = null, vinyl = null, timer = null, on = false;
let ti = -1, tr = null, bar = 0, step = 0, next = 0, melody = null, kickAt = -1;
const subs = new Set();
export const onRadio = (cb) => subs.add(cb);
export const playing = () => on;
// 0..1 — «удар» бочки, чтобы радио подпрыгивало в такт
export const pulse = () => (on && A ? Math.max(0, 1 - (A.ctx.currentTime - kickAt) / 0.25) : 0);

function setup() {
  A = audio();
  const c = A.ctx;
  bus = c.createGain(); bus.gain.value = 0;
  const tape = c.createBiquadFilter(); tape.type = 'lowpass'; tape.frequency.value = 2600; tape.Q.value = 0.6;
  const low = c.createBiquadFilter(); low.type = 'highpass'; low.frequency.value = 40;
  bus.connect(tape).connect(low).connect(A.master);
  // плёнка плывёт: одна медленная модуляция на высоту всех нот
  const lfo = c.createOscillator(); lfo.frequency.value = 0.55;
  wow = c.createGain(); wow.gain.value = 9; lfo.connect(wow); lfo.start();
  // пластинка: тихое шипение и редкие щелчки
  const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), r = rng(7);
  for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * 0.012;
  for (let k = 0; k < 40; k++) { const i = Math.floor(r() * (len - 60)), a = (r() * 2 - 1) * (0.2 + r() * 0.5); for (let j = 0; j < 40; j++) d[i + j] += a * Math.exp(-j / 6); }
  vinyl = c.createBufferSource(); vinyl.buffer = buf; vinyl.loop = true;
  const vf = c.createBiquadFilter(); vf.type = 'highpass'; vf.frequency.value = 900;
  const vg = c.createGain(); vg.gain.value = 0.35;
  vinyl.connect(vf).connect(vg).connect(bus); vinyl.start();
}

function osc(t, dur, f, { type = 'sine', gain = 0.1, attack = 0.008, decay = dur, out = bus, drift = true }) {
  const c = A.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
  if (drift) { wow.connect(o.detune); o.onended = () => wow.disconnect(o.detune); }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setTargetAtTime(gain * 0.25, t + attack, decay / 3);
  g.gain.setTargetAtTime(0, t + dur, 0.08);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.5);
}
// электропиано: основной тон, мягкий треугольник и короткий «звон молоточка»
function keys(t, dur, m, v) {
  const f = hz(m);
  osc(t, dur, f, { gain: 0.055 * v, decay: 2.2 });
  osc(t, dur, f, { type: 'triangle', gain: 0.018 * v, decay: 1.2 });
  osc(t, 0.25, f * 4, { gain: 0.012 * v, attack: 0.003, decay: 0.12 });
}
function noise(t, dur, type, f, gain, q = 1) {
  const c = A.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = A.noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 2, dur + 0.05);
}
function kick(t) {
  const c = A.ctx, o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  o.connect(g).connect(bus); o.start(t); o.stop(t + 0.45);
  kickAt = t;
}
const snare = (t) => { noise(t, 0.22, 'bandpass', 1700, 0.11, 0.8); osc(t, 0.08, 185, { gain: 0.05, attack: 0.002, decay: 0.05, drift: false }); };
const hat = (t, v) => noise(t, 0.045, 'highpass', 7500, 0.03 * v);

// мелодия на 4 такта: по восьмым, ноты аккорда октавой выше
function compose(track) {
  const r = rng(track.seed);
  return track.chords.map((ch) => Array.from({ length: 8 }, (_, i) => (r() < (i % 2 ? 0.22 : 0.42) ? ch[1 + Math.floor(r() * (ch.length - 1))] + 12 : 0)));
}

function play(i) {
  ti = i % TRACKS.length; tr = TRACKS[ti]; melody = compose(tr); bar = 0; step = 0;
  next = A.ctx.currentTime + 0.1;
  subs.forEach((f) => f(tr.name));
}

// одна восьмая: всё, что звучит на этом шаге
function schedule(t) {
  const beat = 60 / tr.bpm, ch = tr.chords[bar % tr.chords.length], v = 0.85 + Math.random() * 0.3;
  const drums = bar >= 2 && bar < BARS - 1, mel = bar >= 6 && bar < BARS - 2 && !(bar >= 24 && bar < 28);
  if (step === 0) {
    ch.slice(1).forEach((m, k) => keys(t + k * 0.014, beat * 3.7, m, v)); // аккорд чуть «перебором»
    osc(t, beat * 1.8, hz(ch[0]), { gain: drums ? 0.16 : 0.08, decay: 1.4 });
  }
  if (step === 5 && drums) osc(t, beat * 1.4, hz(ch[0] + (bar % 2 ? 7 : 12)), { gain: 0.11, decay: 0.9 });
  if (step === 6 && bar % 4 === 3) ch.slice(2).forEach((m) => keys(t, beat * 0.9, m, 0.5)); // подхват в конце фразы
  if (drums) {
    if (step === 0 || step === 3 || (step === 5 && bar % 2)) kick(t);
    if (step === 2 || step === 6) snare(t);
    hat(t, step % 2 ? 0.6 : 1);
  }
  const m = mel && melody[bar % 4][step];
  if (m) {
    const up = bar >= 28 && step === 4 ? 12 : 0; // во второй половине одна нота фразы уходит на октаву вверх
    osc(t, beat * 0.9, hz(m + up), { type: 'triangle', gain: 0.05, attack: 0.01, decay: 0.6 });
    osc(t, beat * 0.9, hz(m + up), { gain: 0.035, attack: 0.01, decay: 0.7 });
  }
}

function tick() {
  const c = A.ctx;
  while (next < c.currentTime + 1.5) { // запас на полторы секунды: фоновая вкладка будит таймер редко
    const beat = 60 / tr.bpm;
    schedule(next);
    next += step % 2 ? beat * 0.42 : beat * 0.58; // свинг
    if (++step === 8) { step = 0; if (++bar === BARS) { tune(next); play(ti + 1); next += 0.9; } }
  }
}
// шум перестройки между станциями
const tune = (t) => noise(t, 0.9, 'bandpass', 900, 0.08, 3);

export function toggle() {
  if (!A) setup();
  const c = A.ctx;
  on = !on;
  if (on) {
    bus.gain.setTargetAtTime(0.9, c.currentTime, 0.4);
    tune(c.currentTime);
    play(ti + 1);
    timer = setInterval(tick, 200); tick();
  } else {
    clearInterval(timer);
    bus.gain.setTargetAtTime(0, c.currentTime, 0.25);
    subs.forEach((f) => f(null));
  }
  return on ? tr.name : null;
}
