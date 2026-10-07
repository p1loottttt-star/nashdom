// Профиль в ноутбуке: мой профиль (правится), профиль партнёра, настройки дома, приглашение, история баллов.
import * as store from './store.js';
import { histLabel } from './shop.js';
import { toast } from './desktop.js';
import { findCity, fetchWeather, label as wxLabel, cityHour } from './weather.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null && k !== false)); return e; };
const EMOJI = ['🙂', '😎', '🥰', '🌸', '🐻', '🦊', '🐱', '🐶', '🌙', '☀️', '🍓', '🎧', '⚽', '🎨', '📚', '🌿'];
const COLORS = ['#ef6f8c', '#f0a37a', '#e9b35f', '#8fb07a', '#5f9e8f', '#7fb3c8', '#6f7fb8', '#a99ad6'];
const fmt = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '');

// город для погоды за окном: ищем по мере ввода, выбор — одним нажатием
function cityField(me) {
  const list = h('div', { className: 'pcities' });
  let t = 0;
  const inp = h('input', { value: me.city?.name || '', placeholder: 'например, Кишинёв', maxLength: 60, oninput: () => {
    clearTimeout(t);
    const q = inp.value.trim();
    if (q.length < 2) return list.replaceChildren();
    t = setTimeout(async () => {
      const found = await findCity(q).catch(() => []);
      list.replaceChildren(...found.map((c) => h('button', { type: 'button', onclick: () => {
        inp.value = c.name; list.replaceChildren();
        store.saveProfile({ city: c }).then(() => toast(`за окном теперь погода: ${c.name}`)).catch(() => {});
      } }, h('b', { textContent: c.name }), h('small', { textContent: c.region }))));
      if (!found.length) list.replaceChildren(h('small', { textContent: 'не нашлось — попробуй по-другому' }));
    }, 350);
  } });
  return h('div', { className: 'pfield col' }, h('span', { textContent: 'мой город — за окном его погода' }), inp, list);
}
// погода у партнёра — приятно знать, если вы в разных городах
const partnerWx = new Map();
function partnerWeather(p, el) {
  if (!p.city?.lat) return;
  const key = `${p.city.lat},${p.city.lon}`, show = (w) => {
    const [e, t] = wxLabel(w), hh = cityHour(w), clock = `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}`;
    el.textContent = `📍 ${p.city.name} · ${e} ${t}, ${w.temp > 0 ? '+' : ''}${w.temp}° · там сейчас ${clock}`;
  };
  const c = partnerWx.get(key);
  if (c && Date.now() - c.at < 15 * 60e3) return show(c);
  el.textContent = `📍 ${p.city.name}`;
  fetchWeather(p.city).then((w) => { partnerWx.set(key, w); if (el.isConnected) show(w); }).catch(() => {});
}

// кружок-аватар: фото или эмодзи на своём цвете
export function avatar(p, size = 64) {
  const a = h('i', { className: 'pava', textContent: p?.avatar ? '' : p?.emoji || '💌' });
  a.style.cssText = `width:${size}px;height:${size}px;font-size:${size * 0.5}px;background:${p?.color || '#ddd'}${p?.avatar ? `;background-image:url("${encodeURI(p.avatar)}")` : ''}`;
  return a;
}

