// цены в каталоге сайта и в базе (supabase/migrations) должны совпадать — иначе сервер спишет не то, что показано
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SHOP, EARN, inventory, ownedStyles } from '../catalog.js';

import { SQL as sql } from './sql.mjs';
const rows = new Map([...sql.matchAll(/\('([a-z_]+)', '(decor|gift|style)', (\d+)\)/g)].map((m) => [m[1], [m[2], +m[3]]]));
for (const s of SHOP) assert.deepEqual(rows.get(s.id), [s.kind, s.price], `цена/вид ${s.id}`);
assert.equal(rows.size, SHOP.length, 'в базе лишние или пропущенные товары');
assert.equal(new Set(SHOP.map((s) => s.id)).size, SHOP.length, 'повтор id');

const L = [
  { id: 1, reason: 'decor', user_id: 'a', item: 'cactus' }, { id: 2, reason: 'decor', user_id: 'b', item: 'globe' },
  { id: 3, reason: 'gift', user_id: 'b', to_user: 'a', item: 'teddy', opened: true }, { id: 4, reason: 'gift', user_id: 'b', to_user: 'a', item: 'ring', opened: false },
  { id: 5, reason: 'style', user_id: 'a', item: 'wp_hearts' },
];
assert.deepEqual(inventory(L, 'a'), [{ id: 'L1', item: 'cactus' }, { id: 'L3', item: 'teddy' }]);
assert.ok(ownedStyles(L, 'a').has('wp_hearts') && ownedStyles(L, 'a').has('w_rose') && !ownedStyles(L, 'b').has('wp_hearts'));
// начисления (award в SQL) = EARN на сайте: иначе тост покажет одно, а копилка получит другое
const fn = sql.slice(sql.indexOf('function public.award'));
const award = new Map([...fn.slice(0, fn.indexOf('as t(r, a, l)')).matchAll(/\('([a-z]+)', (\d+), (\d+)\)/g)].map((m) => [m[1], [+m[2], +m[3]]]));
assert.deepEqual([...award.keys()].sort(), Object.keys(EARN).sort(), 'причины начислений');
for (const [k, [n, cap]] of Object.entries(EARN)) assert.deepEqual(award.get(k), [n, cap], `начисление ${k}`);
console.log('catalog: ok');
