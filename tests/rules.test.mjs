// правила записи в rules.js и в миграциях должны совпадать — иначе локально работает, а в облаке нет
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KIND, ID, MAX_DATA, checkItem } from '../rules.js';
import { SQL as sql } from './sql.mjs';
assert.ok(sql.includes(`kind ~ '${KIND.source}'`), 'KIND как в миграциях');
assert.ok(sql.includes(`id ~ '${ID.source}'`), 'ID как в миграциях');
assert.ok(sql.includes(`pg_column_size(data) < ${MAX_DATA}`), 'MAX_DATA как в миграциях');
assert.doesNotThrow(() => checkItem('quiz', 'who-love:a', { x: 1 }));
assert.doesNotThrow(() => checkItem('room', crypto.randomUUID(), {}));
assert.throws(() => checkItem('Quiz', 'x', {}));
assert.throws(() => checkItem('notes', 'a b', {}));
assert.throws(() => checkItem('notes', 'x'.repeat(121), {}));
assert.throws(() => checkItem('notes', 'x', { s: 'я'.repeat(MAX_DATA) }));
console.log('rules ok');
