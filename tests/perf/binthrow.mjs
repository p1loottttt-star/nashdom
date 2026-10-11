// Бросок в мусорку: открыть записку → «в мусорку» → стрелка (пробел/тап) → сила → полёт. Снимки фаз + проверка, что идеальные значения попадают.
// node tests/perf/binthrow.mjs <папка для снимков> [порт=8126] [ширина=1440] [высота=900]
import { chromium } from 'playwright-core';
const [OUT, PORT = 8126, W = 1440, H = 900] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: +W, height: +H }, hasTouch: +W < 768 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
await p.goto(`http://localhost:${PORT}/?debug&local`);
await p.waitForFunction(() => window.__room, null, { timeout: 60000 }); await p.waitForTimeout(3500);
await p.evaluate(() => document.querySelectorAll('.rsetup').forEach((e) => e.remove()));
const shot = (n) => p.screenshot({ path: `${OUT}/bin-${W}-${n}.png` });
const tap = (x, y) => (+W < 768 ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));

async function throwOnce(n, perfect) {
  // любая записка на столе — кликом, как человек
  const xy = await p.evaluate(() => {
    const R = window.__room, q = R.papers.find((q) => q.slot && R.clickables.includes(q.mesh)), v = q.mesh.getWorldPosition(new R.THREE.Vector3()).project(R.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  });
  await tap(xy.x, xy.y);
  await p.waitForFunction(() => window.__room.state === 'note', null, { timeout: 8000 });
  await p.click('#trashBtn');
  await p.waitForFunction(() => window.__room.state === 'aim', null, { timeout: 8000 });
  await p.waitForTimeout(500); await shot(n + '-1-dir');
  if (perfect) { // идеальные значения: верное направление с поправкой на ветер и середина зелёной зоны
    await p.evaluate(async () => {
      const { bestTheta, P_BEST } = await import('/binthrow.js'), a = window.__room.aim(), len = Math.hypot(1.25 - a.hold.x, -1.45 - a.hold.z);
      a.phase = 'pow'; a.theta = bestTheta(len, a.wind); a.per = 1e9; a.t0 = performance.now() - P_BEST * 0.5e9; document.body.classList.add('binpow');
    });
    await p.waitForTimeout(200); await shot(n + '-2-pow');
    await p.keyboard.press('Space');
  } else {
    if (+W < 768) await tap(W / 2, H / 2); else await p.keyboard.press('Space');
    await p.waitForTimeout(400); await shot(n + '-2-pow');
    if (+W < 768) await tap(W / 2, H / 2); else await p.keyboard.press('Space');
  }
  await p.waitForTimeout(700); await shot(n + '-3-fly');
  const res = await p.waitForFunction(() => [...document.querySelectorAll('.float')].map((e) => e.textContent).find((t) => /♥|мимо/.test(t)), null, { timeout: 10000 }).then((h) => h.jsonValue());
  await p.waitForFunction(() => window.__room.state === 'room', null, { timeout: 10000 });
  const tip = await p.textContent('#tip'); await shot(n + '-4-home');
  return { res, tip };
}
const r1 = await throwOnce('a', true), r2 = await throwOnce('b', false);
console.log({ perfect: r1, timed: r2, errs });
if (!/\+3/.test(r1.res)) { console.error('идеальный бросок не попал'); process.exitCode = 1; }
if (errs.length) process.exitCode = 1;
await b.close();