export function renderProfile(el) {
  const draw = () => {
    const me = store.me(), p = store.partner(), c = store.couple();
    let t = 0;
    const save = (patch) => { clearTimeout(t); t = setTimeout(() => store.saveProfile(patch).catch(() => toast('не сохранилось')), 400); };

    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = file.files[0]; if (!f) return;
      try { await store.saveProfile({ avatar: await store.uploadPhoto(f, 400) }); draw(); } catch { toast('фото не загрузилось'); }
    } });
    const mine = h('div', { className: 'pfcard me', style: `--pc:${me.color}` },
      h('div', { className: 'ptop' }, h('label', { className: 'pphoto', title: 'поменять фото' }, avatar(me, 84), file),
        h('div', {}, h('input', { className: 'pname', value: me.name, maxLength: 40, placeholder: 'имя', onchange: (e) => store.saveProfile({ name: e.target.value.trim() || me.name }) }),
          h('small', { textContent: 'это ты' }))),
      h('div', { className: 'prow' }, ...EMOJI.map((e) => h('button', { className: 'pemo' + (me.emoji === e && !me.avatar ? ' on' : ''), textContent: e, onclick: () => store.saveProfile({ emoji: e, avatar: null }).then(draw) }))),
      h('div', { className: 'prow' }, ...COLORS.map((col) => h('button', { className: 'pcol' + (me.color === col ? ' on' : ''), style: `background:${col}`, onclick: () => store.saveProfile({ color: col }).then(draw) }))),
      cityField(me),
      h('label', { className: 'pfield' }, 'день рождения', h('input', { type: 'date', value: me.birthday || '', onchange: (e) => store.saveProfile({ birthday: e.target.value || null }) })),
      h('label', { className: 'pfield col' }, 'о себе', h('textarea', { rows: 3, maxLength: 300, value: me.about || '', placeholder: 'что любишь, о чём мечтаешь…', oninput: (e) => save({ about: e.target.value }) })));

    let other;
    if (p) {
      other = h('div', { className: 'pfcard', style: `--pc:${p.color}` },
        h('div', { className: 'ptop' }, avatar(p, 84), h('div', {}, h('b', { className: 'pname', textContent: p.name }), h('small', { textContent: 'твоя половинка ♥' }))),
        p.city?.lat ? (() => { const w = h('p', { className: 'pwx' }); partnerWeather(p, w); return w; })() : null,
        p.birthday ? h('p', { textContent: `🎂 ${fmt(p.birthday)}` }) : null,
        h('p', { className: 'pabout', textContent: p.about || 'пока без описания' }));
    } else {
      const link = c.invite ? `${location.origin}${location.pathname}?invite=${c.invite}` : '';
      other = h('div', { className: 'pfcard invite' },
        h('b', { textContent: '💌 Пригласи половинку' }),
        link ? h('p', { textContent: 'Отправь ссылку — по ней партнёр создаст аккаунт и войдёт в ваш дом. Код:' }) : h('p', { textContent: 'Сейчас дом живёт только в этом браузере. Когда подключено облако, здесь будет ссылка-приглашение.' }),
        link ? h('code', { textContent: c.invite }) : null,
        link ? h('button', { className: 'primary', textContent: 'скопировать ссылку', onclick: () => navigator.clipboard.writeText(link).then(() => toast('ссылка скопирована')) }) : null);
    }

    const house = h('div', { className: 'phouse' },
      h('label', { className: 'pfield' }, 'дом', h('input', { value: c.title, maxLength: 60, onchange: (e) => store.saveCouple({ title: e.target.value.trim() || 'Наш дом' }) })),
      h('label', { className: 'pfield' }, 'вместе с', h('input', { type: 'date', value: c.started || '', onchange: (e) => store.saveCouple({ started: e.target.value || null }) })),
      h('span', { className: 'grow' }),
      h('button', { textContent: store.isCloud() ? 'выйти' : 'войти как вторая половинка', onclick: () => store.signOut() }));

    const rows = store.ledger().slice(-30).reverse();
    const wallet = h('div', { className: 'pwallet' },
      h('h4', { textContent: `Копилка: 💗 ${store.balance()}` }),
      rows.length ? h('ul', { className: 'shist' }, ...rows.map((r) => h('li', {}, h('b', { className: r.amount > 0 ? 'plus' : '', textContent: (r.amount > 0 ? '+' : '') + r.amount }), ` ${histLabel(r)}`))) : h('p', { textContent: 'Баллы появятся за записки, фото, планы и кино вместе.' }));

    el.replaceChildren(h('div', { className: 'profile' }, h('div', { className: 'pfcards' }, mine, other), house, wallet,
      h('p', { className: 'pver', textContent: 'версия ' + __VERSION__ })));
  };
  draw();
  const offs = [store.onPeople(() => redraw()), store.onLedger(() => redraw())];
  function redraw() {
    if (!el.isConnected) return offs.forEach((f) => f());
    const a = document.activeElement;
    if (a && el.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return; // не мешаем печатать
    draw();
  }
}
