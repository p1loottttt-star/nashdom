// Альбомы с полки: лежат в общем хранилище (store.js), фото — ссылки на загруженные картинки.
import { DATA } from './data.js';
import { pop } from './sound.js';
import * as store from './store.js';

export const PALETTE = ['#e7849b', '#7fb3c8', '#8fb07a', '#e9b35f', '#a99ad6', '#f0a37a', '#6f7fb8', '#c8645f', '#5f9e8f', '#3b2a35'];
const blank = (title, color, order) => ({ id: store.uid(), title, color, order, cover: null, pages: [{ items: [] }, { items: [] }] });

export async function listAlbums() {
  let all = store.all('albums');
  if (!all.length && !store.get('meta', 'albumsSeeded')) {
    all = DATA.albums.map((a, i) => blank(a.title, a.color, i));
    await Promise.all(all.map((a) => store.put('albums', a.id, a)));
    await store.put('meta', 'albumsSeeded', { at: Date.now() });
  }
  return all.sort((a, b) => a.order - b.order);
}
export async function createAlbum() {
  const all = await listAlbums();
  const a = blank('Новый альбом', PALETTE[all.length % PALETTE.length], all.length ? Math.max(...all.map((x) => x.order)) + 1 : 0);
  await store.put('albums', a.id, a);
  store.award('album', a.id);
  return a;
}
const putAlbum = (a) => store.put('albums', a.id, a);
const photoURL = async (url) => url; // в альбоме храним сразу адрес фото
const addPhoto = (file) => store.uploadPhoto(file);

// ---------- окно альбома ----------
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const el = document.getElementById('album');
const $ = (sel) => el.querySelector(sel);
let A = null, spread = 0, editing = false, active = 1, onChange = null, onClose = null, saveT = 0;

const pages = () => [{ cover: true }, ...A.pages];
const perView = () => (innerWidth > 760 ? 2 : 1);
const lightText = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 150; };

function changed() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { putAlbum(A); onChange?.(A); }, 250);
}

function render() {
  el.style.setProperty('--album', A.color);
  el.classList.toggle('editing', editing);
  $('.album-name').textContent = A.title;
  $('[data-a=edit]').textContent = editing ? '✓ готово' : '✎ редактировать';
  $('.album-tools').hidden = !editing;
  $('[name=title]').value = A.title;
  const v = pages(), n = perView(), total = Math.ceil(v.length / n);
  spread = Math.min(spread, total - 1);
  const first = spread * n;
  $('.spread').replaceChildren(...v.slice(first, first + n).map((pg, i) => pageEl(pg, first + i)));
  $('.album-pos').textContent = `${spread + 1} / ${total}`;
  $('[data-a=prev]').disabled = spread === 0;
  $('[data-a=next]').disabled = spread >= total - 1;
}

function pageEl(pg, vi) {
  const page = h('div', { className: 'page' + (pg.cover ? ' cover' : '') + (editing && vi === active ? ' active' : '') });
  page.onpointerdown = (e) => { if (editing && active !== vi) { active = vi; el.querySelectorAll('.page').forEach((p) => p.classList.remove('active')); page.classList.add('active'); } if (e.target === page) select(null); };
  if (pg.cover) {
    page.style.color = lightText(A.color) ? '#fff' : '#3b2a35';
    const frame = h('div', { className: 'cover-photo' });
    if (A.cover) photoURL(A.cover).then((u) => frame.append(h('img', { src: u, alt: '' })));
    else frame.append(h('span', { textContent: editing ? 'обложка: «фото на обложку»' : '♥' }));
    page.append(frame, h('div', { className: 'cover-title', textContent: A.title }));
    return page;
  }
  pg.items.forEach((it) => page.append(itemEl(it, pg, page)));
  if (!pg.items.length && editing) page.append(h('div', { className: 'page-hint', textContent: 'добавь фото или подпись' }));
  page.append(h('div', { className: 'page-num', textContent: vi }));
  return page;
}

let selected = null;
function select(node) {
  el.querySelectorAll('.item.sel').forEach((n) => n.classList.remove('sel'));
  selected = node; node?.classList.add('sel');
}

