// бросок в мусорку: центр зелёной зоны + поправка на ветер = центр корзины, край зоны = край корзины
import assert from 'node:assert/strict';
import { G, shot, bestTheta, zone, P_BEST, SWEEP } from '../binthrow.js';

const from = { x: 0.8, y: 1.0, z: 0.1 }, bin = { x: 1.25, z: -1.45 }, rimY = 0.34, tol = 0.1;
// как stepFly: полушаги 1/120, сначала скорость, потом положение; ветер — вбок
function cross(theta, p, wind) {
  const s = shot(from, bin, theta, p, rimY), pos = { ...from }, v = [...s.v], dt = 1 / 120;
  for (let i = 0; i < 2000; i++) {
    const y0 = pos.y;
    v[1] += G * dt; v[0] += s.right[0] * wind * dt; v[2] += s.right[1] * wind * dt;
    pos.x += v[0] * dt; pos.y += v[1] * dt; pos.z += v[2] * dt;
    if (y0 >= rimY && pos.y < rimY) {
      const dx = pos.x - bin.x, dz = pos.z - bin.z, d0 = [(bin.x - from.x) / s.len, (bin.z - from.z) / s.len];
      return { along: dx * d0[0] + dz * d0[1], lat: dx * s.right[0] + dz * s.right[1], vy: v[1] };
    }
  }
  throw new Error('не пересёк край');
}
const len = Math.hypot(bin.x - from.x, bin.z - from.z), z = zone(len, tol);
for (const wind of [0, 0.5, -0.5]) {
  const c = cross(bestTheta(len, wind), P_BEST, wind);
  assert.ok(Math.hypot(c.along, c.lat) < 0.03, `ветер ${wind}: мимо центра ${JSON.stringify(c)}`);
  assert.ok(c.vy < -1, 'к краю комок падает сверху');
  assert.ok(Math.abs(bestTheta(len, wind)) < SWEEP * 0.6, 'верное направление внутри размаха стрелки');
}
assert.ok(Math.abs(cross(0, z.hi, 0).along - tol) < 0.03, 'верх зелёной зоны — дальний край');
assert.ok(Math.abs(cross(0, z.lo, 0).along + tol) < 0.03, 'низ зелёной зоны — ближний край');
assert.ok(z.lo > 0.3 && z.hi < 0.9 && z.glo > z.lo && z.ghi < z.hi);
console.log('binthrow ok');
