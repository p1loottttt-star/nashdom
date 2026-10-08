// луч мыши: цена pick по всей сцене и совпадение нового луча по коту со старым точным (по скину)
import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), {
  channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('http://localhost:8125/?debug&local');
await page.waitForFunction(() => window.__room, null, { timeout: 60000 });
await page.waitForTimeout(3000);
console.log(await page.evaluate(() => {
  const R = window.__room, T = R.THREE, ray = new T.Raycaster(), res = {};
  // средняя цена полного луча по сетке экрана
  let t = performance.now(), n = 0;
  for (let x = -0.9; x <= 0.9; x += 0.3) for (let y = -0.9; y <= 0.9; y += 0.3) { ray.setFromCamera(new T.Vector2(x, y), R.camera); ray.intersectObjects(R.scene.children, true); n++; }
  res.pickAvgMs = +((performance.now() - t) / n).toFixed(2);
  // кот: сравнить с точным лучом по скину
  const exact = T.SkinnedMesh.prototype.raycast;
  res.cats = R.catsys.clickables.map((root) => {
    let mesh; root.traverse((o) => { if (o.isSkinnedMesh && !o.userData.isOutline) mesh = o; });
    const box = new T.Box3().setFromObject(mesh, true), c = box.getCenter(new T.Vector3()).project(R.camera), s = box.getSize(new T.Vector3()).length();
    let both = 0, onlyOld = 0, onlyNew = 0, tOld = 0, tNew = 0;
    for (let i = 0; i < 150; i++) {
      const v = new T.Vector2(c.x + (Math.random() - 0.5) * 0.12, c.y + (Math.random() - 0.5) * 0.16);
      ray.setFromCamera(v, R.camera);
      const a = [], b = [];
      mesh.boundingSphere = null; mesh.boundingBox = null; let q = performance.now(); exact.call(mesh, ray, a); tOld += performance.now() - q;
      q = performance.now(); mesh.raycast(ray, b); tNew += performance.now() - q;
      if (a.length && b.length) both++; else if (a.length) onlyOld++; else if (b.length) onlyNew++;
    }
    return { both, onlyOld, onlyNew, oldMs: +(tOld / 150).toFixed(3), newMs: +(tNew / 150).toFixed(4) };
  });
  return res;
}));
await ctx.close();
