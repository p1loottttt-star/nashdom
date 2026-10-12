// Альбомы с полки — как редактор фотокниг: тема, раскладки со слотами под фото, кадрирование внутри рамки, свободные вещи поверх.
// Альбом — запись 'albums' (название, тема, порядок страниц, лоток фото), каждая страница — своя запись 'albumpage':
// правки двоих на разных страницах не затирают друг друга. Логика страниц — albumlogic.js, темы и раскладки — albumthemes.js.
import '@fontsource/neucha/400.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/amatic-sc/700.css';
import '@fontsource/marck-script/400.css';
import '@fontsource/bad-script/400.css';
import { DATA } from './data.js';
import { pop } from './sound.js';
import * as store from './store.js';
import { LAYOUTS, THEMES, theme, accentOf } from './albumthemes.js';
import { doodle } from './doodles.js';
import { icon } from './icons.js';
import { watchGlass } from './glass.js';
import { layoutById, blankPage, applyLayout, shuffle, putPhoto, migrate, autofill, exifTime, orientOf, decoSpots } from './albumlogic.js';

export const PALETTE = ['#e7849b', '#7fb3c8', '#8fb07a', '#e9b35f', '#a99ad6', '#f0a37a', '#6f7fb8', '#c8645f', '#5f9e8f', '#3b2a35'];
const blank = (title, color, order) => ({ id: store.uid(), title, color, order, cover: null, theme: 'kraft' });

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
const photoURL = (ref) => store.media(ref); // в альбоме храним ссылку на фото (в облаке — 'sb:<путь>')

// ---------- окно альбома ----------
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const el = document.getElementById('album');
const $ = (sel) => el.querySelector(sel);
let A = null, P = new Map(), spread = 0, editing = false, active = 1, tab = 'photos', onChange = null, onClose = null;
let busy = null, galOpen = false; // идёт перетаскивание/кадрирование/ввод — чужие правки этой страницы подождут

const TH = () => theme(A.theme);
const view = () => [{ cover: true }, ...A.pageIds.map((id) => P.get(id)).filter(Boolean)];
const perView = () => (innerWidth > 760 ? 2 : 1);
const lightText = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 150; };

// сохранение: альбом и каждая страница — отдельно, с задержкой
const timers = new Map();
const later = (key, fn) => { clearTimeout(timers.get(key)); timers.set(key, setTimeout(() => { timers.delete(key); fn(); }, 250)); };
const saveAlbum = () => later('album', () => { store.put('albums', A.id, A).catch(() => {}); onChange?.(A); });
const savePage = (pg) => { pg.by = store.me()?.id || ''; pg.at = Date.now(); later(pg.id, () => store.put('albumpage', pg.id, pg).catch(() => {})); };
function flush() { for (const [k, t] of timers) { clearTimeout(t); if (k === 'album') store.put('albums', A.id, A).catch(() => {}); else if (P.get(k)) store.put('albumpage', k, P.get(k)).catch(() => {}); } timers.clear(); }
const setPage = (pg) => { track(pg); P.set(pg.id, pg); savePage(pg); };
// данные фото (дата, ориентация) — по короткому ключу: в локальном режиме ссылка на фото — сама картинка (data:), длиной в сотни КБ
const mk = (ref) => { if (ref.length < 100) return ref; let x = 2166136261; for (let i = 0; i < ref.length; i += 7) x = Math.imul(x ^ ref.charCodeAt(i), 16777619); return 'h' + (x >>> 0).toString(36) + ref.length.toString(36); };
const meta = (ref) => ((A.meta ||= {})[mk(ref)] ||= {});
const remember = (photo) => { if (photo && !A.photos.includes(photo)) { A.photos.push(photo); saveAlbum(); } };
// загрузка с устройства: дата съёмки из EXIF (до сжатия — потом её нет) и ориентация — для автозаполнения
async function upload(f) {
  const t = exifTime(await f.slice(0, 256 * 1024).arrayBuffer()) || f.lastModified || Date.now(), info = {};
  const ref = await store.uploadPhoto(f, 1800, info);
  Object.assign(meta(ref), { t, o: orientOf(info.w, info.h) });
  remember(ref); saveAlbum();
  return ref;
}

function render() {
  const t = TH();
  el.className = 'th-' + t.id + (editing ? ' editing' : '') + (el.classList.contains('on') ? ' on' : '');
  el.style.setProperty('--album', A.color);
  el.style.setProperty('--font', `'${t.fonts[0]}'`); el.style.setProperty('--font2', `'${t.fonts[1]}'`); el.style.setProperty('--aink', t.ink[0]);
  $('.album-name').textContent = A.title;
  $('[data-a=edit]').innerHTML = editing ? `<i class="lg-ic">${icon('check')}</i>Готово` : `<i class="lg-ic">${icon('pencil')}</i>Редактировать`;
  $('.album-tools').hidden = !editing;
  if (editing) renderTools();
  const v = view(), n = perView(), total = Math.ceil(v.length / n);
  spread = Math.max(0, Math.min(spread, total - 1));
  const first = spread * n;
  $('.spread').replaceChildren(...v.slice(first, first + n).map((pg, i) => pageEl(pg, first + i)));
  // толщина книги по краям: слева прочитанное, справа — что осталось (1 лист ≈ 0,9 px, до 14 px)
  const thick = (k) => (k > 0 ? Math.min(14, 1.5 + k * 0.9) + 'px' : '0px');
  el.style.setProperty('--ls', thick(first - 1)); el.style.setProperty('--rs', thick(v.length - first - n));
  $('.album-pos').textContent = `${spread + 1} / ${total}`;
  $('[data-a=prev]').disabled = spread === 0;
  $('[data-a=next]').disabled = spread >= total - 1;
  renderSel(); renderStrip(); tellHere();
}

