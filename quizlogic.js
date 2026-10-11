// Подсчёты «Тестов для пар» — чистые функции (проверяет tests/quiz.test.mjs).
// Запись прохождения: { user, answers }. who: 'me' | 'you' | 'both'; type: индекс варианта; know: { self, guess }.

// «кто из нас»: ответы относительны отвечающему → в людей (id или 'both')
const abs = (ans, me, other) => (ans === 'me' ? me : ans === 'you' ? other : ans === 'both' ? 'both' : null);
export function whoRows(quiz, A, B) {
  const rows = quiz.items.map((text, i) => {
    const a = abs(A.answers[i], A.user, B.user), b = abs(B.answers[i], B.user, A.user);
    return { text, a, b, agree: !!a && a === b };
  });
  const agreed = rows.filter((r) => r.agree).length;
  return { rows, agreed, pct: rows.length ? Math.round((agreed / rows.length) * 100) : 0 };
}

// «какой ты»: самый частый ключ; при равенстве — тот, что раньше в списке результатов
export function typeResult(quiz, answers) {
  const keys = Object.keys(quiz.results), n = Object.fromEntries(keys.map((k) => [k, 0]));
  quiz.questions.forEach((q, i) => { const k = q.a[answers[i]]?.[1]; if (k in n) n[k]++; });
  return keys.reduce((best, k) => (n[k] > n[best] ? k : best), keys[0]);
}

// «кто ты из»: доля ответов на каждого героя, по убыванию (ничья — по порядку результатов)
export function typePercents(quiz, answers) {
  const keys = Object.keys(quiz.results), n = Object.fromEntries(keys.map((k) => [k, 0])); let t = 0;
  quiz.questions.forEach((q, i) => { const k = q.a[answers[i]]?.[1]; if (k in n) { n[k]++; t++; } });
  return keys.map((key) => ({ key, pct: t ? Math.round((n[key] / t) * 100) : 0 })).sort((a, b) => b.pct - a.pct || keys.indexOf(a.key) - keys.indexOf(b.key));
}
export const typeSame = (quiz, A, B) => quiz.questions.filter((_, i) => A.answers[i] != null && A.answers[i] === B.answers[i]).length;