function itemEl(it, pg, page) {
  const node = h('div', { className: 'item ' + it.type });
  const place = () => {
    node.style.left = it.x + '%'; node.style.top = it.y + '%'; node.style.transform = `rotate(${it.rot || 0}deg)`;
    if (it.type === 'photo') node.style.width = it.w + '%';
    else node.style.fontSize = it.size + 'cqw';
  };
  place();
  if (it.type === 'photo') photoURL(it.photo).then((u) => node.prepend(h('img', { src: u, alt: '', draggable: false })));
  else {
    const t = h('div', { className: 'txt', textContent: it.text });
    node.append(t);
    node.ondblclick = () => {
      if (!editing) return;
      t.contentEditable = 'true'; t.focus();
      document.getSelection().selectAllChildren(t);
      t.onblur = () => { t.contentEditable = 'false'; it.text = t.textContent.trim() || 'подпись'; t.textContent = it.text; changed(); };
    };
  }
  if (!editing) return node;

  const handle = (cls, title) => h('span', { className: 'hd ' + cls, title });
  const del = handle('del', 'убрать'), size = handle('size', 'размер'), rot = handle('rot', 'повернуть');
  node.append(del, size, rot);
  del.onpointerdown = (e) => { e.stopPropagation(); pg.items.splice(pg.items.indexOf(it), 1); changed(); render(); };

  const drag = (e, mode) => {
    if (node.querySelector('[contenteditable=true]')) return;
    e.preventDefault(); e.stopPropagation(); select(node);
    const r = page.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, s0 = { ...it };
    const cx = r.left + ((it.x + (it.type === 'photo' ? it.w / 2 : 10)) / 100) * r.width, cy = r.top + ((it.y + 8) / 100) * r.height;
    const move = (m) => {
      const dx = ((m.clientX - sx) / r.width) * 100, dy = ((m.clientY - sy) / r.height) * 100;
      if (mode === 'move') { it.x = Math.min(95, Math.max(-20, s0.x + dx)); it.y = Math.min(95, Math.max(-10, s0.y + dy)); }
      if (mode === 'size') { if (it.type === 'photo') it.w = Math.min(100, Math.max(12, s0.w + dx)); else it.size = Math.min(16, Math.max(2.5, s0.size + dx / 6)); }
      if (mode === 'rot') it.rot = (Math.atan2(m.clientY - cy, m.clientX - cx) * 180) / Math.PI + 90;
      place();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); changed(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  node.onpointerdown = (e) => drag(e, 'move');
  size.onpointerdown = (e) => drag(e, 'size');
  rot.onpointerdown = (e) => drag(e, 'rot');
  return node;
}

function targetPage() {
  if (active === 0) return null;
  return A.pages[active - 1] || A.pages[A.pages.length - 1];
}

async function addPhotos(files) {
  for (const f of files) {
    const id = await addPhoto(f);
    const pg = targetPage();
    if (!pg) A.cover = id;
    else pg.items.push({ type: 'photo', photo: id, x: 8 + Math.random() * 35, y: 6 + Math.random() * 45, w: 48, rot: Math.round(Math.random() * 10 - 5) });
  }
  changed(); render();
}

// панель и кнопки
$('[data-a=close]').onclick = () => closeAlbum();
$('[data-a=edit]').onclick = () => { editing = !editing; select(null); render(); };
$('[data-a=prev]').onclick = () => { spread--; render(); };
$('[data-a=next]').onclick = () => { spread++; render(); };
$('[name=title]').oninput = (e) => { A.title = e.target.value.slice(0, 40) || 'Без названия'; $('.album-name').textContent = A.title; el.querySelectorAll('.cover-title').forEach((n) => (n.textContent = A.title)); changed(); };
$('.swatches').append(...PALETTE.map((c) => h('button', { type: 'button', className: 'sw', style: `background:${c}`, title: c, onclick: () => { A.color = c; $('[name=color]').value = c; changed(); render(); } })));
$('[name=color]').oninput = (e) => { A.color = e.target.value; changed(); render(); };
$('[name=photos]').onchange = (e) => { addPhotos([...e.target.files]); e.target.value = ''; };
$('[name=cover]').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; A.cover = await addPhoto(f); changed(); render(); };
$('[data-a=text]').onclick = () => {
  const pg = targetPage() || A.pages[0];
  pg.items.push({ type: 'text', text: 'подпись', x: 15 + Math.random() * 30, y: 70 + Math.random() * 15, size: 6, rot: Math.round(Math.random() * 6 - 3) });
  changed(); render();
};
$('[data-a=page]').onclick = () => { A.pages.push({ items: [] }); active = A.pages.length; spread = Math.floor(active / perView()); changed(); render(); };
$('[data-a=unpage]').onclick = () => {
  const i = active - 1;
  if (i < 0 || !A.pages[i] || A.pages.length <= 1) return;
  if (A.pages[i].items.length && !confirm('Удалить страницу вместе с фото?')) return;
  A.pages.splice(i, 1); active = Math.max(1, active - 1); changed(); render();
};
$('[data-a=delete]').onclick = async () => {
  if (!confirm(`Удалить альбом «${A.title}»?`)) return;
  await store.del('albums', A.id);
  A.deleted = true; closeAlbum();
};
addEventListener('keydown', (e) => {
  if (el.hidden || document.activeElement?.isContentEditable || document.activeElement?.tagName === 'INPUT') return;
  if (e.key === 'Escape') closeAlbum();
  if (e.key === 'ArrowRight' && !$('[data-a=next]').disabled) { spread++; render(); }
  if (e.key === 'ArrowLeft' && spread > 0) { spread--; render(); }
});
addEventListener('resize', () => { if (!el.hidden) render(); });

export function openAlbum(album, opts = {}) {
  A = album; spread = 0; active = 1; editing = !!opts.edit; onChange = opts.onChange; onClose = opts.onClose;
  $('[name=color]').value = A.color;
  el.hidden = false; pop();
  requestAnimationFrame(() => el.classList.add('on'));
  render();
}
function closeAlbum() {
  clearTimeout(saveT);
  if (!A.deleted) putAlbum(A).catch(() => {});
  onChange?.(A.deleted ? null : A);
  el.classList.remove('on');
  setTimeout(() => { el.hidden = true; onClose?.(); }, 350);
}
