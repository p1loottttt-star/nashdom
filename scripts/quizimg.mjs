// Фото для «Тестов»: только свободные лицензии (CC0, PD, CC BY, CC BY-SA), автор и ссылка — в public/quiz/credits.json.
// node scripts/quizimg.mjs search [id…]  — кандидаты (Wikimedia Commons + Openverse) для ключей без файла → листы shots/qimg/<id>-<n>.png
// (выбор — scripts/qimg/picks.json { ключ: номер с листа }) → node scripts/quizimg.mjs fetch — скачать, ужать в WebP 640×480, дописать авторов.
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url), at = (p) => new URL(p, root);
const CAND = at('scripts/qimg/cand.json'), candOf = (id) => at(`scripts/qimg/cand-${id}.json`), PICKS = at('scripts/qimg/picks.json'), CREDITS = at('public/quiz/credits.json');
const load = (u, d) => (existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : d);
const save = (u, v) => writeFileSync(u, JSON.stringify(v, null, 1));
// все кандидаты: общий файл (старые) + по файлу на тест
const allCand = () => Object.assign(load(CAND, {}), ...readdirSync(at('scripts/qimg/')).filter((f) => /^cand-.+\.json$/.test(f)).map((f) => load(at('scripts/qimg/' + f), {})));
mkdirSync(at('scripts/qimg'), { recursive: true }); mkdirSync(at('public/quiz'), { recursive: true }); mkdirSync(at('shots/qimg'), { recursive: true });
const UA = { 'User-Agent': 'NashDomQuiz/1.0 (personal project; p1loottttt-star on GitHub)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s = '') => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const FREE = /^(cc0|public domain|pd|cc by(-sa)? \d(\.\d)?( [a-z-]+)?)$/i; // без NC/ND, без GFDL-only

async function packs(ids) {
  const out = [];
  for (const f of readdirSync(at('quizpacks/')).filter((f) => f.endsWith('.js'))) {
    const id = f.slice(0, -3);
    if (!ids.length || ids.includes(id)) out.push({ id, imgs: (await import(at('quizpacks/' + f))).default.imgs });
  }
  return out;
}

async function commons(q, cat = ' incategory:Quality_images') {
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: q + ' filetype:bitmap' + cat, gsrlimit: '14', prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '1024' });
  let j;
  for (let t = 0; !j; t++) { const r = await fetch(u, { headers: UA }); if (r.ok) j = await r.json(); else { if (t > 4) return []; console.warn('Commons', r.status, '— жду'); await sleep(15000 * (t + 1)); } }
  await sleep(900);
  return Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).map((p) => p.imageinfo?.[0]).filter((ii) => ii && /jpeg|png/.test(ii.mime) && ii.width >= 640 && ii.height >= 400)
    .map((ii) => { const m = ii.extmetadata || {}; return { src: ii.thumburl, page: ii.descriptionurl, by: strip(m.Artist?.value) || 'неизвестен', lic: strip(m.LicenseShortName?.value), lic_url: m.LicenseUrl?.value || '', title: strip(m.ObjectName?.value) || '' }; })
    .filter((c) => FREE.test(c.lic) || /^public domain/i.test(c.lic));
}
let ovLeft = true;
async function openverse(q) {
  if (!ovLeft) return [];
  const r = await fetch('https://api.openverse.org/v1/images/?' + new URLSearchParams({ q, license: 'cc0,pdm,by,by-sa', mature: 'false', page_size: '6', source: 'stocksnap,flickr,rawpixel' }), { headers: UA });
  if (r.status === 429) { ovLeft = false; console.warn('Openverse: дневной лимит, дальше только Commons'); return []; }
  const j = await r.json(); await sleep(3200); // 20 в минуту
  return (j.results || []).filter((x) => (x.width || 1000) >= 640).map((x) => ({ src: x.url, page: x.foreign_landing_url, by: x.creator || 'неизвестен', lic: x.license === 'cc0' ? 'CC0' : x.license === 'pdm' ? 'Public domain' : `CC ${x.license.toUpperCase()} ${x.license_version || ''}`.trim(), lic_url: x.license_url || '', title: x.title || '' }));
}