// перемешивание с зерном (mulberry32 от FNV-хеша строки): у обоих одна и та же сетка турнира
export function seeded(n, seed) {
  let x = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const rnd = () => { x = (x + 0x6d2b79f5) >>> 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// турнир: по сетке и победителям — текущий матч, размер круга (16/8/4/2), номер матча, чемпион
export function cupPlay(order, winners) {
  let round = order, k = 0;
  while (round.length > 1) {
    const next = [];
    for (let i = 0; i < round.length; i += 2, k++) {
      if (winners[k] == null) return { cur: [round[i], round[i + 1]], size: round.length, k, champ: null };
      next.push(winners[k]);
    }
    round = next;
  }
  return { cur: null, size: 1, k, champ: round[0] };
}
// турнир вдвоём: победы каждого фото, чемпионы, совпадения первого круга, общий топ по сумме побед
export function cupScore(quiz, order, A, B) {
  const one = (w) => ({ champ: cupPlay(order, w).champ, wins: quiz.items.map((_, i) => w.filter((x) => x === i).length) });
  const a = one(A.answers), b = one(B?.answers || []), half = order.length / 2;
  const first = A.answers.slice(0, half).filter((w, i) => w === B?.answers?.[i]).length;
  const top = quiz.items.map((_, i) => i).sort((x, y) => a.wins[y] + b.wins[y] - (a.wins[x] + b.wins[x]) || x - y).slice(0, 3);
  return { a, b, first, half, top };
}
// тирлист вдвоём: на одной полке и горячие споры (разница в 2+ полки), споры по убыванию разницы
export function tierScore(quiz, A, B) {
  const rows = quiz.items.map((x, i) => ({ i, t: x.t, a: A.answers[i], b: B.answers[i], d: Math.abs(A.answers[i] - B.answers[i]) }));
  return { rows, same: rows.filter((r) => r.d === 0).length, total: rows.length, hot: rows.filter((r) => r.d >= 2).sort((x, y) => y.d - x.d || x.i - y.i) };
}
// викторина
export const triviaRight = (quiz, answers) => quiz.questions.filter((q, i) => answers[i] === q.ok).length;
export function triviaPair(quiz, A, B) {
  return { rows: quiz.questions.map((q, i) => ({ q, a: A.answers[i], b: B.answers[i] })), mine: triviaRight(quiz, A.answers), theirs: triviaRight(quiz, B.answers), total: quiz.questions.length };
}

// сколько пар стоит в разном порядке (0 — порядок тот же, 1 — переставлены двое соседей)
export const swaps = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (b.indexOf(a[i]) > b.indexOf(a[j])) n++; return n; };
// «знаешь»: угадал ли — вариант совпал; шкала 0–100 — промах не больше 15; порядок — не больше одной перестановки соседей
export function guessed(q, self, guess) {
  if (self == null || guess == null) return false;
  if (q.scale) return Math.abs(self - guess) <= 15;
  if (q.rank) return Array.isArray(self) && Array.isArray(guess) && self.length === guess.length && swaps(self, guess) <= 1;
  return self === guess;
}
// «знаешь»: mine — сколько моих догадок совпало с ответами партнёра «про себя», theirs — наоборот
export function knowScore(quiz, A, B) {
  const rows = quiz.questions.map((q, i) => {
    const a = A.answers[i] || {}, b = B.answers[i] || {};
    return { q: q.q, x: q, a, b, myOk: guessed(q, b.self, a.guess), theirOk: guessed(q, a.self, b.guess) };
  });
  return { rows, mine: rows.filter((r) => r.myOk).length, theirs: rows.filter((r) => r.theirOk).length, total: rows.length };
}

// звание по доле угаданного
export function knowTitle(n, total) {
  const k = total ? n / total : 0;
  return k >= .9 ? 'читаешь мысли' : k >= .7 ? 'большой знаток' : k >= .5 ? 'знаешь почти всё' : k >= .3 ? 'есть что узнать' : 'знакомьтесь заново';
}
// «это или то»: совпадения и звание пары
export function pickScore(quiz, A, B) {
  const rows = quiz.pairs.map((p, i) => ({ p, a: A.answers[i], b: B.answers[i], same: A.answers[i] != null && A.answers[i] === B.answers[i] }));
  const same = rows.filter((r) => r.same).length, k = rows.length ? same / rows.length : 0;
  return { rows, same, total: rows.length, title: k >= .9 ? 'одна голова на двоих' : k >= .7 ? 'почти близнецы' : k >= .4 ? 'идеальный баланс' : 'противоположности притягиваются' };
}
// «что мы уже успели»: успели оба, не успели оба (это — в планы), вспоминают по-разному
export function listRows(quiz, A, B) {
  const rows = quiz.items.map((text, i) => ({ i, text, a: !!A.answers[i], b: !!B.answers[i] }));
  return { rows, both: rows.filter((r) => r.a && r.b), neither: rows.filter((r) => !r.a && !r.b), differ: rows.filter((r) => r.a !== r.b) };
}
// «идеальный вечер»: что совпало по шагам
export function eveningScore(quiz, A, B) {
  const rows = quiz.steps.map((s, i) => ({ s, a: A.answers[i], b: B.answers[i], same: A.answers[i] != null && A.answers[i] === B.answers[i] }));
  return { rows, same: rows.filter((r) => r.same).length, total: rows.length };
}

// ---------- вопрос дня ----------
// местная дата 'ГГГГ-ММ-ДД' и шаг на день назад
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const prevDay = (s) => { const [y, m, d] = s.split('-').map(Number); return dayStr(new Date(y, m - 1, d - 1)); };
// номер вопроса: дни от 01.01.2026 по кругу — у обоих один и тот же
export const qdayIndex = (s, n) => { const [y, m, d] = s.split('-').map(Number); const k = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 864e5); return ((k % n) + n) % n; };
// серия: дни подряд, когда ответили оба; сегодня ещё не ответили — серия до вчера не сгорает
export function qdayStreak(answered, today) { // answered(день) → ответили ли оба
  let d = answered(today) ? today : prevDay(today), n = 0;
  while (answered(d) && n < 3660) { n++; d = prevDay(d); }
  return n;
}

