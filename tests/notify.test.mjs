// Колокольчик: дела от партнёра по важности; новые — те, чьих ключей ещё не видели
import assert from 'node:assert/strict';
import { pending, fresh } from '../notifylogic.js';

assert.deepEqual(pending({}), [], 'нет данных — нет дел');
const all = pending({
  qday: '2026-10-12',
  asks: [{ id: 'a1', title: 'Какой ты фильм' }],
  turns: [{ id: 'g1', at: 5, title: 'Котобой' }],
  gifts: [{ id: 7, title: 'Мишка', note: 'обнимаю' }],
  notes: [{ id: 'n1', text: 'Смотри, что я нашла про Прагу и про то, как туда доехать на поезде' }],
});
assert.deepEqual(all.map((i) => i.kind), ['note', 'gift', 'turn', 'ask', 'qday'], 'порядок важности');
assert.ok(all[0].sub.length <= 60 && all[0].sub.endsWith('…'), 'длинная записка обрезана');
assert.equal(all[1].sub, '«обнимаю»', 'у подарка — подпись');
assert.equal(all[2].key, 'turn:g1:5', 'новый ход — новый ключ');
assert.equal(all[2].match, 'g1');
assert.equal(all[4].go, 'quiz');
const seen = new Set(['note:n1', 'qday:2026-10-12']);
assert.deepEqual(fresh(seen, all).map((i) => i.kind), ['gift', 'turn', 'ask']);
console.log('notify ok');
