// Первый вход: обустроить свою комнату — стены, пол, цвет стола. Всё видно сразу за окошком; потом — в магазине «Комната».
import { SHOP } from './catalog.js';
import { getRoom, saveRoom, myStyles } from './myroom.js';
import { swatch } from './roomstyle.js';
import { DESK_COLORS } from './furniture.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(Boolean)); return e; };

// ряд образцов: выбор применяется к комнате сразу
export function swatchRow(slot, ids, current, onPick) {
  return h('div', { className: 'rs-row' }, ...ids.map((id) => {
    const it = SHOP.find((s) => s.id === id);
    const b = h('button', { type: 'button', className: 'rs-sw' + (id === current ? ' on' : ''), title: it?.title || id, onclick: () => onPick(id) });
    b.style.background = slot === 'deskColor' ? DESK_COLORS[id] : swatch(id);
    return b;
  }));
}

export function askRoomSetup() {
  const box = h('div', { className: 'rsetup' });
  const draw = () => {
    const r = getRoom(), own = myStyles();
    const mine = (slot) => SHOP.filter((s) => s.kind === 'style' && s.slot === slot && own.has(s.id)).map((s) => s.id);
    box.replaceChildren(
      h('h3', { textContent: 'Твоя комната' }),
      h('p', { textContent: 'У каждого из вас она своя. Выбери, какой она будет, — остальное найдёшь в магазине в ноутбуке.' }),
      h('b', { textContent: 'стены' }), swatchRow('wall', mine('wall'), r.wall, (id) => { saveRoom({ wall: id }); draw(); }),
      h('b', { textContent: 'пол' }), swatchRow('floor', mine('floor'), r.floor, (id) => { saveRoom({ floor: id }); draw(); }),
      h('b', { textContent: 'стол' }), swatchRow('deskColor', Object.keys(DESK_COLORS), r.deskColor, (id) => { saveRoom({ deskColor: id }); draw(); }),
      h('button', { type: 'button', className: 'rs-done', textContent: 'готово ♥', onclick: () => { saveRoom({ setup: true }); box.remove(); } }));
  };
  draw();
  document.body.append(box);
}
