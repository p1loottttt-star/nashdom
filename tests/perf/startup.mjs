// профиль процессора старта: что строится между lr:store и lr:built (сборка сцены) и до lr:shown
import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0] || (await ctx.newPage());
const url = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8125/?debug&local';
await page.goto(url); await page.waitForTimeout(500); // прогреть кеш модулей
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
await page.goto(url);
await page.waitForFunction(() => performance.getEntriesByName('lr:shown').length, null, { timeout: 90000 });
const { profile } = await cdp.send('Profiler.stop');
const marks = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)])));
await ctx.close();
// собственное время и «вместе с вызванным» по функциям
const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const self = new Map(), total = new Map();
const name = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().split('?')[0]}:${n.callFrame.lineNumber + 1}`;
profile.samples.forEach((id, i) => {
  const ms = (profile.timeDeltas[i] || 0) / 1000, seen = new Set();
  const n = byId.get(id); self.set(name(n), (self.get(name(n)) || 0) + ms);
  for (let x = id; x != null; x = parent.get(x)) { const k = name(byId.get(x)); if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) || 0) + ms); } }
});
const top = (m, n, f = () => true) => [...m].filter(([k]) => !/^\((idle|program|root)\)/.test(k) && f(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${Math.round(v)}мс ${k}`).join('\n');
console.log(marks);
console.log('--- собственное время ---\n' + top(self, 18));
console.log('--- вместе с вызванным (наши файлы) ---\n' + top(total, 22, (k) => /\.js:/.test(k) && !/three|vite|chunk|deps/.test(k)));
