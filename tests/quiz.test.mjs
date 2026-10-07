// подсчёты «Тестов для пар» и целостность базы
import assert from 'node:assert/strict';
import { whoRows, typeResult, knowScore, validate } from '../quizlogic.js';
import { QUIZZES, TOPICS } from '../quizdb.js';

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
for (const kind of ['who', 'type', 'know']) assert.equal(QUIZZES.filter((q) => q.kind === kind).length, 5, kind);
// validate ловит поломки
assert.ok(validate({ id: 't', kind: 'type', title: 'x', topic: 'fun', emoji: '·', results: { a: { title: 'A', text: '.' } }, questions: [{ q: '?', a: [['да', 'b']] }] }).length > 0);
console.log('quiz: ok');
