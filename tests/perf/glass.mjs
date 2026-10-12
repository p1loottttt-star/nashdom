// Стекло в комнате (Э1): снимки (комната, листы, карточка, список; телефон), колокольчик от записки партнёра, время кадра со стеклом / flatglass / без.
// node tests/perf/glass.mjs <папка для снимков> [порт=8126]   — локальный режим (?local), store приложения — window.__room.store, две половинки в одном браузере
import { chromium } from 'playwright-core';
const [OUT, PORT = 8126] = process.argv.slice(2);
const URL = `http://localhost:${PORT}/?debug&local`;
// HEADED=1 — настоящее окно Chrome (видеокарта, как bench.mjs); мерить только от сети: на батарее Chrome держит 30 к/с
const HEADED = !!process.env.HEADED;
const b = await chromium.launch({ channel: 'chrome', headless: !HEADED, args: HEADED ? ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] : [] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const errs = [];
const open = async (q = '') => {
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + q); await p.waitForFunction(() => window.__room && document.getElementById('lgui'), null, { timeout: 60000 }); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll('.rsetup').forEach((e) => e.remove()));
  return p;
};
const a = await open(), sb = await open('&as=b');
await a.bringToFront(); await a.waitForTimeout(800);
await a.screenshot({ path: `${OUT}/room.png` });

// записка от Сони → у Вани карточка и счётчик
const id = 'glass' + Date.now();
await sb.evaluate((id) => { const s = window.__room.store; return s.put('notes', id, { id, from: s.me().name, date: new Date().toISOString(), text: 'Смотри, что я нашла про Прагу — давай в мае?' }); }, id);
await a.waitForSelector('.lg-card', { timeout: 5000 }).catch(() => {});
const card = await a.locator('.lg-card').count(), n1 = await a.locator('.lg-badge:not([hidden])').textContent().catch(() => '');
await a.screenshot({ path: `${OUT}/card.png` });
await a.locator('.lg-tr .lg-round').click(); await a.waitForTimeout(400);
await a.screenshot({ path: `${OUT}/list.png` });
await a.evaluate((id) => window.__room.store.put('read', id, { at: Date.now() }), id);
// в комнате пересчёт делает setBusy(false) после прочтения
await a.evaluate(() => window.__room.hud().refresh()); await a.waitForTimeout(300);
const n2 = await a.locator('.lg-badge').evaluate((e) => (e.hidden ? '' : e.textContent));
await a.keyboard.press('Escape');

// листы
await a.locator('.lg-tab[data-tab=memory]').click(); await a.waitForSelector('.lg-book'); await a.waitForTimeout(500);
await a.screenshot({ path: `${OUT}/memory.png` });
await a.locator('.lg-tab[data-tab=home]').click(); await a.waitForTimeout(500);
await a.screenshot({ path: `${OUT}/home.png` });
await a.keyboard.press('Escape');

// время кадра: интервалы rAF за 4 с (headless — процессорная растеризация; настоящий замер — на Radeon у Вани)
const frames = (setup) => a.evaluate(async (setup) => {
  document.body.classList.toggle('flatglass', setup === 'flat'); document.getElementById('lgui').style.display = setup === 'none' ? 'none' : '';
  await new Promise((r) => setTimeout(r, 600));
  const t = []; let last = performance.now();
  await new Promise((done) => { const f = (now) => { t.push(now - last); last = now; t.length < 240 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
  t.sort((x, y) => x - y);
  return { med: +t[t.length >> 1].toFixed(1), p95: +t[Math.floor(t.length * 0.95)].toFixed(1) };
}, setup);
const perf = { glass: await frames('glass'), flat: await frames('flat'), none: await frames('none') };
await frames('glass');

// телефон
await a.setViewportSize({ width: 390, height: 844 }); await a.waitForTimeout(800);
await a.screenshot({ path: `${OUT}/phone.png` });
await a.locator('.lg-tab[data-tab=memory]').click(); await a.waitForTimeout(600);
await a.screenshot({ path: `${OUT}/phone-memory.png` });

const gpu = await a.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'), x = gl?.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : '?'; });
const res = { card, badgeAfterNote: n1, badgeAfterRead: n2, perf, gpu, errs };
console.log(JSON.stringify(res, null, 1));
const ok = card === 1 && n1 === '1' && n2 === '' && !errs.length;
console.log(ok ? 'glass ok' : 'НЕ ПРОШЛО'); if (!ok) process.exitCode = 1;
await b.close();
