// Прототипы вида ноутбука: одно и то же содержимое (рабочий стол, «Игры», «Тесты» с вопросом дня),
// оформление — в CSS страницы направления. build({ style, colors, decorate }) собирает всё в #desktop.
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import { doodle } from '../../doodles.js';
import { pop, chime, tap, unfold } from '../../sound.js';

export const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k === 'html') e.innerHTML = v; else if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e[k] = v; else if (v != null && v !== false) e.setAttribute(k === 'cls' ? 'class' : k, v);
  e.append(...kids.flat().filter((x) => x != null && x !== false));
  return e;
};

const APPS = [['tube', 'CoupleTube'], ['gallery', 'Галерея'], ['plans', 'Планы'], ['thoughts', 'Мысли'], ['counter', 'Мы вместе'], ['quiz', 'Тесты'], ['games', 'Игры'], ['shop', 'Магазин'], ['profile', 'Профиль']];
const GAMES = [
  ['wave', 'Одна волна', 'Подсказка одним словом: угадай точку на шкале. Вместе, 5 раундов'],
  ['draw', 'Рисуй, угадывай', 'Один рисует, второй угадывает. Вживую с таймером или по ходам'],
  ['ttt', 'Крестики-нолики', 'Сердечки против лапок, три в ряд. Счёт серий копится'],
  ['cats', 'Котобой', 'Шесть котов разной формы и коробка-ловушка. Ищи котов партнёра в тумане'],
];
const TESTS = [
  ['chaos', 'Кто из нас главный хаос', 'кто из нас', '12 утв.', 'done', 'wait', 'смешные'],
  ['cats', 'Какой ты кот', 'какой ты', '8 вопр.', 'done', 'done', 'смешные'],
  ['bowl', 'Знаешь мои вкусы?', 'знаешь ли', '10 вопр.', null, 'done', 'еда'],
  ['cake', 'Какой ты десерт', 'какой ты', '8 вопр.', null, null, 'еда'],
  ['love', 'Кто из нас романтичнее', 'кто из нас', '12 утв.', null, null, 'романтика'],
  ['cloud', 'Какая ты погода', 'какой ты', '8 вопр.', null, null, 'характер'],
];
const ME = 'Ваня', SHE = 'Соня';