// ---------- лента миниатюр страниц: нажать — перейти, потянуть — переставить (на телефоне — подержать и потянуть) ----------
function renderStrip() {
  const strip = $('.ab-strip');
  strip.hidden = !editing;
  if (!editing) return;
  strip.replaceChildren(...A.pageIds.map((id, i) => {
    const pg = P.get(id), L = layoutById(pg?.layout), b = h('button', { type: 'button', className: 'ab-th th-' + A.theme + (active === i + 1 ? ' on' : ''), title: 'страница ' + (i + 1) });
    b.dataset.i = i;
    L?.slots.forEach((sl) => { const c = pg.slots[sl.id], k = h('i'); Object.assign(k.style, { left: sl.x + '%', top: sl.y + '%', width: sl.w + '%', height: sl.h + '%' }); if (c?.photo) k.style.backgroundImage = `url("${photoURL(c.photo)}")`; b.append(k); });
    b.append(h('b', { textContent: i + 1 }));
    b.onpointerdown = (e) => reorder(e, b, i);
    return b;
  }));
  strip.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function reorder(e, b, i) {
  const sx = e.clientX, sy = e.clientY, touch = e.pointerType === 'touch';
  let on = false, to = i, hold = touch ? setTimeout(() => { on = true; b.classList.add('ab-lift'); }, 350) : 0;
  const move = (m) => {
    if (!on) { if (Math.hypot(m.clientX - sx, m.clientY - sy) > 8) { if (touch) return end(m, true); on = true; b.classList.add('ab-lift'); } else return; }
    m.preventDefault();
    const t = document.elementFromPoint(m.clientX, m.clientY)?.closest('.ab-th');
    $('.ab-strip').querySelectorAll('.ab-drop').forEach((x) => x.classList.remove('ab-drop'));
    if (t) { to = +t.dataset.i; t.classList.add('ab-drop'); }
  };
  const end = (m, cancel) => {
    clearTimeout(hold); removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
    b.classList.remove('ab-lift');
    if (cancel || m.type === 'pointercancel') return;
    if (!on) { active = i + 1; spread = Math.floor(active / perView()); return render(); }
    if (to === i) return render();
    const ids = [...A.pageIds], [id] = ids.splice(i, 1); ids.splice(to, 0, id);
    A.pageIds = ids; saveAlbum(); active = to + 1; spread = Math.floor(active / perView()); render();
  };
  addEventListener('pointermove', move, { passive: false }); addEventListener('pointerup', end); addEventListener('pointercancel', end);
}

// ---------- кто где: я сообщаю свою страницу, на странице партнёра — плашка ----------
let told = '';
function tellHere() {
  const st = el.hidden ? {} : { app: 'album', ab: A.id, ...(editing && activePage() ? { pg: activePage().id } : {}) }, k = JSON.stringify(st);
  if (k !== told) { told = k; store.live.track(st); }
}
const partnerPage = () => { const p = store.partner(), st = p && store.live.presence()[p.id]; return st?.app === 'album' && st.ab === A.id ? st.pg : null; };

function pageEl(pg, vi) {
  const page = h('div', { className: 'page' + (pg.cover ? ' cover' : '') + (editing && vi === active ? ' active' : '') });
  page.dataset.vi = vi;
  page.onpointerdown = (e) => { if (editing && active !== vi) { active = vi; el.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p === page)); if (tab === 'layouts') renderTools(); renderStrip(); tellHere(); } if (e.target === page) select(null); };
  if (pg.cover) {
    page.style.color = lightText(A.color) ? '#fff' : '#3b2a35';
    const frame = h('div', { className: 'cover-photo' });
    if (A.cover) frame.append(h('img', { src: photoURL(A.cover), alt: '' }));
    else frame.append(h('span', { textContent: 'фото на обложку — во вкладке «тема»' }));
    page.append(...(A.cover || editing ? [frame] : []), h('div', { className: 'cover-title', textContent: A.title })); // без фото в чтении — только название
    return page;
  }
  page.dataset.page = pg.id;
  if (editing && partnerPage() === pg.id) page.append(h('div', { className: 'ab-here', textContent: `${store.partner()?.name || 'партнёр'} сейчас на этой странице` }));
  const L = layoutById(pg.layout);
  L?.slots.forEach((s) => page.append(slotEl(pg, s)));
  if (L?.cap) page.append(capEl(pg, L.cap));
  // тихие рисунки на свободных полях (карандашом, под фото и вещами)
  const t = TH();
  for (const d of decoSpots(L, pg.items, pg.id, t.stickers)) {
    const k = h('i', { className: 'ab-deco' }); k.innerHTML = doodle(d.name, { style: 'pencil', accent: t.ink[0] });
    Object.assign(k.style, { left: d.x + '%', top: d.y + '%', width: d.w + '%', rotate: d.rot + 'deg' });
    page.insertBefore(k, page.firstChild);
  }
  pg.items.forEach((it) => page.append(itemEl(it, pg, page)));
  if (!L && !pg.items.length && editing) page.append(h('div', { className: 'page-hint', textContent: 'выбери раскладку во вкладке «раскладки»' }));
  page.append(h('div', { className: 'page-num', textContent: vi }));
  return page;
}

