// Трассировка Chrome (devtools.timeline) на открытии ноутбука и окон: сколько стоят стили, раскладка, покраска, растр.
// Запуск: `npm run dev`, потом `node tests/perf/trace.mjs`. Итог — по шагам, самые дорогие события главного потока.
import { chromium } from 'playwright-core';

const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), {
  channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = ctx.pages()[0] || (await ctx.newPage());
if (process.argv.includes('--strip-emoji')) await page.addInitScript(() => { // опыт: эмодзи вырезаны из всего, что добавляется в документ
  const re = /\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu;
  const strip = (n) => { const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); for (let t; (t = w.nextNode());) if (re.test(t.data)) t.data = t.data.replace(re, ''); };
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => (n.nodeType === 1 ? strip(n) : n.nodeType === 3 && (n.data = n.data.replace(re, '')))))).observe(document, { childList: true, subtree: true });
  addEventListener('DOMContentLoaded', () => strip(document.body));
});
await page.goto('http://localhost:8125/?debug&local');
await page.waitForFunction(() => window.__room && document.getElementById('veil') === null, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(page);
const events = [];
cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });

const marks = [];
const mark = async (n) => { marks.push(n); await page.evaluate((x) => console.timeStamp('step:' + x), n); };
const at = (expr) => page.evaluate((e) => { const o = eval(e), R = window.__room, v = new R.THREE.Vector3(); new R.THREE.Box3().setFromObject(o).getCenter(v); v.project(R.camera); const r = R.renderer.domElement.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; }, expr);
await mark('laptop-open'); const p = await at('window.__room.laptop'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(2500);
for (const app of ['quiz', 'profile', 'shop', 'tube']) { await mark('app:' + app); await page.click(`[data-app=${app}]`); await page.waitForTimeout(1600); await page.evaluate(() => document.querySelector('.win .lt.r')?.click()); await page.waitForTimeout(400); }
await mark('laptop-close'); await page.click('#power'); await page.waitForTimeout(2200);
await mark('write'); await page.click('#write'); await page.waitForTimeout(800);
await mark('end');
await cdp.send('Tracing.end');
await done;
await ctx.close();

// главный поток рендерера страницы; шаги — по меткам console.timeStamp('step:…')
const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
const pid = main?.pid, tid = main?.tid;
const stamps = events.filter((e) => e.name === 'TimeStamp' && String(e.args?.data?.message).startsWith('step:')).map((e) => [e.ts, e.args.data.message.slice(5)]).sort((a, b) => a[0] - b[0]);
const NAMES = new Set(['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'FunctionCall', 'TimerFire', 'FireAnimationFrame', 'RasterTask', 'GPUTask', 'Decode Image', 'ImageDecodeTask', 'EventDispatch', 'ParseHTML']);
const ev = events.filter((e) => e.ph === 'X' && NAMES.has(e.name));
for (let i = 0; i < stamps.length - 1; i++) {
  const [t0, n] = stamps[i], t1 = stamps[i + 1][0];
  const inStep = ev.filter((e) => e.ts >= t0 && e.ts < t1);
  const sum = {};
  for (const e of inStep) { const k = (e.pid === pid && e.tid === tid ? '' : '[др.поток] ') + e.name; sum[k] = (sum[k] || 0) + e.dur / 1000; }
  const big = inStep.filter((e) => e.pid === pid && e.tid === tid && ['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'Commit'].includes(e.name) && e.dur > 8000)
    .map((e) => `${e.name} ${(e.dur / 1000).toFixed(1)}мс${e.args?.elementCount ? ' элементов ' + e.args.elementCount : ''}${e.args?.beginData?.dirtyObjects ? ' грязных ' + e.args.beginData.dirtyObjects + '/' + e.args.beginData.totalObjects : ''}`);
  console.log('==', n);
  console.log(Object.entries(sum).filter(([, v]) => v > 3).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}мс`).join(' | '));
  if (big.length) console.log('  крупные:', big.slice(0, 8).join('; '));
}
