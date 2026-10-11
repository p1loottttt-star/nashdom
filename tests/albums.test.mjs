// Альбомы: раскладки внутри страницы, раскладки на 1–5 фото, перенос старого альбома, смена раскладки и обмен фото без потерь
import assert from 'node:assert/strict';
import { LAYOUTS, SEQ, THEMES } from '../albumthemes.js';
import { applyLayout, shuffle, putPhoto, migrate, photosOf, blankPage } from '../albumlogic.js';

const ids = new Set();
for (const L of LAYOUTS) {
  assert.ok(!ids.has(L.id), 'id раскладки один раз: ' + L.id); ids.add(L.id);
  for (const s of [...L.slots, ...(L.cap ? [{ ...L.cap, h: 8 }] : [])]) {
    assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= 100 && s.y + s.h <= 100, `${L.id}: выходит за страницу ${JSON.stringify(s)}`);
  }
  assert.equal(new Set(L.slots.map((s) => s.id)).size, L.slots.length, L.id + ': id слотов разные');
}
for (let n = 1; n <= 5; n++) assert.ok(LAYOUTS.some((l) => l.slots.length === n), 'есть раскладка на ' + n);
for (let n = 1; n <= 4; n++) assert.ok(LAYOUTS.filter((l) => l.slots.length === n).length >= 2, 'перемешать есть из чего: ' + n);
assert.ok(SEQ.every((id) => ids.has(id)));
assert.ok(THEMES.length === 4 && THEMES.every((t) => t.fonts.length === 2 && t.ink.length === 5));
// наклейки тем — настоящие рисунки doodles.js (сам модуль в node не грузится из-за roughjs — имена читаем из текста)
import { readFileSync } from 'node:fs';
const drawn = new Set([...readFileSync(new URL('../doodles.js', import.meta.url), 'utf8').matchAll(/^  (\w+): \[/gm)].map((m) => m[1]));
for (const t of THEMES) {
  for (const n of t.stickers) assert.ok(drawn.has(n), `${t.id}: нет рисунка ${n}`);
  assert.ok(t.stickers.length >= 10 && t.tapes.length >= 4 && ['sticker', 'pencil', 'riso'].includes(t.print), t.id + ': набор украшений');
}

// перенос: старые свободные фото и подписи на месте, обложка и фото в лотке
let n = 0; const uid = () => 'u' + n++;
const old = { id: 'al', title: 'Лето', color: '#e7849b', cover: 'c.jpg', pages: [{ items: [{ type: 'photo', photo: 'p1', x: 5, y: 5, w: 40, rot: 2 }, { type: 'text', text: 'море', x: 10, y: 80, size: 6 }] }, { items: [] }] };
const m = migrate(old, uid);
assert.equal(m.pages.length, 2); assert.deepEqual(m.album.pageIds, ['al.0', 'al.1'], 'id страниц из id альбома'); assert.ok(!('pages' in m.album));
assert.equal(m.pages[0].layout, null, 'страница со старыми вещами остаётся свободной');
assert.deepEqual(m.pages[0].items.map((it) => it.type), ['photo', 'text']); assert.ok(m.pages[0].items.every((it) => it.id));
assert.ok(m.pages[1].layout, 'пустая страница получает раскладку');
assert.deepEqual(m.album.photos.sort(), ['c.jpg', 'p1']);
assert.equal(migrate(m.album, uid).pages.length, 0, 'повторный перенос ничего не делает');

// старая свободная страница + раскладка: фото садятся в слоты, подпись остаётся
const laid = applyLayout(m.pages[0], 'twoh');
assert.deepEqual(photosOf(laid).map((c) => c.photo), ['p1']); assert.deepEqual(laid.items.map((it) => it.type), ['text']);

// смена раскладки и «перемешать» сохраняют фото по порядку
const pg = { ...blankPage('al'), layout: 'three', slots: { a: { photo: 'x' }, b: { photo: 'y', cx: 30 }, c: { photo: 'z' } } };
assert.deepEqual(photosOf(applyLayout(pg, 'five')).map((c) => c.photo), ['x', 'y', 'z']);
for (let i = 0; i < 20; i++) { const s = shuffle(pg); assert.notEqual(s.layout, 'three'); assert.deepEqual(photosOf(s).map((c) => c.photo), ['x', 'y', 'z']); }

// обмен: из слота в занятый слот другой страницы — местами; в пустой — переезд
const pages = new Map([['A', pg], ['B', { ...blankPage('al'), layout: 'twoh', slots: { a: { photo: 'q' } } }]]);
let r = putPhoto(pages, { page: 'B', slot: 'a' }, 'x', { page: 'A', slot: 'a' });
assert.equal(r.get('B').slots.a.photo, 'x'); assert.equal(r.get('A').slots.a.photo, 'q'); assert.equal(pages.get('A').slots.a.photo, 'x', 'исходные страницы не тронуты');
r = putPhoto(pages, { page: 'B', slot: 'b' }, 'y', { page: 'A', slot: 'b' });
assert.equal(r.get('B').slots.b.photo, 'y'); assert.ok(!r.get('A').slots.b);
r = putPhoto(pages, { page: 'A', slot: 'a' }, 'x', { page: 'A', slot: 'a' });
assert.equal(r.get('A').slots.a.photo, 'x', 'на то же место — без изменений');
r = putPhoto(pages, { page: 'A', slot: 'a' }, 'new');
assert.equal(r.get('A').slots.a.photo, 'new');
console.log('albums ok');

// автозаполнение: по дате, новый день — новая страница, ориентация совпадает со слотами, подпись — дата
import { autofill, orient, exifTime } from '../albumlogic.js';
const day = (d, h = 12) => new Date(2026, 6, d, h).getTime();
const ph = [['a', day(12, 10), 'h'], ['b', day(12, 11), 'v'], ['c', day(12, 12), 'h'], ['d', day(13), 'v'], ['e', day(13, 13), 'h'], ['f', day(14), 's'], ['g', day(12, 9), 'v']].map(([ref, t, o]) => ({ ref, t, o }));
const auto = autofill(ph);
const flat = auto.flatMap((p) => { const L = LAYOUTS.find((l) => l.id === p.layout); return L.slots.map((s) => p.slots[s.id]?.photo).filter(Boolean); });
assert.deepEqual([...flat].sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'все фото разложены по разу');
assert.ok(auto[0].caption === '12 июля', 'подпись — дата первой фотографии: ' + auto[0].caption);
for (const p of auto) { const L = LAYOUTS.find((l) => l.id === p.layout), days = new Set(L.slots.map((s) => p.slots[s.id]?.photo).filter(Boolean).map((r) => new Date(ph.find((x) => x.ref === r).t).getDate())); assert.equal(days.size, 1, 'на странице один день'); }
const p0 = auto[0], L0 = LAYOUTS.find((l) => l.id === p0.layout);
for (const p of auto) { // совпадений ориентации столько, сколько вообще возможно в этой раскладке
  const L = LAYOUTS.find((l) => l.id === p.layout), pairs = L.slots.map((s) => [orient(s), ph.find((x) => x.ref === p.slots[s.id]?.photo)?.o]);
  const got = pairs.filter(([so, o]) => so === o && o !== 's').length, max = ['h', 'v'].reduce((m, o) => m + Math.min(pairs.filter(([so]) => so === o).length, pairs.filter(([, po]) => po === o).length), 0);
  assert.equal(got, max, `ориентация в ${p.layout}`);
}
// EXIF: собранный руками JPEG с DateTimeOriginal (big-endian)
const exifJpeg = () => {
  const date = '2026:07:12 18:30:05\0', b = [];
  const u16 = (n) => b.push(n >> 8, n & 255), u32 = (n) => { u16(n >>> 16); u16(n & 65535); };
  u16(0xffd8); u16(0xffe1); const lenAt = b.length; u16(0); b.push(...'Exif'.split('').map((c) => c.charCodeAt(0)), 0, 0);
  const t0 = b.length; b.push(0x4d, 0x4d); u16(42); u32(8); // TIFF, IFD0 по смещению 8
  u16(1); u16(0x8769); u16(4); u32(1); u32(26); u32(0); // IFD0: ссылка на Exif IFD (8+2+12+4 = 26)
  u16(1); u16(0x9003); u16(2); u32(20); u32(44); u32(0); // Exif IFD: DateTimeOriginal → строка по смещению 44
  b.push(...date.split('').map((c) => c.charCodeAt(0)));
  const len = b.length - lenAt; b[lenAt] = len >> 8; b[lenAt + 1] = len & 255; u16(0xffd9);
  assert.equal(b.length - t0 > 44, true);
  return new Uint8Array(b).buffer;
};
assert.equal(exifTime(exifJpeg()), new Date(2026, 6, 12, 18, 30, 5).getTime(), 'дата из EXIF');
assert.equal(exifTime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null, 'не JPEG — нет даты');
console.log('albums autofill ok');