// сколько ответов ждёт тест (для прогресса и проверки «пройден до конца»)
export const length = (quiz) => (quiz.kind === 'cup' ? quiz.items.length - 1 : ({ who: quiz.items, list: quiz.items, tier: quiz.items, pick: quiz.pairs, evening: quiz.steps }[quiz.kind] || quiz.questions).length);

// целостность записи базы: [] — всё в порядке, иначе список проблем
export function validate(q) {
  const bad = [];
  if (!q.id || !q.title || !(q.topic || q.rubric) || !(q.emoji || q.cover)) bad.push('нет id/title/рубрики/обложки');
  if (q.kind === 'who') { if (!(q.items?.length >= 6)) bad.push('мало утверждений'); }
  else if (q.kind === 'type') {
    const keys = Object.keys(q.results || {});
    if (keys.length < 2) bad.push('мало результатов');
    for (const k of keys) if (!q.results[k].title || !q.results[k].text) bad.push('результат без текста: ' + k);
    for (const [i, x] of (q.questions || []).entries()) {
      if (!x.q || !(x.a?.length >= 2)) bad.push('вопрос ' + i);
      for (const [t, k] of x.a || []) if (!t || !keys.includes(k)) bad.push(`вопрос ${i}: ключ ${k}`);
    }
    for (const k of keys) if (!(q.questions || []).some((x) => x.a.some((a) => a[1] === k))) bad.push('недостижим: ' + k);
  } else if (q.kind === 'know') {
    for (const [i, x] of (q.questions || []).entries()) if (!x.q || !(x.a?.length >= 2 || x.scale?.length === 2 || x.rank?.length >= 3)) bad.push('вопрос ' + i);
    if (!(q.questions?.length >= 5)) bad.push('мало вопросов');
  } else if (q.kind === 'pick') {
    if (!(q.pairs?.length >= 5)) bad.push('мало пар');
    for (const [i, p] of (q.pairs || []).entries()) if (p.length !== 2 || p.some((x) => !x[0] || !x[1])) bad.push('пара ' + i);
  } else if (q.kind === 'list') {
    if (!(q.items?.length >= 8)) bad.push('мало пунктов');
  } else if (q.kind === 'evening') {
    if (!(q.steps?.length >= 3)) bad.push('мало шагов');
    for (const [i, x] of (q.steps || []).entries()) if (!x.q || !(x.a?.length >= 2) || x.a.some((o) => !o[0] || !o[1])) bad.push('шаг ' + i);
  } else if (q.kind === 'cup') {
    if (q.items?.length !== 16) bad.push('в турнире нужно 16 фото');
    for (const [i, x] of (q.items || []).entries()) if (!x.t || !x.img) bad.push('фото ' + i);
  } else if (q.kind === 'tier') {
    if (!(q.items?.length >= 12 && q.items.length <= 30)) bad.push('в тирлисте 12–30 фото');
    for (const [i, x] of (q.items || []).entries()) if (!x.t || !x.img) bad.push('фото ' + i);
  } else if (q.kind === 'trivia') {
    if (!(q.questions?.length >= 5)) bad.push('мало вопросов');
    for (const [i, x] of (q.questions || []).entries()) if (!x.q || !(x.a?.length >= 2) || !(x.ok >= 0 && x.ok < x.a.length)) bad.push('вопрос ' + i);
  } else bad.push('неизвестный формат');
  return bad;
}
