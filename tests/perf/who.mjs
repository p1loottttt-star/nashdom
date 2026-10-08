import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080'] });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('http://localhost:8125/?debug&local');
await page.waitForFunction(() => window.__room, null, { timeout: 60000 });
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const R = window.__room, out = [];
  R.scene.traverse((o) => { if (!o.isMesh || o.raycast !== R.THREE.Mesh.prototype.raycast) return; const g = o.geometry, tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (tri < 250) return; const p = o.getWorldPosition(new R.THREE.Vector3());
    out.push({ tri, geo: g.type, live: !!o.userData.liveGeo, dyn: g.attributes.position.usage === 35048, keys: Object.keys(o.userData).join(','), parent: o.parent?.type + ':' + (o.parent?.name || ''), pos: p.toArray().map((x) => +x.toFixed(2)), mat: o.material.type, papers: R.papers.some((x) => x.mesh === o) }); });
  return out;
}));
await ctx.close();
