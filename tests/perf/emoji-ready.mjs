// когда эмодзи интерфейса становятся картинками: первый вход (рисуются в фоне) и повторный (из Cache Storage)
import { chromium } from 'playwright-core';
const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows'] });
const page = ctx.pages()[0] || (await ctx.newPage());
const run = async () => {
  await page.goto('http://localhost:8125/?debug&local');
  return page.evaluate(async () => {
    const t = () => Math.round(performance.now());
    while (document.getElementById('veil') || !window.__room) await new Promise((r) => setTimeout(r, 20));
    const shown = t();
    while (!document.querySelector('img.emo')) await new Promise((r) => setTimeout(r, 20));
    return { roomShownMs: shown, emojiReadyMs: t(), marks: Object.fromEntries(performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime) + (m.detail != null ? '/' + m.detail : '')])), fonts: Math.round(performance.getEntriesByType('resource').filter((e) => /room\.js/.test(e.name))[0]?.responseEnd || 0) };
  });
};
if (process.argv.includes('--fresh')) await page.evaluate(() => caches.delete('emoji-v1')).catch(() => {});
console.log('вход 1:', await run());
console.log('вход 2:', await run());
await ctx.close();
