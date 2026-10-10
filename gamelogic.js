// Правила мини-игр — чистые функции (проверяет tests/games.test.mjs).

// ---------- «Одна волна»: шкала 0–100, очки команды за близость стрелки к цели ----------
export const waveScore = (target, guess) => { const d = Math.abs(target - guess); return d <= 4 ? 4 : d <= 11 ? 3 : d <= 18 ? 2 : 0; };
export const WAVE_ROUNDS = 5;
export function waveVerdict(total) { // из 20
  if (total >= 17) return 'Телепатия. Вы точно один человек?';
  if (total >= 12) return 'На одной волне — так и задумано';
  if (total >= 7) return 'Почти синхронно, ещё партию — и будет телепатия';
  return 'Каждый на своей волне. Зато весело!';
}

// ---------- крестики-нолики: board — 9 клеток 'x' | 'o' | null ----------
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function tttWinner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
}
export const tttLine = (b) => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]) || null;

// ---------- морской бой: поле N×N, клетка = r * N + c; корабль = массив клеток ----------
export const N = 8, FLEET = [4, 3, 3, 2, 2, 1, 1];
const rc = (i) => [Math.floor(i / N), i % N];
const straight = (s) => {
  if (!s.length || s.some((i) => i < 0 || i >= N * N)) return false;
  const p = s.map(rc).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const row = p.every((x) => x[0] === p[0][0]), col = p.every((x) => x[1] === p[0][1]);
  return (row && p.every((x, k) => x[1] === p[0][1] + k)) || (col && p.every((x, k) => x[0] === p[0][0] + k));
};
const touch = (a, b) => a.some((i) => b.some((j) => { const [r1, c1] = rc(i), [r2, c2] = rc(j); return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1; }));
export function validFleet(ships) {
  if (ships.length !== FLEET.length) return false;
  if (ships.map((s) => s.length).sort().join() !== [...FLEET].sort().join()) return false;
  if (!ships.every(straight)) return false;
  for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) if (touch(ships[i], ships[j])) return false;
  return true;
}
export function randomFleet(rnd = Math.random) {
  for (;;) {
    const ships = [];
    for (const len of FLEET) {
      let ok = false;
      for (let t = 0; t < 200 && !ok; t++) {
        const vert = rnd() < 0.5, r = Math.floor(rnd() * (vert ? N - len + 1 : N)), c = Math.floor(rnd() * (vert ? N : N - len + 1));
        const s = Array.from({ length: len }, (_, k) => (vert ? (r + k) * N + c : r * N + c + k));
        if (!ships.some((o) => touch(o, s))) { ships.push(s); ok = true; }
      }
      if (!ok) break; // зажали — начинаем заново
    }
    if (ships.length === FLEET.length) return ships;
  }
}
// выстрел в cell; shots — прежние выстрелы по этому флоту
export function shoot(fleet, shots, cell) {
  const all = new Set([...shots, cell]);
  const k = fleet.findIndex((s) => s.includes(cell));
  if (k < 0) return { hit: false, sunk: null, won: false };
  return { hit: true, sunk: fleet[k].every((i) => all.has(i)) ? k : null, won: fleet.every((s) => s.every((i) => all.has(i))) };
}

// ---------- «Рисуй — угадывай» ----------
export const normWord = (s) => String(s).trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
export const sameWord = (a, b) => normWord(a) === normWord(b);
// первые n букв открыты, остальные — «_»; пробелы между словами сохраняются
export function hintMask(word, n) {
  let shown = 0;
  return [...word].map((ch) => (ch === ' ' ? ' ' : shown++ < n ? ch : '_')).join(' ');
}
// ошибка в 1 букву (в словах длиннее 5 — в 2): «близко!»
export function closeWord(a, b) {
  a = normWord(a); b = normWord(b);
  if (a === b || Math.abs(a.length - b.length) > 2) return false;
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length] <= (b.length > 5 ? 2 : 1);
}
export const DRAW_T = 80; // секунд на живой раунд
// очки раунда: звёзды ×2 + скорость (вживую 1..3 по оставшемуся времени, без таймера — 1) − подсказки, не меньше 1
export const drawPoints = ({ ok, stars, hints = 0, live = false, left = 0 }) => (ok ? Math.max(1, stars * 2 + (live ? Math.ceil((3 * Math.max(0, left)) / DRAW_T) : 1) - hints) : 0);
// три слова на ★/★★/★★★; своё слово пары с вероятностью ½ встаёт на место ★★
export function drawChoices(tiers, ours = [], rnd = Math.random) {
  const one = (l) => l[Math.floor(rnd() * l.length)];
  const c = tiers.map((l, i) => ({ w: one(l), s: i + 1 }));
  if (ours.length && rnd() < 0.5) c[1] = { w: one(ours), s: 2, ours: true };
  return c;
}
// повтор рисунка: паузы длиннее gap мс ужимаются до gap
export function squeeze(strokes, gap = 350) {
  const pts = strokes.flatMap((s, i) => s.p.map((q, k) => [q[2], i, k])).sort((a, b) => a[0] - b[0]);
  const out = strokes.map((s) => ({ ...s, p: s.p.map((q) => [...q]) }));
  let last = 0, shift = 0;
  for (const [t, i, k] of pts) { if (t - last > gap) shift += t - last - gap; out[i].p[k][2] = t - shift; last = t; }
  return out;
}
