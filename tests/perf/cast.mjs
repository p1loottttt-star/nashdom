// Стенд эфира «свой фильм»: вкладка A показывает файл, вкладка B смотрит; через N секунд — сводка getStats с обеих сторон (caststats.js).
// node tests/perf/cast.mjs <файл> [--secs=60] [--url=http://localhost:8125] [--q=&castcodec=vp8&castdeg=maintain-resolution]
// Обе вкладки на одной машине (видеокарта общая), сеть — петля: стенд ловит кодировщик, захват и приём, а не интернет.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const FILE = process.argv.slice(2).find((a) => !a.startsWith('--'));
const SECS = +arg('secs', 60), BASE = arg('url', 'http://localhost:8125');
if (!FILE || !fs.existsSync(FILE)) { console.error('нужен путь к видеофайлу'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'cast-')), {
  channel: 'chrome', headless: false, viewport: null,
  args: ['--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const open = async (q) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', q, e.message));
  await p.goto(`${BASE}/?debug&local${q}${arg('q', '')}`);
  await p.waitForFunction(() => window.__room, null, { timeout: 60000 });
  await p.locator('.rsetup button', { hasText: 'готово' }).click({ timeout: 4000 }).catch(() => {});
  // как человек: клик по ноутбуку в комнате (тогда сцена за рабочим столом встаёт на паузу), потом значок CoupleTube
  await p.waitForTimeout(1500);
  const xy = await p.evaluate(() => {
    const R = window.__room, o = R.laptop, v = new R.THREE.Vector3();
    o.updateWorldMatrix(true, false); new R.THREE.Box3().setFromObject(o).getCenter(v); v.project(R.camera);
    const r = R.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  });
  await p.mouse.click(xy.x, xy.y);
  await p.waitForSelector('#desktop.on', { timeout: 15000 });
  await p.waitForTimeout(800);
  await p.click('.icon[data-app=tube]');
  await p.waitForSelector('.tpick input[type=file]', { state: 'attached', timeout: 20000 });
  return p;
};
const A = await open(''), B = await open('&as=b');
await A.bringToFront();
await A.locator('.tpick input[type=file]').setInputFiles(FILE);
console.log('файл выбран, ждём эфир…');
await B.waitForFunction(() => window.__cast?.viewer?.samples?.length > 3, null, { timeout: 60000 }).catch(() => console.log('эфир не пришёл'));
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) {
  await sleep(10000);
  const [h, v] = await Promise.all([A.evaluate(() => window.__cast?.host?.samples?.at(-1)), B.evaluate(() => window.__cast?.viewer?.samples?.at(-1))]);
  console.log(`${Math.round((Date.now() - t0) / 1000)}с  отдаёт: ${h?.fps} к/с ${h?.res} ${h?.kbps} кбит/с enc ${h?.encMs} мс lim=${h?.lim}  |  смотрит: ${v?.fps} к/с фризов ${v?.frz} сброшено ${v?.drop} буфер ${v?.jbMs} мс`);
}
const out = { file: path.basename(FILE), host: await A.evaluate(() => window.__cast?.host), viewer: await B.evaluate(() => window.__cast?.viewer) };
fs.writeFileSync(new URL('./last-cast.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('\nотдаёт:', out.host?.sum, '\nсмотрит:', out.viewer?.sum);
await ctx.close();