// ---------- слоты: фото в рамке темы ----------
const cropCss = (img, c) => { const o = `${c.cx ?? 50}% ${c.cy ?? 50}%`; img.style.objectPosition = o; img.style.transformOrigin = o; img.style.transform = `scale(${c.zoom || 1})`; };
function slotEl(pg, s) {
  const c = pg.slots[s.id];
  const node = h('div', { className: 'ab-slot' + (c?.photo ? '' : ' ab-empty') });
  node.dataset.slot = s.id;
  Object.assign(node.style, { left: s.x + '%', top: s.y + '%', width: s.w + '%', height: s.h + '%', rotate: (s.rot || 0) * TH().tilt + 'deg' });
  const win = h('div', { className: 'ab-ph' });
  node.append(win);
  if (c?.photo) { const img = h('img', { src: photoURL(c.photo), alt: '', draggable: false }); cropCss(img, c); win.append(img); }
  else if (editing) win.append(h('span', { className: 'ab-add', textContent: '＋ фото' }));
  if (!editing) return node;
  node.onpointerdown = (e) => {
    if (e.button > 0 || node.classList.contains('ab-crop')) return;
    e.stopPropagation();
    if (!c?.photo) return pickFor(pg, s.id);
    dragPhoto(e, c.photo, { page: pg.id, slot: s.id }, () => startCrop(pg, s.id, node)); // нажал и не повёл — кадрировать
  };
  return node;
}
function pickFor(pg, slot) {
  const inp = h('input', { type: 'file', accept: 'image/*' });
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const ref = await upload(f);
    const cur = P.get(pg.id); setPage({ ...cur, slots: { ...cur.slots, [slot]: { photo: ref } } }); render();
  };
  inp.click();
}

// кадрирование внутри рамки: вести — сдвиг, колесо или два пальца — масштаб; нажатие мимо, Enter или Esc — готово
function startCrop(pg, slot, node) {
  if (busy) return;
  const img = node.querySelector('img'), win = node.querySelector('.ab-ph'), c = { ...P.get(pg.id).slots[slot] };
  busy = pg.id; node.classList.add('ab-crop'); select(null);
  const hint = h('div', { className: 'crop-hint', textContent: 'двигай фото · колесо или два пальца — ближе · нажми мимо — готово' });
  el.append(hint);
  const pts = new Map(); let last = null, dist0 = 0, z0 = 1;
  const down = (e) => {
    if (!node.contains(e.target)) return finish();
    e.preventDefault(); e.stopPropagation(); win.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; dist0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = c.zoom || 1; }
  };
  const move = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; c.zoom = Math.min(4, Math.max(1, (z0 * Math.hypot(a[0] - b[0], a[1] - b[1])) / dist0)); }
    else { const r = win.getBoundingClientRect(), k = 140 / (c.zoom || 1); c.cx = Math.min(100, Math.max(0, (c.cx ?? 50) - ((e.clientX - last[0]) / r.width) * k)); c.cy = Math.min(100, Math.max(0, (c.cy ?? 50) - ((e.clientY - last[1]) / r.height) * k)); last = [e.clientX, e.clientY]; }
    cropCss(img, c);
  };
  const up = (e) => { pts.delete(e.pointerId); if (pts.size === 1) last = [...pts.values()][0]; };
  const wheel = (e) => { e.preventDefault(); c.zoom = Math.min(4, Math.max(1, (c.zoom || 1) * Math.exp(-e.deltaY * 0.0015))); cropCss(img, c); };
  const key = (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); finish(); } };
  function finish() {
    removeEventListener('pointerdown', down, true); node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); node.removeEventListener('wheel', wheel); removeEventListener('keydown', key, true);
    hint.remove(); node.classList.remove('ab-crop'); busy = null;
    const cur = P.get(pg.id); setPage({ ...cur, slots: { ...cur.slots, [slot]: c } }); render();
  }
  addEventListener('pointerdown', down, true); node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
  node.addEventListener('wheel', wheel, { passive: false }); addEventListener('keydown', key, true);
}

// перетаскивание фото: из лотка или из слота — в слот (занят — меняются местами), на страницу — свободным фото
function dragPhoto(e, photo, from, onTap) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  let ghost = null, over = null;
  const move = (m) => {
    if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return;
    if (!ghost) { busy = from?.page || 'tray'; ghost = h('img', { className: 'drag-ghost', src: photoURL(photo), alt: '' }); document.body.append(ghost); }
    ghost.style.left = m.clientX + 'px'; ghost.style.top = m.clientY + 'px';
    const t = document.elementFromPoint(m.clientX, m.clientY)?.closest('.page:not(.cover) .ab-slot');
    if (t !== over) { over?.classList.remove('ab-drop'); over = t; over?.classList.add('ab-drop'); }
  };
  const up = (m) => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (!ghost) return onTap?.();
    ghost.remove(); over?.classList.remove('ab-drop'); busy = null;
    if (m.type === 'pointercancel') return;
    const at = document.elementFromPoint(m.clientX, m.clientY), slot = at?.closest('.ab-slot'), page = at?.closest('.page:not(.cover)');
    if (slot && page) {
      const out = putPhoto(P, { page: page.dataset.page, slot: slot.dataset.slot }, photo, from);
      for (const [id, pg] of out) if (pg !== P.get(id)) setPage(pg);
    } else if (page) { // свободное фото там, где отпустил
      if (from) { const fp = P.get(from.page), slots = { ...fp.slots }; delete slots[from.slot]; setPage({ ...fp, slots }); }
      const r = page.getBoundingClientRect(), pg = P.get(page.dataset.page);
      setPage({ ...pg, items: [...pg.items, { id: store.uid(), type: 'photo', photo, x: ((m.clientX - r.left) / r.width) * 100 - 20, y: ((m.clientY - r.top) / r.height) * 100 - 12, w: 40, rot: Math.round(Math.random() * 8 - 4) }] });
    } else return;
    render();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

