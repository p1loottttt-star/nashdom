// темп кадров по секундам сразу после снятия заставки (что догружается в первые секунды)
import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.addInitScript(() => {
  const P = (window.__pf = { f: [], loaf: [] }); let last = 0;
  const f = (t) => { if (last) P.f.push([t, t - last]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) P.loaf.push([Math.round(e.startTime), Math.round(e.duration), e.scripts.map((s) => (s.sourceFunctionName || '?') + '@' + (s.sourceURL || '').split('/').pop().split('?')[0] + ':' + Math.round(s.duration) + ' ' + s.invoker).join(' | ')]); }).observe({ type: 'long-animation-frame', buffered: true });
});
for (const url of process.argv.slice(2)) {
  await page.goto(url);
  await page.waitForFunction(() => performance.getEntriesByName('lr:shown').length, null, { timeout: 90000 });
  await page.waitForTimeout(12000);
  console.log(url, await page.evaluate(() => {
    const s = performance.getEntriesByName('lr:shown')[0].startTime, P = window.__pf, sec = [];
    for (let i = 0; i < 12; i++) { const d = P.f.filter(([t]) => t >= s + i * 1000 && t < s + (i + 1) * 1000).map(([, x]) => x).sort((a, b) => a - b); sec.push(`${i}:${Math.round(d[d.length >> 1] || 0)}/${Math.round(d[d.length - 1] || 0)}`); }
    return { perSec_p50_max: sec.join(' '), longAfterShown: P.loaf.filter(([t, d]) => t > s && d > 60).slice(0, 8) };
  }));
}
await ctx.close();
