// Стол ноутбука: значки перетаскиваются и запоминают место (клик после переноса не открывает приложение), док увеличивает значки без обрезки.
// node tests/perf/desk.mjs <папка для снимков> [порт=8126|https://…]
import { chromium } from 'playwright-core';
const [OUT, PORT = 8126] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${/^http/.test(PORT) ? PORT : `http://localhost:${PORT}`}/?debug&local`); await p.waitForFunction(() => window.__room, null, { timeout: 60000 }); await p.waitForTimeout(3000);
await p.evaluate(() => document.querySelectorAll('.rsetup').forEach((e) => e.remove()));
const xy = await p.evaluate(() => { const R = window.__room, v = new R.THREE.Vector3(); R.laptop.updateWorldMatrix(true, false); new R.THREE.Box3().setFromObject(R.laptop).getCenter(v); v.project(R.camera); return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }; });
await p.mouse.click(xy.x, xy.y); await p.waitForSelector('#desktop.on'); await p.waitForTimeout(900);
const ic = await p.locator('.icon[data-app=games]').boundingBox();
await p.mouse.move(ic.x + 40, ic.y + 30); await p.mouse.down(); await p.mouse.move(700, 420, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(300);
const moved = await p.locator('.icon[data-app=games]').boundingBox(), opened = await p.locator('.win.app-games').count();
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('lr:icons') || 'null')?.games);
await p.locator('.icon[data-app=games]').click(); await p.waitForTimeout(600); const opened2 = await p.locator('.win.app-games').count();
await p.evaluate(() => document.querySelectorAll('.win').forEach((w) => w.querySelector('.tl-close, .close, [data-a=close]')?.click()));
// док: курсор над значком — он больше дока и не обрезан маской
const d = await p.locator('.dock [data-app=quiz]').boundingBox(), dock = await p.locator('.dock').boundingBox();
await p.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await p.waitForTimeout(400);
const big = await p.locator('.dock [data-app=quiz] i').boundingBox();
await p.screenshot({ path: `${OUT}/desk.png` });
await p.screenshot({ path: `${OUT}/dock.png`, clip: { x: dock.x - 20, y: dock.y - 60, width: dock.width + 40, height: dock.height + 70 } });
await p.reload(); await p.waitForFunction(() => window.__room, null, { timeout: 60000 }); await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelectorAll('.rsetup').forEach((e) => e.remove()));
await p.mouse.click(xy.x, xy.y); await p.waitForSelector('#desktop.on'); await p.waitForTimeout(900);
const after = await p.locator('.icon[data-app=games]').boundingBox();
const res = { moved: [Math.round(moved.x), Math.round(moved.y)], saved, openedOnDrag: opened, openedOnClick: opened2, iconTop: Math.round(big.y), dockTop: Math.round(dock.y), afterReload: [Math.round(after.x), Math.round(after.y)], errs };
console.log(res);
const ok = Math.abs(moved.x - 656) < 20 && opened === 0 && opened2 === 1 && big.y < dock.y && Math.abs(after.x - moved.x) < 2 && !errs.length;
console.log(ok ? 'desk ok' : 'НЕ ПРОШЛО'); if (!ok) process.exitCode = 1;
await b.close();
