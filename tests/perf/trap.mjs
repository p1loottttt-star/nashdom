import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080'] });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('http://localhost:8125/?debug&local');
await page.waitForFunction(() => window.__room, null, { timeout: 60000 });
await page.waitForTimeout(2500);
console.log(await page.evaluate(async () => {
  let m; window.__room.scene.traverse((o) => { if (o.material?.isMeshBasicMaterial && o.material.color.getHexString() === 'ffcf8a') m = o.material; });
  let v = m.version, stacks = new Map();
  Object.defineProperty(m, 'version', { get: () => v, set: (x) => { v = x; const s = new Error().stack.split('\n').slice(2, 6).map((l) => l.trim().replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:]*/, '')).join(' < '); stacks.set(s, (stacks.get(s) || 0) + 1); } });
  await new Promise((x) => setTimeout(x, 1500));
  return [...stacks];
}));
await ctx.close();
