// Стенд плавности: настоящий Chrome на этой машине (её видеокарта), сценарий как у человека,
// по каждому шагу — время кадров, длинные кадры (Long Animation Frames) с виновными скриптами и профиль процессора.
// Запуск: dev-сервер (`npm run dev`, :8125), потом `node tests/perf/bench.mjs [url] [--no-profile]`.
// Пишет отчёт в tests/perf/last.json и таблицу в консоль.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL_ = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8125/?debug&local';
const PROFILE = !process.argv.includes('--no-profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// постоянный профиль — как у человека, который заходит не первый раз (кеш модулей, настройки комнаты)
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), {
  channel: 'chrome', headless: false, viewport: null,
  args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const browser = ctx;
const page = ctx.pages()[0] || await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.removeItem('lr:gfx3'); } catch {} // каждый прогон — с одной и той же ступени качества
  const P = (window.__perf = { frames: [], marks: [], loaf: [], progs: [] });
  let last = 0;
  const f = (t) => { if (last) P.frames.push([t, t - last]); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.loaf.push({
      t: e.startTime, dur: Math.round(e.duration), block: Math.round(e.blockingDuration),
      render: e.renderStart ? Math.round(e.startTime + e.duration - e.renderStart) : 0,
      scripts: e.scripts.map((s) => ({ fn: s.sourceFunctionName || '(anon)', url: (s.sourceURL || '').split('/').pop().split('?')[0], pos: s.sourceCharPosition, dur: Math.round(s.duration), inv: s.invoker, layout: Math.round(s.forcedStyleAndLayoutDuration || 0) })),
    }); }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  window.__mark = (n) => { P.marks.push([performance.now(), n]); P.progs.push(window.__room?.renderer.info.programs.length ?? 0); };
});

const cdp = await ctx.newCDPSession(page);
const profiles = [];
if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); }
let cur = null;
async function step(name, fn, after = 1500) {
  if (cur && PROFILE) profiles.push([cur, (await cdp.send('Profiler.stop')).profile]);
  cur = name;
  if (PROFILE) await cdp.send('Profiler.start');
  await page.evaluate((n) => window.__mark(n), name);
  await fn();
  await sleep(after);
}
// экранная точка объекта сцены (в CSS-пикселях окна)
const at = (expr) => page.evaluate((e) => {
  const o = eval(e), R = window.__room, v = new R.THREE.Vector3();
  o.updateWorldMatrix(true, false); new R.THREE.Box3().setFromObject(o).getCenter(v); v.project(R.camera);
  const r = R.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, expr);
const click = async (expr) => { const p = await at(expr); await page.mouse.move(p.x, p.y, { steps: 8 }); await page.mouse.click(p.x, p.y); };

const t0 = Date.now();
await page.goto(URL_);
await step('load', () => page.waitForFunction(() => window.__room && window.__perf.frames.length > 30, null, { timeout: 60000 }), 500);
console.log('загрузка до 30 кадров:', Date.now() - t0, 'мс');
await page.locator('.rsetup button', { hasText: 'готово' }).click({ timeout: 4000 }).catch(() => {}); // первый вход: окно «Твоя комната»
const info = await page.evaluate(() => ({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight, gpu: (() => { const gl = document.createElement('canvas').getContext('webgl2'); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : '?'; })(), tier: window.__room.tier, pr: window.__room.pr }));
console.log(info);

await step('idle', async () => {}, 4000);
await step('mouse', async () => { for (let i = 0; i <= 120; i++) { const a = (i / 120) * Math.PI * 4; await page.mouse.move(960 + Math.cos(a) * 600, 540 + Math.sin(a) * 300); await sleep(30); } }, 300);
await step('laptop-open', () => click('window.__room.laptop'), 2500);
for (const app of ['tube', 'shop', 'quiz', 'games', 'gallery', 'plans', 'profile']) {
  await step('app:' + app, () => page.click(`[data-app=${app}]`), 1800);
  await page.evaluate(() => document.querySelector('.win .dot.r')?.click());
}
await step('laptop-close', () => page.click('#power'), 2500);
await step('zoom-desk', () => page.evaluate(() => window.__room.zoomTo('desk')), 1500);
await step('unzoom', () => page.evaluate(() => window.__room.unzoom()), 1300);
await step('zoom-photos', () => page.evaluate(() => window.__room.zoomTo('photos')), 1500);
await step('unzoom2', () => page.evaluate(() => window.__room.unzoom()), 1300);
await step('note-open', () => click('window.__room.papers.find((p) => !p.read)?.mesh || window.__room.papers[0].mesh'), 2200);
await step('note-close', () => page.keyboard.press('Escape'), 1800);
await step('note-write', async () => { await page.click('#write'); await sleep(300); await page.fill('#noteForm textarea', 'привет, проверка плавности'); }, 500);
await step('note-aim', () => page.evaluate(() => document.getElementById('noteForm').requestSubmit()), 1200);
await step('note-throw', async () => { // рогатка: оттянуть вниз и отпустить
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  await page.mouse.move(w / 2, h * 0.55); await page.mouse.down();
  await page.mouse.move(w / 2 + 20, h * 0.85, { steps: 15 }); await page.mouse.up();
}, 4500);
console.log('перед расстановкой:', await page.evaluate(() => ({ state: window.__room.state, busy: document.body.className, hud: getComputedStyle(document.querySelector('.hud')).cssText.length, modal: !document.getElementById('modal').hidden })));
await step('arrange', () => page.evaluate(() => document.getElementById('arrange').click()), 2500);
await step('arrange-exit', () => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /готово|выйти/.test(b.textContent) && b.offsetParent)?.click()), 2000);
await step('idle2', async () => {}, 4000);
if (PROFILE) profiles.push([cur, (await cdp.send('Profiler.stop')).profile]);

