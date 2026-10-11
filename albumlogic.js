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
