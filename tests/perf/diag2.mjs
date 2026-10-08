// темп кадров: базовый / без размытия под кнопками / цена шага цикла на процессоре
import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), {
  channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('http://localhost:8125/?debug&local');
await page.waitForFunction(() => window.__room, null, { timeout: 60000 });
await page.waitForTimeout(4000);
const out = await page.evaluate(async () => {
  const R = window.__room;
  const pace = (ms) => new Promise((done) => { const d = []; let last = 0; const t0 = performance.now();
    const f = (t) => { if (last) d.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else { d.sort((a, b) => a - b); done({ n: d.length, p50: +d[d.length >> 1].toFixed(1), p90: +d[Math.floor(d.length * 0.9)].toFixed(1), max: +d[d.length - 1].toFixed(1) }); } };
    requestAnimationFrame(f); });
  const res = { tier: R.tier, pr: R.pr };
  res.base = await pace(3000);
  const hud = document.querySelector('.hud'); hud.style.display = 'none';
  res.noHud = await pace(3000);
  hud.style.display = '';
  document.querySelectorAll('*').forEach((e) => { const cs = getComputedStyle(e); if (cs.backdropFilter !== 'none') e.dataset.bf = '1'; });
  res.base2 = await pace(3000);
  // CPU одного шага цикла (render без ожидания GPU)
  const t = performance.now(); R.step(320, 16); res.loopCpuMs = +((performance.now() - t) / 20).toFixed(2);
  return res;
});
console.log(out);
await ctx.close();