const perf = await page.evaluate(() => window.__perf);
await browser.close();

// ---------- отчёт ----------
const marks = perf.marks.concat([[Infinity, 'end']]);
const seg = (t) => { for (let i = marks.length - 2; i >= 0; i--) if (t >= marks[i][0]) return marks[i][1]; return 'pre'; };
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
const hot = (profile) => {
  const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => { const n = byId.get(id), cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0) / 1000); });
  return [...self].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k) || k.startsWith('(garbage')).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, ms]) => `${Math.round(ms)}мс ${k}`);
};
const rows = [];
for (let i = 0; i < marks.length - 1; i++) {
  const [t, name] = marks[i], end = marks[i + 1][0];
  const fr = perf.frames.filter(([ft]) => ft >= t && ft < end).map(([, d]) => d);
  const lf = perf.loaf.filter((e) => e.t >= t && e.t < end);
  rows.push({
    step: name, frames: fr.length, p50: Math.round(pct(fr, 0.5)), p95: Math.round(pct(fr, 0.95)), max: Math.round(Math.max(0, ...fr)),
    over50: fr.filter((d) => d > 50).length, over100: fr.filter((d) => d > 100).length, newProgs: (perf.progs[i + 1] ?? perf.progs[i]) - perf.progs[i],
    loaf: lf.sort((a, b) => b.dur - a.dur).slice(0, 3).map((e) => ({ dur: e.dur, block: e.block, render: e.render, scripts: e.scripts.sort((a, b) => b.dur - a.dur).slice(0, 3) })),
    hot: hot(profiles.find(([n]) => n === name)?.[1] || { nodes: [], samples: [], timeDeltas: [] }),
  });
}
console.table(rows.map(({ step, frames, p50, p95, max, over50, over100, newProgs }) => ({ step, frames, p50, p95, max, over50, over100, newProgs })));
const end = await Promise.resolve(info);
fs.writeFileSync(new URL('./last.json', import.meta.url), JSON.stringify({ info, rows }, null, 1));
console.log('подробно: tests/perf/last.json');
