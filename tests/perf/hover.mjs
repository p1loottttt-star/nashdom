// цена наведения мыши: настоящий обработчик pointermove по сетке экрана (49 точек), мс на вызов
import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('http://localhost:8125/?debug&local');
await page.waitForFunction(() => window.__room, null, { timeout: 60000 });
await page.waitForTimeout(3000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start');
console.log(await page.evaluate(async () => {
  const cv = window.__room.renderer.domElement, r = cv.getBoundingClientRect(), t = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    await new Promise((x) => setTimeout(x, 90));
    const ev = new PointerEvent('pointermove', { clientX: r.left + r.width * (0.1 + i * 0.13), clientY: r.top + r.height * (0.1 + j * 0.13), bubbles: true });
    const q = performance.now(); cv.dispatchEvent(ev); t.push(performance.now() - q);
  }
  t.sort((a, b) => a - b);
  return { n: t.length, p50: +t[24].toFixed(2), p90: +t[44].toFixed(2), max: +t[48].toFixed(2) };
}));
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
profile.samples.forEach((id, i) => { const cf = byId.get(id).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + profile.timeDeltas[i] / 1000); });
console.log([...self].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, ms]) => `${ms.toFixed(1)}мс ${k}`).join(String.fromCharCode(10)));
await ctx.close();