export function build({ style, colors, decorate = () => {} }) {
  const col = (k) => colors[k] || colors.quiz;
  const icon = (name, k = name) => h('span', { cls: 'ic', html: doodle(name, { style, accent: col(k) }) });
  const days = Math.floor((new Date() - new Date('2024-09-27T00:00:00')) / 864e5);
  const root = document.getElementById('desktop');

  const menubar = h('header', { cls: 'menubar' },
    h('span', { cls: 'brand' }, icon('heart', 'counter'), h('b', {}, 'Наш дом')),
    h('span', { cls: 'grow' }),
    h('span', { cls: 'm-days' }, `вместе ${days} ${days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? 'дня' : days % 10 === 1 && days % 100 !== 11 ? 'день' : 'дней'}`),
    h('span', { cls: 'm-clock' }, new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })));

  const hello = h('div', { cls: 'hello' }, h('b', {}, String(days)), h('span', {}, 'дней вместе'), h('small', {}, 'до годовщины 352 дня'));
  const icons = h('nav', { cls: 'icons' }, ...APPS.map(([k, t], i) => h('button', { cls: 'icon', 'data-app': k, style: `--c:${col(k)};--i:${i}` }, icon(k), h('span', { cls: 'lbl' }, t))));
  icons.querySelector('[data-app=games]').dataset.n = 1;
  icons.querySelector('[data-app=quiz]').dataset.n = 1;

  const win = (k, title, body, cls = '') => h('section', { cls: `win ${k} ${cls}`, 'data-app': k, style: `--c:${col(k)}` },
    h('div', { cls: 'bar' },
      h('div', { cls: 'lights' }, h('button', { cls: 'lt r', title: 'закрыть' }, '×'), h('button', { cls: 'lt y', title: 'свернуть' }, '−'), h('button', { cls: 'lt g', title: 'развернуть' }, '+')),
      h('span', { cls: 'wicon' }, icon(k)), h('b', { cls: 'ttl' }, title)),
    h('div', { cls: 'body' }, body));

  // ---------- «Игры» ----------
  const row = (k, title, status, btn, go) => h('div', { cls: 'gm-row', style: `--c:${col(k === 'wave' || k === 'ttt' || k === 'draw' || k === 'cats' ? 'g_' + k : k)}` },
    icon(k, 'g_' + k), h('b', {}, title), h('span', {}, status), h('button', { cls: go ? 'btn go' : 'btn' }, btn));
  const yours = h('div', { cls: 'gm-list' },
    row('cats', 'Котобой', `${SHE} поймала 3 кота из 6`, 'играть', true),
    row('draw', 'Рисуй, угадывай', 'раунд 2 из 6, рисуешь ты', 'играть', true));
  const games = h('div', { cls: 'gm' },
    h('div', { cls: 'gm-new' }, ...GAMES.map(([k, t, r]) => h('article', { cls: 'gm-card', 'data-k': k, style: `--c:${col('g_' + k)}` },
      h('div', { cls: 'art' }, icon(k, 'g_' + k)), h('b', {}, t), h('p', {}, r),
      h('button', { cls: 'btn go', onclick: (e) => newMatch(e.target.closest('.gm-card'), k, t) }, 'новая партия')))),
    h('h4', { cls: 'gm-h' }, 'Твой ход'), yours,
    h('h4', { cls: 'gm-h' }, `Ждём, пока походит ${SHE}`),
    h('div', { cls: 'gm-list' }, row('ttt', 'Крестики-нолики', 'счёт серий 4 : 3', 'смотреть')),
    h('h4', { cls: 'gm-h' }, 'Сыграно'),
    h('div', { cls: 'gm-list' }, row('wave', 'Одна волна', 'вместе 4 из 5, почти телепаты', 'итоги')));
  function newMatch(card, k, t) {
    card.classList.remove('slap'); void card.offsetWidth; card.classList.add('slap');
    pop();
    const r = row(k, t, 'новая партия, ход за тобой', 'играть', true);
    r.classList.add('enter');
    yours.prepend(r);
  }

  // ---------- «Тесты» ----------
  const marks = (a, b) => h('div', { cls: 'qz-marks' }, h('span', { cls: a ? 'ok' : '' }, a ? 'ты ✓' : 'ты —'), h('span', { cls: b ? 'ok' : '' }, `${SHE} ${b ? '✓' : '…'}`));
  const card = ([k, t, kind, n, mine, theirs, topic]) => {
    const c = h('article', { cls: 'qz-card' + (mine ? ' done' : ''), style: `--c:${col('t_' + k)}` },
      h('div', { cls: 'art' }, icon(k, 't_' + k)),
      h('b', {}, t), h('small', {}, `${kind} · ${topic} · ${n}`),
      marks(mine, theirs),
      h('div', { cls: 'qz-acts' },
        h('button', { cls: 'btn go', onclick: () => pass(c) }, mine ? 'ещё раз' : 'пройти'),
        mine && theirs ? h('button', { cls: 'btn' }, 'итоги') : null,
        !theirs ? h('button', { cls: 'btn' }, 'позвать') : null),
      h('i', { cls: 'stamp' }, 'пройдено'));
    return c;
  };
  function pass(c) {
    c.classList.remove('stamped'); void c.offsetWidth; c.classList.add('done', 'stamped');
    c.querySelector('.qz-marks span').textContent = 'ты ✓'; c.querySelector('.qz-marks span').className = 'ok';
    setTimeout(tap, 240, .5); setTimeout(chime, 420);
  }
  const day = h('div', { cls: 'qz-day', style: `--c:${col('day')}` },
    h('div', { cls: 'day-head' }, h('b', {}, 'Вопрос дня'), h('span', { cls: 'streak' }, icon('flame', 'day'), h('i', {}, '5'), ' дней подряд')),
    h('p', { cls: 'day-q' }, 'Что лучше в дождливый вечер?'),
    h('div', { cls: 'day-opts' }, ...['кино под пледом', 'гулять с зонтом'].map((t) => h('button', { cls: 'btn opt', onclick: () => answer(t) }, t))),
    h('div', { cls: 'day-reveal' },
      h('div', { cls: 'ans me' }, h('small', {}, ME), h('b', { cls: 'my' }, '')),
      h('div', { cls: 'ans she' }, h('small', {}, SHE), h('b', {}, 'кино под пледом'))),
    h('small', { cls: 'day-note' }, `${SHE} уже ответила. Её ответ откроется после твоего`));
  function answer(t) {
    day.querySelector('.my').textContent = t;
    day.classList.add('open', t === 'кино под пледом' ? 'same' : 'diff');
    day.querySelector('.day-note').textContent = t === 'кино под пледом' ? 'Совпало! Серия продолжается' : 'Не совпало, но серия всё равно растёт';
    unfold(.5);
    setTimeout(() => { const n = day.querySelector('.streak i'); n.textContent = '6'; n.classList.add('bump'); chime(); }, 650);
  }
  const quiz = h('div', { cls: 'qz' },
    day,
    h('div', { cls: 'qz-head' },
      h('div', { cls: 'qz-tabs' }, h('button', { cls: 'tab on' }, 'каталог'), h('button', { cls: 'tab' }, 'пройденные · 6')),
      h('label', { cls: 'qz-search' }, h('input', { placeholder: 'найти тест…' }))),
    h('div', { cls: 'qz-chips' }, ...['все', 'смешные', 'романтика', 'быт', 'еда', 'кино', 'если бы', 'характер'].map((t, i) => h('button', { cls: 'chip' + (i ? '' : ' on') }, t))),
    h('div', { cls: 'qz-wait' }, h('b', {}, `${SHE} зовёт пройти:`), h('button', { cls: 'btn' }, icon('cats', 't_cats'), 'Какой ты кот')),
    h('div', { cls: 'qz-grid' }, ...TESTS.map(card)));

  const gw = win('games', 'Игры', games), qw = win('quiz', 'Тесты', quiz, 'active');
  const dock = h('div', { cls: 'dock' }, ...APPS.map(([k, t]) => h('button', { 'data-app': k, title: t, cls: k === 'games' || k === 'quiz' ? 'run' : '', style: `--c:${col(k)}` }, icon(k))),
    h('button', { cls: 'power', title: 'Назад в комнату', style: `--c:${col('power')}` }, icon('power')));

  root.append(menubar, hello, icons, gw, qw, dock);

  // окна: клик поднимает наверх; светофор и прочее в прототипе не работают
  let z = 10;
  for (const w of [gw, qw]) w.addEventListener('pointerdown', () => { if (w.classList.contains('active')) return; root.querySelectorAll('.win').forEach((x) => x.classList.remove('active')); w.classList.add('active'); w.style.zIndex = ++z; });
  qw.style.zIndex = ++z;
  // док с увеличением: масштаб по расстоянию до курсора (только transform)
  const btns = [...dock.children];
  dock.addEventListener('pointermove', (e) => btns.forEach((b) => { const r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2)); b.style.setProperty('--k', 1 + .55 * Math.max(0, 1 - d / 130) ** 2); }));
  dock.addEventListener('pointerleave', () => btns.forEach((b) => b.style.setProperty('--k', 1)));
  // при открытии окна — упругое появление
  root.querySelectorAll('.icon, .dock button[data-app]').forEach((b) => b.addEventListener('click', () => {
    const w = root.querySelector(`.win[data-app=${b.dataset.app}]`); if (!w) return;
    w.hidden = false; w.classList.remove('open'); void w.offsetWidth; w.classList.add('open'); w.dispatchEvent(new Event('pointerdown')); pop();
  }));

  // переключатель для показа: стол / игры / тесты / оба
  const hud = h('div', { cls: 'lab-hud' }, ...[['стол', []], ['игры', ['games']], ['тесты', ['quiz']], ['оба', ['games', 'quiz']]].map(([t, show]) =>
    h('button', { onclick: () => { gw.hidden = !show.includes('games'); qw.hidden = !show.includes('quiz'); } }, t)),
  h('span', {}, '·'), ...[['А', 'a'], ['Б', 'b'], ['В', 'c']].map(([t, f]) => h('a', { href: `./ui-${f}.html`, cls: location.pathname.endsWith(`ui-${f}.html`) ? 'on' : '' }, t)));
  document.body.append(hud);
  const q = new URLSearchParams(location.search).get('show');
  if (q) hud.querySelector(`button:nth-child(${{ desk: 1, games: 2, quiz: 3 }[q] || 4})`).click();

  decorate(root, { icon, h, col });
  // зерно: один раз рисуем тайл шума и отдаём в CSS (без живых фильтров)
  const c = Object.assign(document.createElement('canvas'), { width: 160, height: 160 }), x = c.getContext('2d'), img = x.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random(); img.data[i] = img.data[i + 1] = img.data[i + 2] = v < .5 ? 40 : 255; img.data[i + 3] = Math.random() * 26; }
  x.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
}
