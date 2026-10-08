// дымовая проверка двумя вкладками (локальный режим): записка, тест, сообщение чата доходят до второй половинки
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:8124';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1600,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const a = ctx.pages()[0] || (await ctx.newPage()), b = await ctx.newPage();
await a.goto(base + '/?debug&local'); await b.goto(base + '/?debug&local&as=b');
for (const p of [a, b]) await p.waitForFunction(() => window.__room && !document.getElementById('veil'), null, { timeout: 90000 });
const errs = []; for (const p of [a, b]) p.on('pageerror', (e) => errs.push(e.message));
const n0 = await b.evaluate(() => window.__room.papers.length);
const text = 'дым ' + Date.now();
await a.click('#write'); await a.fill('#noteForm textarea', text); await a.evaluate(() => document.getElementById('noteForm').requestSubmit());
await b.waitForFunction((n) => window.__room.papers.length > n, n0, { timeout: 10000 });
const note = await b.evaluate(() => window.__room.papers.at(-1).note.text);
console.log({ noteArrived: note, errors: errs });
await ctx.close();
