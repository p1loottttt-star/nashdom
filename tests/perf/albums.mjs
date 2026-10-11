// Альбом-фотокнига двумя вкладками (?local — Ваня, ?local&as=b — Соня): фото в рамки, темы, раскладки, кадрирование,
// перетаскивание, листание; Соня правит другую страницу одновременно — после перезагрузки целы правки обоих.
// node tests/perf/albums.mjs <папка для снимков> [порт=8126] [ширина=1440] [высота=900]
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
const [OUT, PORT = 8126, W = 1440, H = 900] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: +W, height: +H } });
const errs = [];
const qdir = new URL('../../public/quiz/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const pics = readdirSync(qdir).filter((f) => f.endsWith('.webp')).slice(0, 6).map((f) => qdir + f);
const shot = (p, n) => p.screenshot({ path: `${OUT}/alb-${W}-${n}.png` });

async function open(q) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(q + ' ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(q + ' console: ' + m.text()));
  await p.goto(`${/^http/.test(PORT) ? PORT : `http://localhost:${PORT}`}/?debug&local${q}`);
  await p.waitForFunction(() => window.__room, null, { timeout: 60000 }); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll('.rsetup').forEach((e) => e.remove()));
  return p;
}
// первый альбом с полки
const openFirst = (p) => p.waitForFunction(() => window.__room.clickables.some((o) => o.userData.book && o.userData.book !== 'new'), null, { timeout: 20000 }).then(() => p.evaluate(() => window.__room.clickables.find((o) => o.userData.book && o.userData.book !== 'new').userData.act())).then(() => p.waitForSelector('#album.on .page'));
const edit = async (p) => { await p.click('#album [data-a=edit]'); await p.waitForSelector('.album-tools:not([hidden])'); };
const tab = (p, t) => p.click(`.atabs [data-tab=${t}]`);

const A = await open('');
await openFirst(A); await A.waitForTimeout(400); await shot(A, '1-read');
await edit(A);
// страница 1 активна: фото встают в пустые рамки
await A.setInputFiles('.atab input[type=file]', pics.slice(0, 4)); await A.waitForFunction(() => document.querySelectorAll('.ab-tray').length >= 4, null, { timeout: 15000 });
await A.waitForTimeout(500); await shot(A, '2-photos');
// подпись
await A.click('.page[data-vi="1"] .ab-cap'); await A.keyboard.type('Наше лето'); await A.keyboard.press('Enter');
// перетащить фото из лотка в рамку второй страницы (следующий разворот)
await A.click('#album [data-a=next]'); await A.waitForTimeout(300);
const tray = await A.locator('.ab-tray').nth(3).boundingBox(), slot2 = await A.locator('.page[data-vi="2"] .ab-slot').first().boundingBox();
await A.mouse.move(tray.x + 20, tray.y + 20); await A.mouse.down(); await A.mouse.move(tray.x + 60, tray.y + 60, { steps: 4 });
await A.mouse.move(slot2.x + slot2.width / 2, slot2.y + slot2.height / 2, { steps: 8 }); await shot(A, '3-drag'); await A.mouse.up();
await A.waitForTimeout(300);
const filled2 = await A.locator('.page[data-vi="2"] .ab-slot:not(.ab-empty)').count();
await A.click('#album [data-a=prev]'); await A.waitForTimeout(300);
// кадрирование: нажать на фото, колесо, потянуть, нажать мимо
const s1 = await A.locator('.page[data-vi="1"] .ab-slot:not(.ab-empty)').first().boundingBox();
await A.mouse.click(s1.x + s1.width / 2, s1.y + s1.height / 2); await A.waitForSelector('.ab-slot.ab-crop');
await A.mouse.move(s1.x + s1.width / 2, s1.y + s1.height / 2); await A.mouse.wheel(0, -500); await A.mouse.down(); await A.mouse.move(s1.x + s1.width / 2 + 40, s1.y + s1.height / 2, { steps: 5 }); await A.mouse.up();
await shot(A, '4-crop'); await A.mouse.click(5, H / 2); await A.waitForTimeout(300);
// раскладки и «перемешать»
await tab(A, 'layouts'); await A.click('.atab .tbtn >> text=перемешать'); await A.waitForTimeout(300); await shot(A, '5-shuffle');
// темы
for (const t of ['travel', 'film', 'water', 'kraft']) { await tab(A, 'theme'); await A.click(`.ab-thc.th-${t}`); await A.waitForTimeout(500); await shot(A, '6-theme-' + t); }
await A.waitForTimeout(600);
// украшения: наклейка нажатием, лента перетаскиванием (магниты), надпись — шрифт и чернила, дубль, отмена/повтор
await tab(A, 'decor'); await A.waitForSelector('.ab-stk svg');
await A.click('.ab-stk >> nth=2'); await A.waitForTimeout(200);
const tb = await A.locator('.ab-tapebtn').first().boundingBox(), pg1 = await A.locator('.page[data-vi="1"]').boundingBox();
await A.mouse.move(tb.x + 10, tb.y + 8); await A.mouse.down(); await A.mouse.move(pg1.x + pg1.width * 0.5, pg1.y + pg1.height * 0.08, { steps: 10 }); await A.mouse.up();
await A.click('.atab .ab-font >> nth=1'); await A.waitForTimeout(200);
await A.click('.ab-sel .sw >> nth=2'); await A.click('.ab-sel .tbtn >> text=дубль');
const items0 = await A.locator('.page[data-vi="1"] .item').count();
const st = await A.locator('.page[data-vi="1"] .item.sticker').first().boundingBox();
await A.mouse.move(st.x + st.width / 2, st.y + st.height / 2); await A.mouse.down(); await A.mouse.move(pg1.x + pg1.width / 2 + 3, pg1.y + pg1.height * 0.6, { steps: 8 });
const guide = await A.locator('.ab-guide').count(); await shot(A, '6b-decor-drag'); await A.mouse.up();
await A.keyboard.press('Control+z'); const itemsU = await A.locator('.page[data-vi="1"] .item').count();
await A.keyboard.press('Control+z'); const itemsU2 = await A.locator('.page[data-vi="1"] .item').count();
await A.keyboard.press('Control+Shift+z'); const itemsR = await A.locator('.page[data-vi="1"] .item').count();
await A.click('.page[data-vi="1"]', { position: { x: 5, y: 5 } }); await A.waitForTimeout(300); await shot(A, '6c-decor');
for (const t of ['travel', 'film', 'water']) { await tab(A, 'theme'); await A.click(`.ab-thc.th-${t}`); await tab(A, 'decor'); await A.waitForTimeout(400); await shot(A, '6d-decor-' + t); }
await tab(A, 'theme'); await A.click('.ab-thc.th-kraft'); await A.waitForTimeout(300);
console.log({ decor: { items0, guide, itemsU, itemsU2, itemsR } });

// Соня в это же время правит третью страницу
const B = await open('&as=b');
await openFirst(B); await edit(B);
await B.click('#album [data-a=next]'); await B.waitForTimeout(300);
const bcap = B.locator('.page[data-vi="2"] .ab-cap');
if (await bcap.count()) { await bcap.click(); await B.keyboard.type('от Сони'); await B.keyboard.press('Enter'); }
await B.waitForTimeout(800);
// Ваня тем временем меняет подпись первой страницы
await A.click('.page[data-vi="1"] .ab-cap'); await A.keyboard.press('End'); await A.keyboard.type('!'); await A.keyboard.press('Enter'); await A.waitForTimeout(800);
await A.click('#album [data-a=edit]'); await A.click('#album [data-a=close]'); await B.click('#album [data-a=close]'); await A.waitForTimeout(800);

// чтение с листанием, после перезагрузки
await A.reload(); await A.waitForFunction(() => window.__room, null, { timeout: 60000 }); await A.waitForTimeout(2000);
await openFirst(A); await A.waitForTimeout(400);
const caps = await A.evaluate(() => [...document.querySelectorAll('.ab-cap')].map((c) => c.textContent));
await A.click('#album [data-a=next]'); await A.waitForTimeout(350); await shot(A, '7-flip'); await A.waitForTimeout(700);
const caps2 = await A.evaluate(() => [...document.querySelectorAll('.ab-cap')].map((c) => c.textContent));
await shot(A, '8-spread2');
console.log({ filled2, caps, caps2, errs });
const ok = filled2 > 0 && caps.includes('Наше лето!') && (caps2.includes('от Сони') || caps.includes('от Сони'));
if (!ok || errs.length) { console.error('НЕ ПРОШЛО'); process.exitCode = 1; } else console.log('albums stand ok');
await b.close();