async function search(ids) {
  const cand = allCand(), picks = load(PICKS, {});
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  for (const { id, imgs } of await packs(ids)) {
    const keys = Object.keys(imgs).filter((k) => !existsSync(at(`public/quiz/${k}.webp`)) && picks[k] == null);
    for (const k of keys) {
      if (!cand[k] || cand[k].q !== imgs[k]) { // сначала отобранные Quality images; Openverse и общая выдача — только если хороших мало (у них лимиты и паузы)
        const all = await commons(imgs[k]);
        if (all.length < 6) all.push(...(await openverse(imgs[k])));
        if (all.length < 9) all.push(...(await commons(imgs[k], '')));
        cand[k] = { q: imgs[k], list: all.filter((c, i) => all.findIndex((d) => d.src === c.src) === i).slice(0, 12) }; }
      console.log(k, cand[k].list.length); save(candOf(id), Object.fromEntries(Object.keys(imgs).filter((x) => cand[x]).map((x) => [x, cand[x]])));
    }
    for (let s = 0; s * 6 < keys.length; s++) {
      const rows = keys.slice(s * 6, s * 6 + 6).map((k) => `<div class=r><b>${k}<br><small>${imgs[k]}</small></b>${cand[k].list.map((c, n) => `<i><img src="${c.src}"><u>${n}</u></i>`).join('')}</div>`).join('');
      const p = await b.newPage({ viewport: { width: 1700, height: 900 } });
      await p.setContent(`<style>body{margin:6px;font:13px sans-serif}.r{display:flex;gap:4px;margin-bottom:6px;align-items:center}b{width:150px;flex:none}i{position:relative;width:122px;height:92px;flex:none}img{width:100%;height:100%;object-fit:cover}u{position:absolute;left:0;top:0;background:#000;color:#fff;font:700 16px sans-serif;padding:1px 5px;text-decoration:none}</style>${rows}`);
      await p.waitForLoadState('networkidle').catch(() => {});
      const f = `shots/qimg/${id}-${s}.png`; await p.screenshot({ path: fileURLToPath(at(f)), fullPage: true }); await p.close(); console.log('лист', f);
    }
  }
  await b.close();
}

async function fetchPicked() {
  const cand = allCand(), picks = load(PICKS, {}), credits = load(CREDITS, {});
  const b = await chromium.launch({ channel: 'chrome', headless: true }), p = await b.newPage();
  for (const [k, n] of Object.entries(picks)) {
    const c = cand[k]?.list[n]; if (!c) { console.warn('нет кандидата', k, n); continue; }
    if (existsSync(at(`public/quiz/${k}.webp`)) && credits[k]?.src === c.page) continue;
    let r; for (let t = 0; t < 5 && !(r = await fetch(c.src, { headers: UA })).ok; t++) await sleep(10000 * (t + 1));
    if (!r.ok) { console.warn('не скачалось', k, r.status); continue; }
    const data = `data:${r.headers.get('content-type') || 'image/jpeg'};base64,` + Buffer.from(await r.arrayBuffer()).toString('base64');
    const webp = await p.evaluate(async (d) => {
      const im = new Image(); im.src = d; await im.decode();
      const W = 640, H = 480, s = Math.max(W / im.width, H / im.height), cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
      cv.getContext('2d').drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
      return cv.toDataURL('image/webp', 0.74);
    }, data);
    writeFileSync(at(`public/quiz/${k}.webp`), Buffer.from(webp.split(',')[1], 'base64'));
    credits[k] = { by: c.by, src: c.page, lic: c.lic, lic_url: c.lic_url, title: c.title };
    console.log('ok', k);
  }
  // тесты, у которых собраны ВСЕ фото, — только их каталог показывает (quizplay ready)
  credits.__packs = (await packs([])).filter((p) => Object.keys(p.imgs).every((k) => credits[k] && existsSync(at(`public/quiz/${k}.webp`)))).map((p) => p.id).sort();
  console.log('готовы:', credits.__packs.length, 'тестов');
  save(CREDITS, Object.fromEntries(Object.entries(credits).sort()));
  await b.close();
}

const [cmd, ...ids] = process.argv.slice(2);
if (cmd === 'search') await search(ids); else if (cmd === 'fetch') await fetchPicked(); else console.log('search [id…] | fetch');
