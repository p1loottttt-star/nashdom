// Сквозная проверка «Тестов» и удаления партий двумя вкладками (?local и ?local&as=b): вопрос дня, это-или-то, вечер, чек-лист → планы, знаешь (шкала, порядок).
// node tests/perf/quizflow.mjs <папка для снимков>   (нужен dev-сервер :8126 — поправьте адрес ниже)
import { chromium } from 'playwright-core';
const OUT = process.argv[2];
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const errs = [];
const open = async (q) => {
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(q + ' ' + e.message));
  await p.goto('http://localhost:8126/?local' + q); await p.waitForFunction(() => document.querySelector('#desktop'), null, { timeout: 60000 }); await p.waitForTimeout(3500);
  await p.evaluate(() => { document.querySelectorAll('.rsetup').forEach((e) => e.remove()); return import('/desktop.js').then((m) => m.openDesktop('quiz')); });
  await p.waitForSelector('.qz-day'); await p.evaluate(() => document.querySelector('.win.app-quiz .lt.g').click()); await p.waitForTimeout(400); return p;
};
const A = await open(''), B = await open('&as=b');
const shot = (p, n) => p.screenshot({ path: `${OUT}/q-${n}.png` });
await shot(A, '1-catalog');
await B.click('.qz-day .opt >> nth=0'); await A.waitForTimeout(400);
await shot(A, '2-day-partner-answered');
await A.click('.qz-day .opt >> nth=0'); await A.waitForTimeout(1300);
await A.evaluate(() => document.querySelector('.qz-day').scrollIntoView());
await shot(A, '3-day-revealed');
// пройти тест по id — ответы выбирает функция
async function pass(p, id, pickFn) {
  await p.evaluate(() => { document.querySelector('.qz-back')?.click(); });
  await p.evaluate((id) => { const c = [...document.querySelectorAll('.qz-card')].find((c) => c.querySelector('b').textContent === id); c.scrollIntoView(); c.querySelector('.qz-go').click(); }, id);
  for (let k = 0; k < 40 && await p.$('.qz-ask'); k++) { await pickFn(p, k); await p.waitForTimeout(260); }
}
const nth = (sel, i) => (p) => p.click(`${sel} >> nth=${i}`);
await pass(A, 'Это или то: уютное', async (p, k) => { if (k === 3) await shot(p, '4-pick-run'); await nth('.qz-pick .pk', k % 2)(p); });
await pass(B, 'Это или то: уютное', async (p, k) => nth('.qz-pick .pk', k % 3 ? 0 : 1)(p));
await A.evaluate(() => { document.querySelector('.qz-back').click(); }); await A.waitForTimeout(300);
await A.evaluate(() => [...document.querySelectorAll('.qz-card')].find((c) => c.querySelector('b').textContent === 'Это или то: уютное').querySelector('.qz-acts button:nth-child(2)').click());
await A.waitForTimeout(1200); await shot(A, '5-pick-result');
await pass(A, 'Собери наш идеальный вечер', async (p, k) => { if (k === 3) await shot(p, '6-evening-run'); await nth('.qz-eve .pk', k % 4)(p); });
await pass(B, 'Собери наш идеальный вечер', async (p, k) => nth('.qz-eve .pk', (k * 3) % 4)(p));
await A.evaluate(() => { document.querySelector('.qz-back').click(); }); await A.waitForTimeout(300);
await A.evaluate(() => [...document.querySelectorAll('.qz-card')].find((c) => c.querySelector('b').textContent === 'Собери наш идеальный вечер').querySelector('.qz-acts button:nth-child(2)').click());
await A.waitForTimeout(1200); await shot(A, '7-evening-result');
await pass(A, 'Что мы уже успели', async (p, k) => { for (const i of [0, 2, 5, 9, 15]) await p.click(`.qz-list .li >> nth=${i}`); await shot(p, '8-list-run'); await p.click('.qz-ask .qz-go'); });
await pass(B, 'Что мы уже успели', async (p) => { for (const i of [0, 2, 7, 9]) await p.click(`.qz-list .li >> nth=${i}`); await p.click('.qz-ask .qz-go'); });
await A.evaluate(() => { document.querySelector('.qz-back').click(); }); await A.waitForTimeout(300);
await A.evaluate(() => [...document.querySelectorAll('.qz-card')].find((c) => c.querySelector('b').textContent === 'Что мы уже успели').querySelector('.qz-acts button:nth-child(2)').click());
await A.waitForTimeout(1200); await shot(A, '9-list-result');
await A.click('.qz .qz-go.big'); await A.waitForTimeout(400);
console.log('план:', await A.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ')));
// знаешь мои предпочтения: шкала, порядок, варианты
const knowFn = (who) => async (p, k) => {
  if (await p.$('.qz-scale')) { for (const [i, v] of [[0, who ? 30 : 70], [1, who ? 60 : 40]]) await p.locator('.qz-range').nth(i).fill(String(v)); if (k === 0 && !who) await shot(p, '10-know-scale'); await p.click('.qz-ask .qz-go'); return; }
  if (await p.$('.qz-rank')) { for (const blk of [0, 1]) for (const i of [2, 0, 1, 3]) await p.click(`.qz-know >> nth=${blk} >> .qz-rank button >> nth=${i}`); if (k === 1 && !who) await shot(p, '11-know-rank'); await p.click('.qz-ask .qz-go'); return; }
  await p.click('.qz-know >> nth=0 >> .qz-opts button >> nth=1'); await p.click('.qz-know >> nth=1 >> .qz-opts button >> nth=1');
};
await pass(A, 'Знаешь мои предпочтения?', knowFn(0));
await pass(B, 'Знаешь мои предпочтения?', knowFn(1));
await A.evaluate(() => { document.querySelector('.qz-back').click(); }); await A.waitForTimeout(300);
await A.evaluate(() => [...document.querySelectorAll('.qz-card')].find((c) => c.querySelector('b').textContent === 'Знаешь мои предпочтения?').querySelector('.qz-acts button:nth-child(2)').click());
await A.waitForTimeout(1400); await shot(A, '12-know-result');
// игры: новая партия и удаление у обоих
await A.evaluate(() => import('/desktop.js').then((m) => m.openDesktop('games')));
await A.waitForSelector('.gm-card'); await A.click('.gm-card >> nth=2'); await A.waitForTimeout(400); await A.click('.gm-back'); await A.waitForTimeout(300);
await B.evaluate(() => import('/desktop.js').then((m) => m.openDesktop('games'))); await B.waitForSelector('.gm-card'); await B.waitForTimeout(500);
const rows = async (p) => p.evaluate(() => document.querySelectorAll('.gm-row').length);
console.log('партий до:', await rows(A), await rows(B));
await A.click('.gm-row .gm-x'); await A.click('.gm-row .gm-x'); await A.waitForTimeout(500);
console.log('партий после:', await rows(A), await rows(B));
console.log('ошибки:', errs);
await b.close();
