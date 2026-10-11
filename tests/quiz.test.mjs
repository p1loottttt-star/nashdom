// подсчёты «Тестов для пар» и целостность базы
import assert from 'node:assert/strict';
import { whoRows, typeResult, knowScore, validate, guessed, swaps, pickScore, listRows, eveningScore, qdayIndex, qdayStreak, prevDay, knowTitle, typePercents, typeSame, seeded, cupPlay, cupScore, tierScore, triviaRight, triviaPair, length } from '../quizlogic.js';
import { QUIZZES, TOPICS, QDAY } from '../quizdb.js';

// «кто из нас»: ответы относительны отвечающему — переводим в людей
const who = { kind: 'who', items: ['кто опаздывает', 'кто готовит', 'кто мирится'] };
const r = whoRows(who, { user: 'a', answers: ['me', 'you', 'both'] }, { user: 'b', answers: ['you', 'you', 'both'] });
assert.deepEqual(r.rows.map((x) => [x.a, x.b, x.agree]), [['a', 'a', true], ['b', 'a', false], ['both', 'both', true]]);
assert.equal(r.agreed, 2);
assert.equal(r.pct, 67);

// «какой ты»: самый частый ключ, ничья — по порядку результатов
const type = { kind: 'type', results: { x: {}, y: {}, z: {} }, questions: [{ a: [['1', 'y'], ['2', 'x']] }, { a: [['1', 'z'], ['2', 'x']] }, { a: [['1', 'y'], ['2', 'z']] }] };
assert.equal(typeResult(type, [0, 1, 0]), 'y'); // y x y
assert.equal(typeResult(type, [1, 0, 1]), 'z'); // x z z
assert.equal(typeResult(type, [0, 1, 1]), 'x'); // y x z — ничья, первый по порядку
assert.equal(typeResult(type, []), 'x'); // пусто — первый

// «знаешь»: угадал ли каждый ответ другого «про себя»
const know = { kind: 'know', questions: [{ q: '1', a: ['a', 'b'] }, { q: '2', a: ['a', 'b'] }, { q: '3', a: ['a', 'b'] }] };
const k = knowScore(know, { answers: [{ self: 0, guess: 1 }, { self: 1, guess: 1 }, { self: 0, guess: 0 }] }, { answers: [{ self: 1, guess: 0 }, { self: 0, guess: 1 }, { self: 0, guess: 1 }] });
assert.deepEqual([k.mine, k.theirs, k.total], [2, 2, 3]); // я угадал 1-й и 3-й, партнёр — 1-й и 2-й
assert.deepEqual(k.rows.map((x) => [x.myOk, x.theirOk]), [[true, true], [false, true], [true, false]]);

// база: формы записей, уникальные id, темы из списка, по 5 тестов каждого формата
for (const q of QUIZZES) assert.deepEqual(validate(q), [], q.id);
assert.equal(new Set(QUIZZES.map((q) => q.id)).size, QUIZZES.length, 'повтор id');
for (const q of QUIZZES) assert.ok(TOPICS[q.topic], `тема ${q.id}`);
for (const kind of ['who', 'type']) assert.equal(QUIZZES.filter((q) => q.kind === kind).length, 5, kind);
for (const kind of ['know', 'pick', 'list', 'evening']) assert.ok(QUIZZES.some((q) => q.kind === kind), kind);
for (const [q, a] of QDAY) assert.ok(q && a.length >= 2 && a.every(Boolean), 'вопрос дня: ' + q);

// «знаешь»: шкала и порядок
assert.equal(guessed({ scale: ['а', 'б'] }, 40, 55), true); assert.equal(guessed({ scale: ['а', 'б'] }, 40, 56), false);
assert.equal(swaps([0, 1, 2, 3], [0, 1, 2, 3]), 0); assert.equal(swaps([0, 1, 2, 3], [1, 0, 2, 3]), 1); assert.equal(swaps([0, 1, 2, 3], [3, 2, 1, 0]), 6);
assert.equal(guessed({ rank: [1, 2, 3, 4] }, [0, 1, 2, 3], [0, 2, 1, 3]), true); assert.equal(guessed({ rank: [1, 2, 3, 4] }, [0, 1, 2, 3], [2, 0, 1, 3]), false);
assert.equal(guessed({ a: ['x', 'y'] }, 1, 1), true); assert.equal(guessed({ a: ['x', 'y'] }, undefined, undefined), false);
const mix = { kind: 'know', questions: [{ q: '1', scale: ['a', 'b'] }, { q: '2', rank: ['a', 'b', 'c'] }, { q: '3', a: ['a', 'b'] }] };
const km = knowScore(mix, { answers: [{ self: 10, guess: 80 }, { self: [0, 1, 2], guess: [2, 1, 0] }, { self: 0, guess: 1 }] }, { answers: [{ self: 70, guess: 20 }, { self: [1, 0, 2], guess: [0, 1, 2] }, { self: 1, guess: 1 }] });
assert.deepEqual(km.rows.map((r) => [r.myOk, r.theirOk]), [[true, true], [false, true], [true, false]]);
assert.deepEqual([km.mine, km.theirs], [2, 2]);
assert.equal(knowTitle(9, 10), 'читаешь мысли'); assert.equal(knowTitle(0, 8), 'знакомьтесь заново');