// подпись раскладки — пишется прямо на странице шрифтом темы
function capEl(pg, cap) {
  const node = h('div', { className: 'ab-cap', textContent: pg.caption || '' });
  Object.assign(node.style, { left: cap.x + '%', top: cap.y + '%', width: cap.w + '%' });
  if (!editing) return node;
  node.contentEditable = 'true'; node.spellcheck = false; node.dataset.ph = 'подпись…';
  node.onfocus = () => { busy = pg.id; };
  node.oninput = () => { const cur = P.get(pg.id); P.set(pg.id, { ...cur, caption: node.textContent.slice(0, 200) }); savePage(P.get(pg.id)); };
  node.onblur = () => { busy = null; };
  node.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); node.blur(); } };
  return node;
}

// ---------- свободные вещи поверх раскладки: фото, надписи, наклейки, ленты ----------
let selected = null; // { page, id }
function select(pageId, id) {
  selected = id ? { page: pageId, id } : null;
  el.querySelectorAll('.item.sel').forEach((n) => n.classList.remove('sel'));
  if (selected) el.querySelector(`.page[data-page="${pageId}"] .item[data-id="${id}"]`)?.classList.add('sel');
  renderSel();
}
const selItem = () => (selected ? P.get(selected.page)?.items.find((x) => x.id === selected.id) : null);
// изменить вещь (или все вещи страницы) и сохранить
function editItems(pageId, fn) { const pg = P.get(pageId); setPage({ ...pg, items: fn(pg.items) }); render(); }

