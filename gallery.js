// Галерея в ноутбуке: папки, внутри — фото; фото открывается крупно, листается, подписывается.
import * as store from './store.js';
import { pop } from './sound.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const COLORS = ['#f4b6c2', '#9fc7d9', '#b5d39b', '#f2cf7e', '#c9b6e8', '#f5b38b'];
const who = () => store.me().name;

export function renderGallery(el) {
  let open = null, viewer = -1;
  const draw = () => el.replaceChildren(open ? folderView() : rootView());
  store.watch(el, ['photos', 'folders'], () => { if (viewer < 0) draw(); });

  function rootView() {
    const folders = store.all('folders').sort((a, b) => a.created - b.created);
    const photos = store.all('photos');
    const name = h('input', { placeholder: 'название новой папки', maxLength: 40 });
    const bar = h('form', { className: 'gbar', onsubmit: async (e) => {
      e.preventDefault();
      const f = { name: name.value.trim() || 'Новая папка', color: COLORS[folders.length % COLORS.length], created: Date.now() };
      const id = store.uid();
      await store.put('folders', id, f).catch(console.warn);
      pop(); open = id; draw();
    } }, h('b', { textContent: 'Галерея' }), h('span', { className: 'grow' }), name, h('button', { textContent: '＋ папка' }));
    const grid = h('div', { className: 'fgrid' });
    for (const f of folders) {
      const inside = photos.filter((p) => p.folder === f.id).sort((a, b) => b.date.localeCompare(a.date));
      grid.append(h('button', { className: 'folder', style: `--fc:${f.color}`, onclick: () => { open = f.id; draw(); } },
        h('div', { className: 'ficon' }, h('div', { className: 'fback' }),
          ...inside.slice(0, 3).map((p, i) => h('img', { src: store.media(p.url), alt: '', loading: 'lazy', style: `--i:${i}` })),
          h('div', { className: 'ffront' })),
        h('span', { textContent: f.name }), h('small', { textContent: `${inside.length} фото` })));
    }
    if (!folders.length) grid.append(h('p', { className: 'empty', textContent: 'Создай первую папку — например «Первое свидание» или «Море» — и закидывай туда фото.' }));
    return h('div', {}, bar, grid);
  }

  function folderView() {
    const f = store.get('folders', open);
    if (!f) { open = null; return rootView(); }
    const list = store.all('photos').filter((p) => p.folder === open).sort((a, b) => a.date.localeCompare(b.date));
    const save = () => store.put('folders', open, f).catch(console.warn);
    const status = h('span', { className: 'status' });
    const file = h('input', { type: 'file', accept: 'image/*', multiple: true, onchange: async () => {
      const files = [...file.files]; file.value = '';
      for (let i = 0; i < files.length; i++) {
        status.textContent = `загружаю ${i + 1} из ${files.length}…`;
        try {
          const url = await store.uploadPhoto(files[i]);
          const pid = store.uid();
          await store.put('photos', pid, { folder: open, url, caption: '', date: new Date().toISOString(), who: who() });
          store.award('photo', pid);
        } catch (e) { console.warn(e); status.textContent = 'одно фото не загрузилось'; }
      }
      status.textContent = ''; draw();
    } });
    const bar = h('div', { className: 'gbar' },
      h('button', { type: 'button', textContent: '‹ Галерея', onclick: () => { open = null; draw(); } }),
      h('input', { className: 'fname', value: f.name, maxLength: 40, onchange: (e) => { f.name = e.target.value.trim() || 'Папка'; save(); } }),
      h('span', { className: 'dots' }, ...COLORS.map((c) => h('button', { type: 'button', className: 'cdot', style: `background:${c}`, onclick: () => { f.color = c; save(); } }))),
      h('span', { className: 'grow' }), status,
      h('label', { className: 'btn' }, '＋ фото', file),
      h('button', { type: 'button', className: 'danger', textContent: 'удалить', onclick: async () => {
        if (!confirm(list.length ? `Удалить папку «${f.name}» и ${list.length} фото в ней?` : `Удалить папку «${f.name}»?`)) return;
        await Promise.all([...list.map((p) => store.del('photos', p.id)), store.del('folders', open)]).catch(console.warn);
        open = null; draw();
      } }));
    const grid = h('div', { className: 'pgrid' }, ...list.map((p, i) => h('button', { className: 'thumb', onclick: () => { viewer = i; showViewer(list); } },
      h('img', { src: store.media(p.url), alt: p.caption || '', loading: 'lazy' }), p.caption ? h('span', { textContent: p.caption }) : '')));
    if (!list.length) grid.append(h('p', { className: 'empty', textContent: 'Папка пустая — нажми «＋ фото», можно сразу несколько.' }));
    return h('div', {}, bar, grid);
  }

  function showViewer(list) {
    el.querySelector('.viewer')?.remove();
    if (viewer < 0 || !list[viewer]) return;
    const p = list[viewer];
    const go = (d) => { viewer = (viewer + d + list.length) % list.length; showViewer(list); };
    const cap = h('input', { value: p.caption || '', placeholder: 'подпись…', maxLength: 80, onchange: () => { p.caption = cap.value.trim(); store.put('photos', p.id, p).catch(console.warn); } });
    const v = h('div', { className: 'viewer', tabIndex: -1, onkeydown: (e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'Escape') { e.stopPropagation(); close(); } } },
      h('img', { src: store.media(p.url), alt: p.caption || '' }),
      h('button', { className: 'nav l', textContent: '‹', onclick: () => go(-1) }),
      h('button', { className: 'nav r', textContent: '›', onclick: () => go(1) }),
      h('div', { className: 'vbar' }, cap,
        h('small', { textContent: `${p.who || ''} · ${new Date(p.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · ${viewer + 1}/${list.length}` }),
        h('button', { className: 'danger', textContent: 'удалить', onclick: async () => { if (!confirm('Удалить фото?')) return; await store.del('photos', p.id).catch(console.warn); close(); draw(); } }),
        h('button', { textContent: '✕', onclick: () => close() })));
    const close = () => { viewer = -1; v.remove(); draw(); };
    el.append(v); v.focus();
  }

  draw();
}
