// Сквозная проверка каталога «Тестов» двумя вкладками (?local и ?local&as=b): фильтры, старт, «кто ты из», турнир, тирлист, викторина, итоги одного и пары.
// node tests/perf/quizcat.mjs <папка для снимков> [порт=8126]
import { chromium } from 'playwright-core';
const [OUT, PORT = 8126] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const errs = [];
const open = async (q) => {
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(q + ' ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(q + ' console: ' + m.text()));
  await p.goto(`http://localhost:${PORT}/?local${q}`); await p.waitForFunction(() => document.querySelector('#desktop'), null, { timeout: 60000 }); await p.waitForTimeout(3500);
  await p.evaluate(() => { document.querySelectorAll('.rsetup').forEach((e) => e.remove()); return import('/desktop.js').then((m) => m.openDesktop('quiz')); });
  await p.waitForSelector('.qz-day'); await p.evaluate(() => document.querySelector('.win.app-quiz .lt.g').click()); await p.waitForTimeout(600); return p;
};
const shot = (p, n) => p.screenshot({ path: `${OUT}/c-${n}.png` });
const A = await open(''), B = await open('&as=b');
await shot(A, '1-catalog');
await A.evaluate(() => document.querySelector('.qz-filters').scrollIntoView()); await shot(A, '1b-grid');

async function begin(p, title) {
  await p.evaluate(() => document.querySelector('.qz-back')?.click());
  await p.evaluate((t) => { const c = [...document.querySelectorAll('.qz-card')].find((c) => c.querySelector('b').textContent === t); c.scrollIntoView(); c.querySelector('.qz-go').click(); }, title);
  await p.waitForSelector('.qz-intro'); await p.waitForTimeout(400);
}
const go = (p) => p.click('.qz-intro .qz-go');
async function type(p, title, pick, snap) {
  await begin(p, title); if (snap) await shot(p, '2-intro'); await go(p);
  for (let k = 0; await p.$('.qz-ask'); k++) { if (snap && k === 2) await shot(p, '3-type-q'); await p.click(`.qz-opts.list button >> nth=${pick(k)}`); await p.waitForTimeout(200); }
}
async function cup(p, title, pick, snap) {
  await begin(p, title); await go(p);
  for (let k = 0; await p.$('.qz-ask'); k++) { await p.waitForTimeout(150); if (snap && k === 13) await shot(p, '4-cup'); await p.click(`.cupk >> nth=${pick(k)}`); await p.waitForTimeout(420); }
}
async function tier(p, title, pick, snap) {
  await begin(p, title); await go(p);
  for (let k = 0; await p.$('.tier-pool .tile'); k++) {
    if (k > 30) throw new Error('тирлист: фото не раскладываются');
    if (k === 6) { // одно фото — перетаскиванием
      const t = await p.$('.tier-pool .tile'), s = await p.$(`.shelf >> nth=${pick(k)}`), a = await t.boundingBox(), z = await s.boundingBox();
      await p.mouse.move(a.x + 30, a.y + 30); await p.mouse.down(); await p.mouse.move(a.x + 60, a.y + 60, { steps: 4 }); await p.mouse.move(z.x + 300, z.y + 30, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(150); continue;
    }
    await p.click('.tier-pool .tile >> nth=0'); await p.click(`.shelf >> nth=${pick(k)}`); await p.waitForTimeout(80);
    if (snap && k === 12) await shot(p, '5-tier');
  }
  await p.click('.tier-pool .qz-go');
}
async function trivia(p, title, pick, snap) {
  await begin(p, title); await go(p);
  for (let k = 0; await p.$('.qz-ask'); k++) { await p.click(`.qz-opts.list button >> nth=${pick(k)}`); await p.waitForTimeout(120); if (snap && k === 1) await shot(p, '6-trivia'); await p.click('.qz-verdict .qz-go'); await p.waitForTimeout(200); }
}
await tier(A, 'Тирлист еды', (k) => k % 4, true); await shot(A, '11-tier-solo');
await tier(B, 'Тирлист еды', (k) => (k * 2) % 4); await openResult(A, 'Тирлист еды'); await shot(A, '12-tier-pair');
await A.evaluate(() => document.querySelector('.qz-pair')?.scrollIntoView()); await shot(A, '12b-tier-boards');
await trivia(A, 'Знаешь ли ты кино', (k) => k % 4, true); await shot(A, '13-trivia-solo');
await trivia(B, 'Знаешь ли ты кино', () => 0); await openResult(A, 'Знаешь ли ты кино'); await shot(A, '14-trivia-pair');
await type(A, 'Кто ты из «Гарри Поттера»', (k) => k % 4, true); await p_wait(A); await shot(A, '7-type-solo');
await type(B, 'Кто ты из «Гарри Поттера»', (k) => (k * 3) % 5); await A.waitForTimeout(600);
await A.evaluate(() => document.querySelector('.qz-back').click()); await openResult(A, 'Кто ты из «Гарри Поттера»'); await shot(A, '8-type-pair');
await cup(A, 'Лучший десерт', (k) => k % 2, true); await shot(A, '9-cup-solo');
await cup(B, 'Лучший десерт', (k) => (k % 3 ? 0 : 1)); await openResult(A, 'Лучший десерт'); await shot(A, '10-cup-pair');
// фильтр формата и случайный тест
await A.evaluate(() => document.querySelector('.qz-back').click());
await A.selectOption('.qz-sel >> nth=0', 'cup'); await A.waitForTimeout(200);
const cups = await A.$$eval('.qz-card b', (bs) => bs.map((b) => b.textContent)); console.log('фильтр «турнир»:', cups.join(', '));
await A.click('.qz-rand'); await A.waitForTimeout(500); console.log('случайный тест открыл:', await A.$eval('.qz-runhead b', (b) => b.textContent));
await A.evaluate(() => document.querySelector('.qz-back').click()); await A.click('.qz-credlink'); await A.waitForTimeout(500); await shot(A, '15-credits');
const res = await A.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('quiz')).length);
console.log('ошибки:', errs.length ? errs : 'нет', '· записей quiz:', res);
await b.close();

async function p_wait(p) { await p.waitForSelector('.qz-hero'); await p.waitForTimeout(900); }
async function openResult(p, t) {
  await p.evaluate(() => document.querySelector('.qz-back')?.click());
  await p.evaluate((t) => { const c = [...document.querySelectorAll('.qz-card')].find((c) => c.querySelector('b').textContent === t); [...c.querySelectorAll('.qz-acts button')].find((x) => x.textContent === 'итоги').click(); }, t);
  await p.waitForTimeout(1600);
}
