// эмодзи картинками против текста: снимок окна «Тесты» и панели внизу в обоих вариантах
import { chromium } from 'playwright-core';
const out = process.argv[2] || '.';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0] || (await ctx.newPage());
async function shot(name, block) {
  await page.unrouteAll();
  if (block) { await page.route('**/emoji-worker*', (r) => r.abort()); await page.evaluate(() => caches.delete('emoji-v1')).catch(() => {}); }
  await page.goto('http://localhost:8125/?debug&local');
  await page.waitForFunction(() => window.__room && !document.getElementById('veil'), null, { timeout: 60000 });
  await page.waitForTimeout(block ? 1500 : 4000);
  const p = await page.evaluate(() => { const R = window.__room, v = new R.THREE.Vector3(); new R.THREE.Box3().setFromObject(R.laptop).getCenter(v); v.project(R.camera); const r = R.renderer.domElement.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; });
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(2600);
  await page.click('[data-app=quiz]'); await page.waitForTimeout(1500);
  const n = await page.evaluate(() => document.querySelectorAll('img.emo').length);
  await page.screenshot({ path: `${out}/emo-${name}.png`, clip: await page.locator('.win').first().boundingBox() });
  return n;
}
console.log({ images: await shot('img', false), text: await shot('text', true) });
await ctx.close();