// «это или то», чек-лист, вечер
const pk = pickScore({ pairs: [[['a', 'x'], ['b', 'y']], [['c', 'x'], ['d', 'y']]] }, { answers: [0, 1] }, { answers: [0, 0] });
assert.deepEqual([pk.same, pk.total], [1, 2]);
const ls = listRows({ items: ['a', 'b', 'c'] }, { answers: [1, 0, 0] }, { answers: [1, 1, 0] });
assert.deepEqual([ls.both.length, ls.neither.map((r) => r.text), ls.differ.length], [1, ['c'], 1]);
assert.equal(eveningScore({ steps: [{}, {}] }, { answers: [2, 0] }, { answers: [2, 1] }).same, 1);

// вопрос дня: номер по дате, серия «оба ответили»
assert.equal(qdayIndex('2026-01-01', 45), 0); assert.equal(qdayIndex('2026-01-02', 45), 1); assert.equal(qdayIndex('2025-12-31', 45), 44);
assert.equal(prevDay('2026-03-01'), '2026-02-28');
const both = new Set(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-05']);
assert.equal(qdayStreak((d) => both.has(d), '2026-10-10'), 3);
assert.equal(qdayStreak((d) => both.has(d), '2026-10-11'), 3, 'сегодня ещё не ответили — серия до вчера');
assert.equal(qdayStreak((d) => both.has(d), '2026-10-12'), 0);
// validate ловит поломки
assert.ok(validate({ id: 't', kind: 'type', title: 'x', topic: 'fun', emoji: '·', results: { a: { title: 'A', text: '.' } }, questions: [{ q: '?', a: [['да', 'b']] }] }).length > 0);
// кто ты из: проценты по героям, одинаковые ответы
const tp = typePercents(type, [0, 1, 0]); // y x y
assert.deepEqual(tp.map((r) => [r.key, r.pct]), [['y', 67], ['x', 33], ['z', 0]]);
assert.equal(typeSame(type, { answers: [0, 1, 0] }, { answers: [0, 0, 0] }), 2);
// турнир: сетка одинакова при одном зерне, матчи по ответам
const ord = seeded(16, 'cup-x'); assert.deepEqual(ord, seeded(16, 'cup-x')); assert.deepEqual([...ord].sort((a, b) => a - b), [...Array(16).keys()]);
assert.notDeepEqual(ord, seeded(16, 'cup-y'));
const o4 = [0, 1, 2, 3];
assert.deepEqual(cupPlay(o4, []).cur, [0, 1]); assert.equal(cupPlay(o4, []).size, 4);
assert.deepEqual(cupPlay(o4, [1]).cur, [2, 3]);
assert.deepEqual(cupPlay(o4, [1, 3]).cur, [1, 3]); assert.equal(cupPlay(o4, [1, 3]).size, 2);
assert.equal(cupPlay(o4, [1, 3, 3]).cur, null); assert.equal(cupPlay(o4, [1, 3, 3]).champ, 3);
const cs = cupScore({ items: [{}, {}, {}, {}] }, o4, { answers: [1, 3, 3] }, { answers: [1, 2, 1] });
assert.deepEqual([cs.a.champ, cs.b.champ, cs.first, cs.top[0]], [3, 1, 1, 1]); // первый круг: 1=1, 3≠2; сумма побед: у 1 → 1+2
assert.deepEqual(cs.a.wins, [0, 1, 0, 2]);
// тирлист: на одной полке, горячие споры (разница 2+)
const ts = tierScore({ items: [{ t: 'a' }, { t: 'b' }, { t: 'c' }] }, { answers: [0, 3, 1] }, { answers: [0, 0, 2] });
assert.deepEqual([ts.same, ts.total, ts.hot.map((r) => r.i)], [1, 3, [1]]);
// викторина
const tv = { questions: [{ q: '1', a: ['a', 'b'], ok: 1 }, { q: '2', a: ['a', 'b'], ok: 0 }] };
assert.equal(triviaRight(tv, [1, 1]), 1);
const tvp = triviaPair(tv, { answers: [1, 0] }, { answers: [0, 0] });
assert.deepEqual([tvp.mine, tvp.theirs, tvp.total], [2, 1, 2]);
// validate новых форматов
const img = (t) => ({ t, img: 'k' });
assert.deepEqual(validate({ id: 'c', kind: 'cup', title: 'x', rubric: 'food', cover: 'k', items: Array.from({ length: 16 }, (_, i) => img('t' + i)) }), []);
assert.ok(validate({ id: 'c', kind: 'cup', title: 'x', rubric: 'food', cover: 'k', items: [img('a')] }).length);
assert.deepEqual(validate({ id: 't', kind: 'tier', title: 'x', rubric: 'food', cover: 'k', items: Array.from({ length: 12 }, (_, i) => img('t' + i)) }), []);
assert.deepEqual(validate({ id: 'v', kind: 'trivia', title: 'x', rubric: 'cinema', cover: 'k', questions: Array.from({ length: 5 }, () => ({ q: '?', a: ['a', 'b'], ok: 1 })) }), []);
assert.ok(validate({ id: 'v', kind: 'trivia', title: 'x', rubric: 'cinema', cover: 'k', questions: Array.from({ length: 5 }, () => ({ q: '?', a: ['a', 'b'], ok: 2 })) }).length);
assert.deepEqual(validate({ id: 'h', kind: 'type', title: 'x', rubric: 'cinema', cover: 'k', results: { a: { title: 'A', text: '.', img: 'k' }, b: { title: 'B', text: '.' } }, questions: [{ q: '?', a: [['1', 'a'], ['2', 'b']] }] }), []);
assert.equal(length({ kind: 'cup', items: Array(16) }), 15); assert.equal(length({ kind: 'tier', items: Array(20) }), 20); assert.equal(length({ kind: 'trivia', questions: Array(7) }), 7);
console.log('quiz: ok');
