// Снимок страницы настоящим Chrome без окна (скрытая панель превью снимки не делает).
// node tests/shot.mjs <url> <файл.png> [ширина] [высота] [js-до-снимка]
import { chromium } from 'playwright-core';

const [url, out, w = 1440, h = 900, js] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.error('pageerror:', e.message));
p.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
await p.goto(url, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
if (js) await p.evaluate(js);
await p.waitForTimeout(700);
await p.screenshot({ path: out });
await b.close();
console.log('ok', out);