function itemEl(it, pg, page) {
  const t = TH(), node = h('div', { className: 'item ' + it.type + (selected?.id === it.id ? ' sel' : '') });
  node.dataset.id = it.id;
  const place = () => {
    node.style.left = it.x + '%'; node.style.top = it.y + '%'; node.style.transform = `rotate(${it.rot || 0}deg)`;
    if (it.type === 'text') node.style.fontSize = it.size + 'cqw'; else node.style.width = it.w + '%';
  };
  place();
  if (it.type === 'photo') node.prepend(h('img', { src: photoURL(it.photo), alt: '', draggable: false }));
  else if (it.type === 'sticker') node.innerHTML = doodle(it.name, { style: t.print, accent: accentOf(t, it.name) });
  else if (it.type === 'tape') node.style.background = t.tapes[(it.tape || 0) % t.tapes.length];
  else {
    const tx = h('div', { className: 'txt', textContent: it.text });
    node.style.fontFamily = `'${t.fonts[it.font || 0]}', Caveat, cursive`; node.style.color = t.ink[(it.ink || 0) % t.ink.length];
    node.append(tx);
    node.ondblclick = () => {
      if (!editing) return;
      tx.contentEditable = 'true'; tx.focus(); busy = pg.id;
      document.getSelection().selectAllChildren(tx);
      tx.onblur = () => { tx.contentEditable = 'false'; busy = null; const text = tx.textContent.trim() || 'надпись'; editItems(pg.id, (xs) => xs.map((x) => (x.id === it.id ? { ...x, text } : x))); };
    };
  }
  if (!editing) return node;
  const handle = (cls, title) => h('span', { className: 'hd ' + cls, title });
  const del = handle('del', 'убрать'), size = handle('size', 'размер'), rot = handle('rot', 'повернуть');
  node.append(del, size, rot);
  del.onpointerdown = (e) => { e.stopPropagation(); select(null); editItems(pg.id, (xs) => xs.filter((x) => x.id !== it.id)); };
  const drag = (e, mode) => {
    if (node.querySelector('[contenteditable=true]')) return;
    e.preventDefault(); e.stopPropagation(); select(pg.id, it.id); busy = pg.id;
    const r = page.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, s0 = { ...it };
    const nr = node.getBoundingClientRect(), cx = nr.left + nr.width / 2, cy = nr.top + nr.height / 2;
    const wPct = (node.offsetWidth / page.offsetWidth) * 100, hPct = (node.offsetHeight / page.offsetHeight) * 100;
    const move = (m) => {
      const dx = ((m.clientX - sx) / r.width) * 100, dy = ((m.clientY - sy) / r.height) * 100;
      if (mode === 'move') {
        const s = snap(s0.x + dx, s0.y + dy, wPct, hPct, page, it.id, m.altKey);
        it.x = Math.min(95, Math.max(-20, s.x)); it.y = Math.min(95, Math.max(-10, s.y));
      }
      if (mode === 'size') { if (it.type === 'text') it.size = Math.min(16, Math.max(2.5, s0.size + dx / 6)); else it.w = Math.min(100, Math.max(it.type === 'photo' ? 12 : 6, s0.w + dx)); }
      if (mode === 'rot') { const a = (Math.atan2(m.clientY - cy, m.clientX - cx) * 180) / Math.PI + 90; it.rot = Math.abs(a % 90) < 3 || Math.abs(a % 90) > 87 ? Math.round(a / 90) * 90 : a; }
      place();
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); busy = null; guides();
      if (it.x === s0.x && it.y === s0.y && it.w === s0.w && it.size === s0.size && it.rot === s0.rot) return;
      const cur = P.get(pg.id); setPage({ ...cur, items: cur.items.map((x) => (x.id === it.id ? { ...it } : x)) });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  node.onpointerdown = (e) => drag(e, 'move');
  size.onpointerdown = (e) => drag(e, 'size');
  rot.onpointerdown = (e) => drag(e, 'rot');
  return node;
}

// магниты: центр страницы, поля 6 %, края и центры других вещей; Alt — без магнитов. Направляющие видно, пока тащишь
const SNAP = 1.4;
function snap(x, y, w, hh, page, id, off) {
  if (off) return guides(), { x, y };
  const xs = [50, 6, 94], ys = [50, 6, 94];
  for (const n of page.querySelectorAll('.item, .ab-slot')) {
    if (n.dataset.id === id) continue;
    const l = (n.offsetLeft / page.offsetWidth) * 100, t = (n.offsetTop / page.offsetHeight) * 100, nw = (n.offsetWidth / page.offsetWidth) * 100, nh = (n.offsetHeight / page.offsetHeight) * 100;
    xs.push(l, l + nw / 2, l + nw); ys.push(t, t + nh / 2, t + nh);
  }
  const best = (v, half, list) => { let out = null; for (const g of list) for (const k of [0, half, half * 2]) if (Math.abs(v + k - g) < SNAP && (!out || Math.abs(v + k - g) < out.d)) out = { v: g - k, g, d: Math.abs(v + k - g) }; return out; };
  const bx = best(x, w / 2, xs), by = best(y, hh / 2, ys);
  guides(page, bx?.g, by?.g);
  return { x: bx ? bx.v : x, y: by ? by.v : y };
}
function guides(page, gx, gy) {
  el.querySelectorAll('.ab-guide').forEach((g) => g.remove());
  if (gx != null) page.append(h('i', { className: 'ab-guide v', style: `left:${gx}%` }));
  if (gy != null) page.append(h('i', { className: 'ab-guide h', style: `top:${gy}%` }));
}

// новая вещь: перетащить из панели на страницу или нажать — в середину активной страницы
function dragNew(e, ghostHTML, make) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  let ghost = null;
  const move = (m) => {
    if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return;
    if (!ghost) { ghost = h('div', { className: 'ab-ghost' }); ghost.innerHTML = ghostHTML; document.body.append(ghost); }
    ghost.style.left = m.clientX + 'px'; ghost.style.top = m.clientY + 'px';
  };
  const up = (m) => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    ghost?.remove();
    let pageEl = ghost ? document.elementFromPoint(m.clientX, m.clientY)?.closest('.page:not(.cover)') : el.querySelector(`.page[data-page="${activePage()?.id}"]`);
    if (!pageEl || m.type === 'pointercancel') return;
    const r = pageEl.getBoundingClientRect(), it = { id: store.uid(), ...make() };
    const px = ghost ? ((m.clientX - r.left) / r.width) * 100 : 50, py = ghost ? ((m.clientY - r.top) / r.height) * 100 : 45;
    it.x = px - (it.w || 30) / 2; it.y = py - (it.type === 'tape' ? 2 : it.type === 'text' ? 4 : (it.w || 20) / 2 * 0.75);
    editItems(pageEl.dataset.page, (xs) => [...xs, it]); select(pageEl.dataset.page, it.id);
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
const tilt = (k) => Math.round((Math.random() - 0.5) * k);

// панель выбранной вещи: слои, дубль, удалить; у надписи — шрифт и чернила
function renderSel() {
  const box = $('.ab-sel'), it = selItem();
  box.hidden = !editing || !it;
  if (box.hidden) return box.replaceChildren();
  const t = TH(), pid = selected.page, set = (patch) => editItems(pid, (xs) => xs.map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
  const b = (text, title, fn) => h('button', { type: 'button', className: 'tbtn', textContent: text, title, onclick: fn });
  const kids = [
    b('⬆ выше', 'выше других', () => editItems(pid, (xs) => [...xs.filter((x) => x.id !== it.id), it])),
    b('⬇ ниже', 'ниже других', () => editItems(pid, (xs) => [it, ...xs.filter((x) => x.id !== it.id)])),
    b('⧉ дубль', 'копия рядом (Ctrl+D)', duplicate),
    b('✕ убрать', 'удалить (Delete)', () => { select(null); editItems(pid, (xs) => xs.filter((x) => x.id !== it.id)); }),
  ];
  if (it.type === 'text') {
    kids.push(...t.fonts.map((f, i) => h('button', { type: 'button', className: 'tbtn ab-font' + ((it.font || 0) === i ? ' on' : ''), textContent: 'Аа', style: `font-family:'${f}'`, title: f, onclick: () => set({ font: i }) })));
    kids.push(...t.ink.map((c, i) => h('button', { type: 'button', className: 'sw' + ((it.ink || 0) === i ? ' on' : ''), style: `background:${c}`, title: 'чернила', onclick: () => set({ ink: i }) })));
  }
  if (it.type === 'tape') kids.push(...t.tapes.map((bg, i) => h('button', { type: 'button', className: 'ab-tapebtn' + ((it.tape || 0) % t.tapes.length === i ? ' on' : ''), style: `background:${bg}`, onclick: () => set({ tape: i }) })));
  box.replaceChildren(h('span', { className: 'ab-note', textContent: { photo: 'фото', text: 'надпись — двойной клик, чтобы писать', sticker: 'наклейка', tape: 'лента' }[it.type] }), ...kids);
}
function duplicate() {
  const it = selItem(); if (!it) return;
  const copy = { ...it, id: store.uid(), x: it.x + 4, y: it.y + 4 };
  editItems(selected.page, (xs) => [...xs, copy]); select(selected.page, copy.id);
}

// отмена/повтор: снимки страниц до правки
const undo = [], redo = [];
function track(pg) { const before = P.get(pg.id); if (before && before !== pg) { undo.push(before); if (undo.length > 80) undo.shift(); redo.length = 0; } }
function step(from, to) {
  const pg = from.pop(); if (!pg) return;
  to.push(P.get(pg.id)); P.set(pg.id, pg); savePage(pg); select(null); render();
}

// ---------- панель правки: вкладки фото / раскладки / тема ----------
const activePage = () => (active > 0 ? P.get(A.pageIds[active - 1]) : null);
function renderTools() {
  el.querySelectorAll('.atabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const box = $('.atab');
  if (tab === 'photos') {
    const used = new Set([...P.values()].flatMap((pg) => [...Object.values(pg.slots).map((c) => c?.photo), ...pg.items.map((it) => it.photo)]));
    const up = h('label', { className: 'tbtn', textContent: '＋ фото' }, h('input', { type: 'file', accept: 'image/*', multiple: true, onchange: (e) => { addPhotos([...e.target.files]); e.target.value = ''; } }));
    const unused = A.photos.filter((r) => !used.has(r));
    const fromGal = h('button', { type: 'button', className: 'tbtn' + (galOpen ? ' on' : ''), textContent: galOpen ? '← фото альбома' : '🖼 из галереи', onclick: () => { galOpen = !galOpen; renderTools(); } });
    const auto = h('button', { type: 'button', className: 'tbtn', textContent: `✨ разложить по страницам${unused.length ? ` (${unused.length})` : ''}`, disabled: !unused.length, title: 'неразложенные фото — по новым страницам по дате съёмки', onclick: () => autoLay(unused) });
    if (galOpen) { // фото из галереи ноутбука: нажал — фото в лотке альбома (и в пустой рамке)
      const gal = store.all('photos').filter((p) => p.url && !A.photos.includes(p.url)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const thumbs = gal.map((p) => h('button', { type: 'button', className: 'ab-tray', title: 'добавить в альбом', onclick: () => { meta(p.url).t = Date.parse(p.date) || Date.now(); remember(p.url); fillFirst(p.url, false); render(); } }, h('img', { src: photoURL(p.url), alt: '', draggable: false })));
      return box.replaceChildren(fromGal, ...thumbs, h('span', { className: 'ab-note', textContent: gal.length ? 'нажми на фото — оно в альбоме' : 'в галерее нет новых фото' }));
    }
    const thumbs = A.photos.map((ref) => {
      const img = h('img', { src: photoURL(ref), alt: '', draggable: false });
      img.onload = () => { const m = meta(ref); if (!m.o) { m.o = orientOf(img.naturalWidth, img.naturalHeight); saveAlbum(); } }; // ориентация фото из галереи
      const t = h('button', { type: 'button', className: 'ab-tray' + (used.has(ref) ? ' ab-used' : ''), title: 'перетащи в рамку или нажми — в свободную рамку' }, img);
      t.onpointerdown = (e) => dragPhoto(e, ref, null, () => fillFirst(ref));
      return t;
    });
    box.replaceChildren(up, fromGal, auto, ...thumbs, h('span', { className: 'ab-note', textContent: A.photos.length ? 'перетащи фото в рамку · нажми на фото в рамке — подвинуть внутри' : 'загрузи фото — они встанут в пустые рамки страницы' }));
  } else if (tab === 'layouts') {
    const pg = activePage();
    const lays = LAYOUTS.map((L) => {
      const b = h('button', { type: 'button', className: 'ab-lay' + (pg?.layout === L.id ? ' on' : ''), title: L.name }, ...L.slots.map((s) => { const i = h('i'); Object.assign(i.style, { left: s.x + '%', top: s.y + '%', width: s.w + '%', height: s.h + '%' }); return i; }));
      b.onclick = () => { const cur = activePage(); if (!cur) return; setPage(applyLayout(cur, L.id)); render(); };
      return b;
    });
    box.replaceChildren(
      h('button', { type: 'button', className: 'tbtn', textContent: '🔀 перемешать', disabled: !pg, onclick: () => { const cur = activePage(); if (cur) { setPage(shuffle(cur)); render(); } } }),
      ...lays,
      h('button', { type: 'button', className: 'tbtn', textContent: '＋ страница', onclick: addPage }),
      h('button', { type: 'button', className: 'tbtn', textContent: '− страница', disabled: !pg || A.pageIds.length <= 1, onclick: delPage }),
    );
  } else if (tab === 'decor') {
    const t = TH();
    const tapes = t.tapes.map((bg, i) => { const b = h('button', { type: 'button', className: 'ab-tapebtn', style: `background:${bg}`, title: 'лента' }); b.onpointerdown = (e) => dragNew(e, `<i class="ab-tapeghost" style="background:${bg}"></i>`, () => ({ type: 'tape', tape: i, w: 26, rot: tilt(30) })); return b; });
    const stk = t.stickers.map((name) => { const svg = doodle(name, { style: t.print, accent: accentOf(t, name) }), b = h('button', { type: 'button', className: 'ab-stk', title: 'наклейка' }); b.innerHTML = svg; b.onpointerdown = (e) => dragNew(e, svg, () => ({ type: 'sticker', name, w: 16, rot: tilt(24) })); return b; });
    const txt = t.fonts.map((f, i) => { const b = h('button', { type: 'button', className: 'tbtn ab-font', textContent: '＋ надпись', style: `font-family:'${f}'` }); b.onpointerdown = (e) => dragNew(e, `<b style="font-family:'${f}'">надпись</b>`, () => ({ type: 'text', text: 'надпись', font: i, ink: 0, size: 6, rot: tilt(8) })); return b; });
    box.replaceChildren(...txt, ...tapes, ...stk, h('span', { className: 'ab-note', textContent: 'перетащи на страницу или нажми — встанет в середину' }));
  } else {
    const themes = THEMES.map((t) => h('button', { type: 'button', className: 'ab-thc th-' + t.id + (A.theme === t.id ? ' on' : ''), onclick: () => { A.theme = t.id; A.color = t.cover; saveAlbum(); render(); } }, h('b', { textContent: t.name })));
    const title = h('input', { name: 'title', maxLength: 40, value: A.title, ariaLabel: 'Название альбома' });
    title.oninput = () => { A.title = title.value.slice(0, 40) || 'Без названия'; $('.album-name').textContent = A.title; el.querySelectorAll('.cover-title').forEach((n) => (n.textContent = A.title)); saveAlbum(); };
    const color = h('input', { type: 'color', name: 'color', value: A.color, ariaLabel: 'Цвет обложки' });
    color.oninput = () => { A.color = color.value; saveAlbum(); render(); };
    const cover = h('label', { className: 'tbtn', textContent: '🖼 фото на обложку' }, h('input', { type: 'file', accept: 'image/*', onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; A.cover = await upload(f); render(); } }));
    box.replaceChildren(...themes, title, h('span', { className: 'swatches' }, ...PALETTE.map((c) => h('button', { type: 'button', className: 'sw', style: `background:${c}`, title: c, onclick: () => { A.color = c; saveAlbum(); render(); } }))), color, cover,
      h('button', { type: 'button', className: 'tbtn danger', textContent: 'удалить альбом', onclick: delAlbum }));
  }
}

async function addPhotos(files) {
  for (const f of files) {
    const ref = await upload(f);
    if (!fillFirst(ref, false)) continue;
  }
  render();
}
// фото — в первую пустую рамку активной страницы (нет пустой — останется в лотке)
function fillFirst(ref, redraw = true) {
  const pg = activePage(), L = layoutById(pg?.layout), s = L?.slots.find((x) => !pg.slots[x.id]?.photo);
  if (!s) return false;
  setPage({ ...pg, slots: { ...pg.slots, [s.id]: { photo: ref } } });
  if (redraw) render();
  return true;
}
// автозаполнение: пустые страницы в конце убираем, неразложенные фото — по новым страницам по дате
function autoLay(refs) {
  const empty = (pg) => !Object.values(pg.slots).some((c) => c?.photo) && !pg.items.length && !pg.caption;
  while (A.pageIds.length > 1 && empty(P.get(A.pageIds.at(-1)))) { const id = A.pageIds.pop(); P.delete(id); store.del('albumpage', id).catch(() => {}); }
  const from = A.pageIds.length;
  const pages = autofill(refs.map((ref) => ({ ref, t: meta(ref).t, o: meta(ref).o || 's' })), from);
  for (const p of pages) { const pg = { id: store.uid(), album: A.id, items: [], ...p }; P.set(pg.id, pg); store.put('albumpage', pg.id, pg).catch(() => {}); A.pageIds.push(pg.id); }
  saveAlbum(); active = from + 1; spread = Math.floor(active / perView()); render();
}
function addPage() {
  const pg = { id: store.uid(), ...blankPage(A.id, A.pageIds.length) };
  P.set(pg.id, pg); store.put('albumpage', pg.id, pg).catch(() => {});
  A.pageIds = [...A.pageIds, pg.id]; saveAlbum();
  active = A.pageIds.length; spread = Math.floor(active / perView()); render();
}
function delPage() {
  const pg = activePage();
  if (!pg || A.pageIds.length <= 1) return;
  if ((Object.keys(pg.slots).length || pg.items.length) && !confirm('Удалить страницу? Фото останутся во вкладке «фото».')) return;
  A.pageIds = A.pageIds.filter((id) => id !== pg.id); P.delete(pg.id); saveAlbum(); store.del('albumpage', pg.id).catch(() => {});
  active = Math.max(1, active - 1); render();
}
async function delAlbum() {
  if (!confirm(`Удалить альбом «${A.title}»?`)) return;
  await Promise.all(A.pageIds.map((id) => store.del('albumpage', id).catch(() => {})));
  await store.del('albums', A.id);
  A.deleted = true; closeAlbum();
}

// ---------- листание: в чтении разворот переворачивается страницей ----------
let flipping = false;
async function go(dir) {
  const total = Math.ceil(view().length / perView()), to = spread + dir;
  if (flipping || to < 0 || to >= total) return;
  const sp = $('.spread'), [l, r] = sp.children;
  if (editing || perView() < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches || !l || !r) { spread = to; return render(); }
  flipping = true;
  const v = view(), [nl, nr] = [v[to * 2], v[to * 2 + 1]].map((pg, i) => (pg ? pageEl(pg, to * 2 + i) : h('div', { className: 'page ab-blank' })));
  const turning = dir > 0 ? r : l, under = dir > 0 ? nr : nl, back = dir > 0 ? nl : nr;
  const box = turning.getBoundingClientRect(), sb = sp.getBoundingClientRect();
  const leaf = h('div', { className: 'ab-leaf ' + (dir > 0 ? 'ab-fwd' : 'ab-bwd') });
  Object.assign(leaf.style, { left: box.left - sb.left + 'px', top: box.top - sb.top + 'px', width: box.width + 'px', height: box.height + 'px' });
  turning.replaceWith(under); // под листом — новая страница той же стороны
  turning.classList.add('ab-face'); back.classList.add('ab-face', 'ab-back');
  leaf.append(turning, back); sp.append(leaf);
  pop();
  await new Promise((res) => { leaf.addEventListener('animationend', res, { once: true }); setTimeout(res, 900); });
  spread = to; flipping = false; render();
}

// ---------- кнопки окна ----------
// значки кнопок окна (Phosphor) и стекло
for (const [sel, name] of [['[data-a=close]', 'back'], ['[data-a=prev]', 'prev'], ['[data-a=next]', 'next'], ['[data-u=undo]', 'undo'], ['[data-u=redo]', 'redo']]) $(sel).innerHTML = `<i class="lg-ic">${icon(name)}</i>`;
$('[data-a=close]').onclick = () => closeAlbum();
$('[data-a=edit]').onclick = () => { editing = !editing; select(null); render(); };
$('[data-u=undo]').onclick = () => step(undo, redo);
$('[data-u=redo]').onclick = () => step(redo, undo);
$('[data-a=prev]').onclick = () => go(-1);
$('[data-a=next]').onclick = () => go(1);
el.querySelectorAll('.atabs [data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderTools(); }));
addEventListener('keydown', (e) => {
  if (el.hidden || document.activeElement?.isContentEditable || document.activeElement?.tagName === 'INPUT') return;
  const mod = e.ctrlKey || e.metaKey, it = editing && selItem();
  if (editing && mod && e.code === 'KeyZ') { e.preventDefault(); return e.shiftKey ? step(redo, undo) : step(undo, redo); }
  if (editing && mod && e.code === 'KeyY') { e.preventDefault(); return step(redo, undo); }
  if (it && mod && e.code === 'KeyD') { e.preventDefault(); return duplicate(); }
  if (it && (e.key === 'Delete' || e.key === 'Backspace')) { const pid = selected.page; select(null); return editItems(pid, (xs) => xs.filter((x) => x.id !== it.id)); }
  if (it && e.key.startsWith('Arrow')) { // стрелки двигают выбранное (Shift — дальше)
    e.preventDefault(); const k = e.shiftKey ? 2 : 0.5, d = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, -k], ArrowDown: [0, k] }[e.key];
    return editItems(selected.page, (xs) => xs.map((x) => (x.id === it.id ? { ...x, x: x.x + d[0], y: x.y + d[1] } : x)));
  }
  if (e.key === 'Escape') return selected ? select(null) : closeAlbum();
  if (e.key === 'ArrowRight') go(1);
  if (e.key === 'ArrowLeft') go(-1);
});
// свайп по развороту в чтении
let swipe = null;
$('.spread').addEventListener('pointerdown', (e) => { if (!editing) swipe = e.clientX; });
$('.spread').addEventListener('pointerup', (e) => { if (swipe != null && Math.abs(e.clientX - swipe) > 50) go(e.clientX < swipe ? 1 : -1); swipe = null; });
addEventListener('resize', () => { if (!el.hidden && !busy) render(); });
// правки партнёра: страница и альбом подтягиваются сразу, кроме страницы, которую я сейчас трогаю
store.on('albumpage', (id, v) => {
  if (el.hidden || !A || (v && v.album !== A.id) || (!v && !P.has(id)) || busy === id) return;
  if (v) { P.set(id, { id, ...v }); if (!A.pageIds.includes(id)) A.pageIds = [...A.pageIds, id]; } else { P.delete(id); A.pageIds = A.pageIds.filter((x) => x !== id); }
  if (!busy && !typing()) render();
});
const typing = () => { const a = document.activeElement; return !!a && el.contains(a) && (a.isContentEditable || a.tagName === 'INPUT'); }; // печатает — не перерисовываем
store.live.onPresence(() => { if (!el.hidden && A && editing && !busy && !typing()) render(); });
store.on('albums', (id, v) => {
  if (el.hidden || !A || id !== A.id || !v) return;
  A = { ...A, ...v, id, pageIds: [...new Set([...(v.pageIds || []), ...A.pageIds.filter((p) => P.has(p) && !(v.pageIds || []).includes(p))])] };
  if (!busy && !typing()) render();
});

export async function openAlbum(album, opts = {}) {
  A = { ...album }; spread = 0; active = 1; editing = !!opts.edit; onChange = opts.onChange; onClose = opts.onClose; tab = 'photos'; busy = null;
  // старый альбом (все страницы внутри) → страницы отдельными записями
  const m = migrate(A, store.uid);
  if (m.pages.length) { await Promise.all(m.pages.map((pg) => store.put('albumpage', pg.id, pg))); A = m.album; await store.put('albums', A.id, A); }
  A.photos ||= [];
  P = new Map();
  for (const id of A.pageIds) { const pg = store.get('albumpage', id); if (pg) P.set(id, { id, ...pg }); } // нет записи — страницу удалили
  A.pageIds = A.pageIds.filter((id) => P.has(id));
  if (!A.pageIds.length) { const pg = { id: store.uid(), ...blankPage(A.id) }; P.set(pg.id, pg); store.put('albumpage', pg.id, pg).catch(() => {}); A.pageIds = [pg.id]; }
  // страницы, добавленные партнёром одновременно со мной (в pageIds не попали), — в конец
  for (const pg of store.all('albumpage')) if (pg.album === A.id && !P.has(pg.id)) { P.set(pg.id, pg); A.pageIds.push(pg.id); }
  el.hidden = false; pop();
  requestAnimationFrame(() => el.classList.add('on'));
  render(); watchGlass(el);
}
function closeAlbum() {
  flush(); told = ''; store.live.track({});
  onChange?.(A.deleted ? null : A);
  el.classList.remove('on');
  setTimeout(() => { el.hidden = true; onClose?.(); }, 350);
}
