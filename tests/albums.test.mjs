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
