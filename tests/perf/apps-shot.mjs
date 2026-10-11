// Снимки окон ноутбука по очереди (для проверки вида): node tests/perf/apps-shot.mjs <папка> [порт или адрес] [приложения через запятую; «app@селектор» — нажать в окне перед снимком]
import { chromium } from 'playwright-core';
const [OUT, AT = 8126, LIST = 'shop,profile,gallery,plans,thoughts,tube'] = process.argv.slice(2);
const base = /^http/.test(AT) ? AT : `http://localhost:${AT}`;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`${base}/?debug&local`); await p.waitForFunction(() => document.querySelector('#desktop') && window.__room, null, { timeout: 60000 }); await p.waitForTimeout(3500);
await p.evaluate(() => document.querySelectorAll('.rsetup').forEach((e) => e.remove()));
// SEED=1 — тестовая папка с фото, письма и план в локальном доме (только ?local, на dev-сервере)
if (process.env.SEED) await p.evaluate(async () => {
  const s = await import('/store.js'), now = new Date().toISOString();
  if (!s.all('folders').length) {
    await s.put('folders', 'f1', { name: 'Море', color: '#9fc7d9', created: Date.now() });
    for (const [i, k] of ['cd-macaron', 'hp-r-luna', 'tm-galaxy', 'cd-waffles', 'tf-sushi', 'hp-cover'].entries()) await s.put('photos', 'p' + i, { folder: 'f1', url: `/quiz/${k}.webp`, caption: ['наш завтрак', 'луна над морем', '', 'вафли!', 'суши-вечер', 'замок'][i], date: now, who: 'Ваня' });
    await s.put('thoughts', 't1', { text: 'Купить тебе те самые макароны по дороге домой', from: 'Ваня', date: now.slice(0, 10) });
    await s.put('thoughts', 't2', { text: 'Скучаю, приезжай скорее', from: 'Соня', date: now.slice(0, 10) });
  }
});
const xy = await p.evaluate(() => { const R = window.__room, v = new R.THREE.Vector3(); R.laptop.updateWorldMatrix(true, false); new R.THREE.Box3().setFromObject(R.laptop).getCenter(v); v.project(R.camera); const r = R.renderer.domElement.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; });
await p.mouse.click(xy.x, xy.y); await p.waitForSelector('#desktop.on', { timeout: 15000 }); await p.waitForTimeout(800);
for (const spec of LIST.split(',')) {
  const [app, sel] = spec.split('@');
  await p.click(`.icon[data-app=${app}]`); await p.waitForTimeout(1800);
  if (sel) { await p.click(`.win.app-${app} ${sel}`); await p.waitForTimeout(900); }
  const name = spec.replace(/[^\wа-я-]+/gi, '_'); await p.screenshot({ path: `${OUT}/app-${name}.png` }); console.log('ok', name);
  await p.evaluate(() => document.querySelectorAll('.win').forEach((w) => w.querySelector('.lt.r')?.click())); await p.waitForTimeout(500);
}
await b.close();
