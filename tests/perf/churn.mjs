// какие материалы меняют version (→ three заново подбирает программу) и как часто
import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('http://localhost:8125/?debug&local');
await page.waitForFunction(() => window.__room, null, { timeout: 60000 });
await page.waitForTimeout(3000);
console.log(await page.evaluate(async () => {
  const R = window.__room, ver = new Map(), owner = new Map();
  R.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) { ver.set(m, m.version); owner.set(m, o); } });
  let calls = 0; const orig = R.renderer.info.programs.length;
  await new Promise((x) => setTimeout(x, 2000));
  const out = [];
  for (const [m, v] of ver) if (m.version !== v) { const o = owner.get(m); out.push({ bumps: m.version - v, type: m.type, name: m.name, obj: o.type + ':' + (o.name || o.parent?.name || ''), pos: o.getWorldPosition(new R.THREE.Vector3()).toArray().map((x) => +x.toFixed(2)).join(' '), color: m.color?.getHexString(), map: !!m.map, opacity: m.opacity, transparent: m.transparent, visible: o.visible }); }
  return { programs: [orig, R.renderer.info.programs.length], changed: out.sort((a, b) => b.bumps - a.bumps).slice(0, 15) };
}));
await ctx.close();
