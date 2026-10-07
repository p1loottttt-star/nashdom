// Магазин в ноутбуке: баллы пары → своя комната (стены, пол, стол), вещи, которые ставишь куда хочешь, и подарки партнёру.
// Цены проверяет сервер (buy). Стиль покупается один раз и переключается бесплатно; вещей можно сколько угодно.
import * as store from './store.js';
import { SHOP, EARN } from './catalog.js';
import { pop, chime } from './sound.js';
import { toast } from './desktop.js';
import { getRoom, saveRoom, myStyles, myThings } from './myroom.js';
import { swatch } from './roomstyle.js';
import { DESK_COLORS } from './furniture.js';
import { swatchRow } from './roomsetup.js';
import { fill } from './thumbs.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null && k !== false)); return e; };
const BAL = ['балл', 'балла', 'баллов'];
const plural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
const TABS = [['room', '🏠 моя комната'], ['decor', '🪴 вещи'], ['gift', '🎁 подарки'], ['earn', '💡 как заработать']];
const SECTIONS = {
  room: [['wall', 'Стены и обои'], ['floor', 'Пол'], ['desk', 'Стол']],
  decor: [['wall', 'На стену'], ['table', 'На стол и полки'], ['floor', 'На пол']],
};

export function renderShop(el) {
  let tab = 'room', gifting = null, busy = false;

  const draw = () => {
    const bal = store.balance();
    const top = h('div', { className: 'shophead' },
      h('div', { className: 'sbal' }, h('b', { textContent: `💗 ${bal}` }), h('span', { textContent: plural(bal, BAL) + ' в копилке пары' })),
      h('div', { className: 'stabs' }, ...TABS.map(([k, t]) => h('button', { className: tab === k ? 'on' : '', textContent: t, onclick: () => { tab = k; gifting = null; draw(); } }))));
    if (tab === 'earn') return el.replaceChildren(top, earnView());
    if (tab === 'gift') return el.replaceChildren(top, grid(SHOP.filter((s) => s.kind === 'gift')));
    const body = [];
    if (tab === 'room') body.push(h('p', { className: 'snote-top', textContent: 'Это твоя комната — у половинки своя. Купленное остаётся навсегда: переключай бесплатно.' }));
    if (tab === 'decor') body.push(h('p', { className: 'snote-top', textContent: 'Купленная вещь ложится в коробку. В комнате нажми «🪄 расставить» и перетащи её куда хочешь — на стену, стол, полку или пол.' }));
    for (const [key, label] of SECTIONS[tab]) {
      const list = SHOP.filter((s) => (tab === 'room' ? s.kind === 'style' && s.slot === key : s.kind === 'decor' && s.cat === key));
      body.push(h('h4', { className: 'ssec', textContent: label }));
      if (tab === 'room' && key === 'desk') body.push(h('div', { className: 'sdeskcol' }, h('span', { textContent: 'цвет стола:' }),
        swatchRow('deskColor', Object.keys(DESK_COLORS), getRoom().deskColor, (id) => { saveRoom({ deskColor: id }); draw(); })));
      body.push(grid(list));
    }
    el.replaceChildren(top, ...body);
  };

  function grid(list) {
    const pics = [];
    queueMicrotask(() => fill(pics));
    const bal = store.balance(), partner = store.partner(), own = myStyles(), room = getRoom(), things = myThings();
    return h('div', { className: 'sgrid' }, ...list.map((s) => {
      const short = s.price - bal;
      let action, cls = '';
      if (s.kind === 'style') {
        const on = room[s.slot] === s.id;
        if (on) { action = h('span', { className: 'sown', textContent: '✓ сейчас у тебя' }); cls = ' has'; }
        else if (own.has(s.id)) action = h('button', { className: 'sbuy', textContent: 'поставить', onclick: () => { saveRoom({ [s.slot]: s.id }); pop(); draw(); } });
        else if (short > 0) action = h('span', { className: 'sshort', textContent: `не хватает ${short}` });
        else action = h('button', { className: 'sbuy', textContent: 'купить', onclick: () => buy(s) });
      } else if (s.kind === 'gift' && !partner) action = h('span', { className: 'sown', textContent: 'когда партнёр войдёт' });
      else if (short > 0) action = h('span', { className: 'sshort', textContent: `не хватает ${short}` });
      else if (gifting === s.id) {
        const note = h('input', { placeholder: `записка для ${partner.name}…`, maxLength: 200 });
        action = h('form', { className: 'snote', onsubmit: (e) => { e.preventDefault(); buy(s, note.value.trim()); } }, note, h('button', { textContent: 'отправить' }));
        setTimeout(() => note.focus());
      } else action = h('button', { className: 'sbuy', textContent: s.kind === 'gift' ? `подарить ${partner.name}` : 'купить', onclick: () => (s.kind === 'gift' ? ((gifting = s.id), draw()) : buy(s)) });
      const n = s.kind === 'decor' ? things.filter((t) => t.item === s.id).length : 0;
      const pic = s.kind === 'style' && s.slot !== 'desk' ? h('i', { className: 'sswatch', style: `background:${swatch(s.id)}` }) : h('i', { textContent: s.emoji });
      if (!pic.className) pics.push({ id: s.id, el: pic }); // эмодзи — пока рисуется превью
      return h('div', { className: 'sitem' + cls }, pic, h('b', { textContent: s.title }), h('small', { textContent: s.hint || (n ? `у тебя: ${n}` : '') }),
        h('div', { className: 'sprice', textContent: s.price ? `💗 ${s.price}` : 'бесплатно' }), action);
    }));
  }

  async function buy(s, note = '') {
    if (busy) return;
    busy = true;
    try {
      await store.buy(s.id, s.kind === 'gift' ? store.partner().id : null, note);
      chime(); pop();
      if (s.kind === 'style') { saveRoom({ [s.slot]: s.id }); toast(`${s.emoji} ${s.title} — уже у тебя в комнате`); }
      else if (s.kind === 'gift') toast(`${s.emoji} подарок отправлен — ${store.partner().name} найдёт его в комнате`);
      else toast(`${s.emoji} ${s.title} — в коробке. В комнате нажми «🪄 расставить»`, 4500);
      gifting = null;
    } catch (e) { toast(e.message || 'не получилось'); }
    busy = false; draw();
  }

  function earnView() {
    const rows = store.ledger().slice(-12).reverse();
    return h('div', { className: 'searn' },
      h('p', { textContent: 'Баллы общие на двоих. Начисляются за то, что вы делаете в доме вместе:' }),
      h('ul', {}, ...Object.entries(EARN).map(([k, [n, cap, label]]) => h('li', {}, h('b', { textContent: `+${n}` }), ` ${label}`, h('small', { textContent: ` · до ${cap} в день` })))),
      rows.length ? h('h4', { textContent: 'Последнее' }) : null,
      rows.length ? h('ul', { className: 'shist' }, ...rows.map((r) => h('li', {}, h('b', { className: r.amount > 0 ? 'plus' : '', textContent: (r.amount > 0 ? '+' : '') + r.amount }), ` ${histLabel(r)}`))) : null);
  }

  draw();
  const off = store.onLedger(() => (el.isConnected ? (gifting ? null : draw()) : off()));
}

export function histLabel(r) {
  const it = SHOP.find((s) => s.id === r.item);
  const who = store.nameOf(r.user_id);
  if (r.reason === 'decor') return `${who}: ${it?.emoji || ''} ${it?.title || r.item} в комнату`;
  if (r.reason === 'style') return `${who}: ${it?.emoji || ''} ${it?.title || r.item}`;
  if (r.reason === 'gift') return `🎁 ${who} → ${store.nameOf(r.to_user)}: ${it?.emoji || ''} ${it?.title || r.item}`;
  return `${EARN[r.reason]?.[2] || r.reason}${who ? ' · ' + who : ''}`;
}
