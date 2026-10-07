import assert from 'node:assert/strict';
import { createTuner } from '../gfx.js';

// модель видеокарты: кадр = (сцена + эффекты ступени) × pr², приходит кратно vsync 60 Гц (19 мс работы = кадр в 33 мс)
const run = (scene, fx, opts, secs = 120, spike = null) => {
  const t = createTuner(opts);
  let changes = 0;
  for (let ms = 0; ms < secs * 1000; ms += 500) {
    let f = Math.max(1, Math.ceil((scene + fx[t.tier]) * t.pr * t.pr * 60 - 1e-9)) / 60;
    if (spike && ms >= spike[0] && ms < spike[1]) f = 0.05;
    if (t.feed(f, ms) && ms > (secs - 60) * 1000) changes++;
  }
  return { t, calm: changes <= 2 }; // за последнюю минуту — не больше одной пробы «выше» и отката
};

// мощная видеокарта: держит максимум
let r = run(0.002, [0.002, 0.001, 0], { min: 0.85, max: 2 });
assert.deepEqual([r.t.tier, r.t.pr], [0, 2]);

// встроенная (как Radeon 760M у Вани, мс на pr 1): сцена 9, GTAO +6, объём +1 — без GTAO, разрешение ≥ 1, без качелей
r = run(0.009, [0.007, 0.001, 0], { min: 0.85, max: 1.25 });
assert.ok(r.calm, 'не качается');
assert.ok(r.t.pr >= 1, `${r.t.tier}:${r.t.pr}`);
assert.ok((0.009 + [0.007, 0.001, 0][r.t.tier]) * r.t.pr ** 2 <= 1 / 60, 'укладывается в 60 к/с');

// эффекты не тянет даже на pr 1: остаётся без GTAO и не дёргается туда-сюда
r = run(0.009, [0.012, 0.001, 0], { min: 0.85, max: 1.25 }, 300);
assert.equal(r.t.tier, 1);
assert.ok(r.calm, 'не качается между ступенями');

// совсем слабая: опускается до минимума, но не ниже
r = run(0.03, [0.01, 0.005, 0], { min: 0.85, max: 1.5 });
assert.deepEqual([r.t.tier, r.t.pr], [2, 0.85]);

// короткий провал (вкладка тормознула 3 с) не опускает навсегда — качество возвращается
r = run(0.003, [0.003, 0.002, 0], { min: 0.85, max: 1.5 }, 120, [10000, 13000]);
assert.deepEqual([r.t.tier, r.t.pr], [0, 1.5]);
assert.ok(r.calm);

console.log('gfx ok');

// политика ступеней (room.js): сглаживание и родное разрешение не теряем никогда
import { TIERS, prRange } from '../gfx.js';
assert.ok(TIERS.every((t) => t.msaa >= 2), 'MSAA не ниже 2');
assert.equal(prRange(1.25).min, 1.25, 'экран 125%: не ниже родного');
assert.equal(prRange(1).min, 1);
assert.equal(prRange(2).min, 1.5);
assert.equal(prRange(3, true).max, 1.5);
