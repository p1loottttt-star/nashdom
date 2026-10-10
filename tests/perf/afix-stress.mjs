// Стресс переводчика звука (audiofix.js): режем куски подряд, как за весь фильм, — ловим утечку памяти ffmpeg.wasm.
// node tests/perf/afix-stress.mjs <файл> [кусков=400] [адрес=http://localhost:8126]
import { chromium } from 'playwright-core';
const [FILE, N = 400, BASE = 'http://localhost:8126'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext()).newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(BASE + '/?local&debug');
await p.waitForFunction(() => window.__room, null, { timeout: 60000 }); await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelectorAll('.rsetup').forEach((e) => e.remove()));
// ноутбук — кликом, как человек (в сборке модули с хешами, import('/desktop.js') не найдётся)
const xy = await p.evaluate(() => { const R = window.__room, v = new R.THREE.Vector3(); R.laptop.updateWorldMatrix(true, false); new R.THREE.Box3().setFromObject(R.laptop).getCenter(v); v.project(R.camera); const r = R.renderer.domElement.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; });
await p.mouse.click(xy.x, xy.y); await p.waitForSelector('#desktop.on', { timeout: 15000 }); await p.waitForTimeout(800); await p.click('.icon[data-app=tube]');
await p.waitForSelector('.tpick input[type=file]', { state: 'attached' });
await p.locator('.tpick input[type=file]').setInputFiles(FILE);
await p.waitForFunction(() => window.__afix?.ms?.length > 0, null, { timeout: 90000 });
await p.evaluate(() => document.querySelector('.tube video').pause());
const t0 = Date.now();
const r = await p.evaluate(async (n) => {
  const out = { done: 0, err: null, recycles: 0 };
  for (let k = 0; k < n; k++) {
    try { await window.__afix.get(k); out.done = k + 1; } catch (e) { out.err = `кусок ${k}: ${e.message || e}`; break; }
  }
  out.recycles = window.__afix.recycles || 0;
  return out;
}, +N);
console.log(JSON.stringify(r), Math.round((Date.now() - t0) / 1000) + ' с');
await b.close();
