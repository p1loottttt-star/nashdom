// темп кадров и цена шага цикла: dev (:8125) против сборки (:8124) подряд в одном окне
import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = ctx.pages()[0] || (await ctx.newPage());
for (const url of process.argv.slice(2).length ? process.argv.slice(2) : ['http://localhost:8125/?debug&local', 'http://localhost:8124/?debug&local']) {
  await page.goto(url);
  await page.waitForFunction(() => window.__room && !document.getElementById('veil'), null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  console.log(url, await page.evaluate(async () => {
    const R = window.__room, d = []; let last = 0;
    await new Promise((done) => { const t0 = performance.now(); const f = (t) => { if (last) d.push(t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
    d.sort((a, b) => a - b);
    const t = performance.now(); R.step(320, 16); const loop = (performance.now() - t) / 20;
    return { p50: +d[d.length >> 1].toFixed(1), p90: +d[Math.floor(d.length * 0.9)].toFixed(1), tier: R.tier, pr: R.pr, loopMs: +loop.toFixed(2), canvas: [R.renderer.domElement.width, R.renderer.domElement.height] };
  }));
}
await ctx.close();
