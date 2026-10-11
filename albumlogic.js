// Альбомы: чистая логика страниц (без DOM и хранилища) — перенос старых альбомов, раскладки, фото в слотах.
import { LAYOUTS, SEQ } from './albumthemes.js';

export const layoutById = (id) => LAYOUTS.find((l) => l.id === id);
export const blankPage = (album, i = 0) => ({ album, layout: SEQ[i % SEQ.length], slots: {}, caption: '', items: [] });

// фото страницы по порядку слотов (пустые пропущены)
export function photosOf(pg) {
  return (layoutById(pg.layout)?.slots || []).map((s) => pg.slots[s.id]).filter((c) => c?.photo);
}

// сменить раскладку: фото переходят в новые слоты по порядку, лишние остаются в лотке альбома.
// У страницы без раскладки (старый альбом) свободные фото садятся в слоты.
export function applyLayout(pg, id) {
  const L = layoutById(id);
  let cells = photosOf(pg), items = pg.items;
  if (!layoutById(pg.layout)) {
    const free = items.filter((it) => it.type === 'photo').slice(0, L.slots.length);
    cells = free.map((it) => ({ photo: it.photo }));
    items = items.filter((it) => !free.includes(it));
  }
  const slots = {};
  L.slots.forEach((s, i) => { if (cells[i]) slots[s.id] = cells[i]; });
  return { ...pg, layout: id, slots, items };
}

// «перемешать»: другая раскладка под то же число фото
export function shuffle(pg, rnd = Math.random) {
  const n = photosOf(pg).length || layoutById(pg.layout)?.slots.length || 1;
  const opts = LAYOUTS.filter((l) => l.slots.length === Math.min(n, 5) && l.id !== pg.layout);
  return opts.length ? applyLayout(pg, opts[Math.floor(rnd() * opts.length)].id) : pg;
}

// положить фото в слот; если фото пришло из другого слота — меняются местами
export function putPhoto(pages, to, photo, from = null) {
  const out = new Map(pages);
  const tp = { ...out.get(to.page), slots: { ...out.get(to.page).slots } }; out.set(to.page, tp);
  const prev = tp.slots[to.slot];
  tp.slots[to.slot] = { photo };
  if (from) {
    const fp = from.page === to.page ? tp : { ...out.get(from.page), slots: { ...out.get(from.page).slots } }; out.set(from.page, fp);
    if (from.page === to.page && from.slot === to.slot) { tp.slots[to.slot] = prev; return out; }
    if (prev?.photo) fp.slots[from.slot] = { photo: prev.photo }; else delete fp.slots[from.slot];
  }
  return out;
}

// старый альбом (pages: [{items}]) → альбом с pageIds + записи страниц; uid — генератор id
export function migrate(album, uid) {
  if (album.pageIds) return { album, pages: [] };
  const old = album.pages?.length ? album.pages : [{ items: [] }, { items: [] }];
  const pages = old.map((p, i) => {
    const items = (p.items || []).map((it) => ({ id: it.id || uid(), ...it }));
    return { id: `${album.id}.${i}`, album: album.id, layout: items.length ? null : SEQ[i % SEQ.length], slots: {}, caption: '', items }; // id предсказуемый: двое открыли старый альбом одновременно — одни и те же страницы
  });
  const photos = [...new Set([album.cover, ...pages.flatMap((p) => p.items.filter((it) => it.type === 'photo').map((it) => it.photo))].filter(Boolean))];
  const { pages: _, ...rest } = album;
  return { album: { theme: 'kraft', ...rest, pageIds: pages.map((p) => p.id), photos }, pages };
}

// ---------- этап 3: автозаполнение по дате и ориентации ----------
export const orient = (s) => { const a = (s.w * 3) / (s.h * 4); return a > 1.12 ? 'h' : a < 0.88 ? 'v' : 's'; }; // слот на странице 3:4
export const orientOf = (w, h) => (!w || !h ? 's' : w > h * 1.1 ? 'h' : h > w * 1.1 ? 'v' : 's');
const RHYTHM = [2, 3, 1, 4, 2, 3]; // сколько фото на странице — по кругу, чтобы альбом дышал
const fits = (o, so) => o === 's' || so === 's' || o === so;
// фото по слотам: сначала тем, кому подходит ориентация
function assign(L, chunk) {
  const left = [...chunk], slots = {};
  for (const s of L.slots) {
    const so = orient(s), i = left.findIndex((p) => p.o === so), j = i >= 0 ? i : left.findIndex((p) => fits(p.o, so));
    const p = left.splice(j >= 0 ? j : 0, 1)[0];
    if (p) slots[s.id] = { photo: p.ref };
  }
  return slots;
}
const score = (L, chunk) => { const so = L.slots.map(orient); let m = 0; for (const o of ['h', 'v']) m += Math.min(chunk.filter((p) => p.o === o).length, so.filter((x) => x === o).length); return m; };
export const dateCap = (t) => (t ? new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '');
// photos: [{ ref, t (мс, дата съёмки), o: 'h'|'v'|'s' }] → страницы { layout, slots, caption }; новый день — новая страница
export function autofill(photos, start = 0) {
  const list = [...photos].sort((a, b) => (a.t || 0) - (b.t || 0)), pages = [];
  for (let i = 0, k = start; i < list.length; k++) {
    let n = Math.min(RHYTHM[k % RHYTHM.length], list.length - i);
    for (let j = 1; j < n; j++) if (list[i + j].t && list[i + j - 1].t && new Date(list[i + j].t).toDateString() !== new Date(list[i + j - 1].t).toDateString()) { n = j; break; }
    const chunk = list.slice(i, i + n); i += n;
    const opts = LAYOUTS.filter((l) => l.slots.length === n), best = Math.max(...opts.map((l) => score(l, chunk)));
    const top = opts.filter((l) => score(l, chunk) === best), L = top[k % top.length];
    pages.push({ layout: L.id, slots: assign(L, chunk), caption: dateCap(chunk[0].t) });
  }
  return pages;
}

// дата съёмки из EXIF (DateTimeOriginal, иначе DateTime) — по началу JPEG-файла; нет — null
export function exifTime(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  for (let o = 2; o + 4 < v.byteLength;) {
    const mark = v.getUint16(o), len = v.getUint16(o + 2);
    if (mark === 0xffe1 && v.getUint32(o + 4) === 0x45786966) { // 'Exif'
      const t = o + 10, le = v.getUint16(t) === 0x4949, u16 = (p) => v.getUint16(t + p, le), u32 = (p) => v.getUint32(t + p, le);
      const tag = (ifd, want) => { const n = u16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === want) return e; } return -1; };
      const str = (e) => { let s = ''; const p = u32(e + 8); for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(t + p + i)); return s; };
      const ifd0 = u32(4), ex = tag(ifd0, 0x8769);
      let e = ex >= 0 ? tag(u32(ex + 8), 0x9003) : -1;
      if (e < 0) e = tag(ifd0, 0x0132);
      if (e < 0) return null;
      const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(str(e));
      return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
    }
    if ((mark & 0xff00) !== 0xff00) return null;
    o += 2 + len;
  }
  return null;
}
