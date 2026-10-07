// Планы как дорожная карта: план → этапы-станции на тропинке → задачи, срок, заметки, ссылки, кто отвечает.
// У денежных целей есть копилка. Шаблоны дают готовый маршрут, всё редактируется.
import * as store from './store.js';
import { pop, chime } from './sound.js';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k !== null && k !== false)); return e; };
const uid = store.uid;
const people = () => ['оба', ...store.names()];
const EMOJI = ['🎓', '✈️', '🏡', '💰', '💍', '🌍', '🐈', '🎨', '🏔️', '🌊', '📚', '✨', '🚗', '🎂', '❤️'];
const days = (iso) => Math.ceil((new Date(iso + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5);
const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
const dleft = (n) => (n > 0 ? `через ${n} ${plural(n, ['день', 'дня', 'дней'])}` : n === 0 ? 'сегодня' : `просрочено на ${-n} ${plural(-n, ['день', 'дня', 'дней'])}`);

const stage = (emoji, title, tasks, notes = '') => ({ id: uid(), emoji, title, due: '', who: 'оба', notes, links: [], done: false, tasks: tasks.map((t) => ({ id: uid(), text: t, done: false })) });

export const TEMPLATES = {
  study: {
    label: 'Учёба за границей', emoji: '🎓', hint: 'на примере Австрии',
    make: () => ({
      title: 'Учёба в Австрии', emoji: '🎓', color: '#e7849b', money: { goal: 0, currency: '€', entries: [] },
      stages: [
        stage('🎯', 'Выбрать вуз и программу', ['Составить список вузов и программ', 'Проверить требования к языку для каждой программы', 'Выписать сроки подачи (у граждан не из ЕС они обычно раньше)', 'Узнать плату за семестр и взнос ÖH'], 'Сроки и требования проверять на сайте вуза — они меняются.'),
        stage('🗣️', 'Язык', ['Определиться: немецкий или англоязычная программа', 'Выбрать экзамен (ÖSD, Goethe, TestDaF / IELTS, TOEFL)', 'Записаться на экзамен', 'Сдать и получить сертификат']),
        stage('📄', 'Документы', ['Аттестат / диплом и приложение с оценками', 'Апостиль', 'Нотариальный перевод на немецкий', 'Загранпаспорт (срок действия!)', 'Мотивационное письмо и CV']),
        stage('📨', 'Подача заявки', ['Зарегистрироваться на портале вуза', 'Загрузить документы', 'Оплатить сбор, если он есть', 'Проверять почту и личный кабинет']),
        stage('✉️', 'Зачисление', ['Получить письмо о зачислении (Zulassungsbescheid)', 'Сохранить оригинал и копии']),
        stage('🛂', 'Виза и ВНЖ студента', ['Подтверждение средств на счёте', 'Медицинская страховка', 'Подтверждение жилья', 'Подать документы в посольство / консульство', 'Получить разрешение (Aufenthaltsbewilligung „Studierender“)']),
        stage('🏠', 'Жильё', ['Посмотреть общежития (OeAD Housing и другие)', 'Сравнить квартиры и WG', 'Подписать договор']),
        stage('✈️', 'Переезд', ['Купить билеты', 'Прописаться в течение 3 дней (Meldezettel)', 'Открыть банковский счёт', 'Оформить студенческий и проездной']),
      ],
    }),
  },
  trip: {
    label: 'Путешествие', emoji: '✈️', hint: 'от идеи до чемодана',
    make: () => ({
      title: 'Наше путешествие', emoji: '✈️', color: '#7fb3c8', money: { goal: 0, currency: '€', entries: [] },
      stages: [
        stage('🗺️', 'Куда и когда', ['Выбрать место', 'Выбрать даты', 'Посчитать бюджет']),
        stage('🎫', 'Билеты и жильё', ['Купить билеты', 'Забронировать жильё', 'Страховка']),
        stage('📍', 'Что посмотреть', ['Список мест', 'Кафе и рестораны', 'Маршрут по дням']),
        stage('🧳', 'Сборы', ['Документы', 'Одежда', 'Зарядки и адаптеры']),
        stage('📸', 'Поехали!', ['Сделать общее фото в каждом месте', 'Собрать альбом на полке']),
      ],
    }),
  },
  money: {
    label: 'Накопить на мечту', emoji: '💰', hint: 'копилка с целью',
    make: () => ({ title: 'Копим на мечту', emoji: '💰', color: '#e9b35f', money: { goal: 1000, currency: '€', entries: [] },
      stages: [stage('🎯', 'Цель', ['Решить, на что копим', 'Назначить сумму и срок']), stage('🐷', 'Копим', ['Откладывать каждый месяц']), stage('🎉', 'Тратим с удовольствием', [])] }),
  },
  move: {
    label: 'Переезд', emoji: '🏡', hint: 'новое жильё',
    make: () => ({ title: 'Переезд', emoji: '🏡', color: '#8fb07a', money: null,
      stages: [stage('🔍', 'Поиск', ['Район', 'Бюджет', 'Просмотры']), stage('📝', 'Договор', ['Проверить договор', 'Внести депозит']), stage('📦', 'Коробки', ['Разобрать вещи', 'Заказать перевозку']), stage('🔑', 'Новоселье', ['Ключи', 'Позвать друзей'])] }),
  },
  blank: {
    label: 'Свой план', emoji: '✨', hint: 'с чистого листа',
    make: () => ({ title: 'Новый план', emoji: '✨', color: '#a99ad6', money: null, stages: [stage('1️⃣', 'Первый шаг', []), stage('🏁', 'Финиш', [])] }),
  },
};

const progress = (p) => {
  const t = p.stages.flatMap((s) => s.tasks), done = t.filter((x) => x.done).length;
  const st = p.stages.filter((s) => s.done).length;
  return { done, total: t.length, pct: t.length ? done / t.length : p.stages.length ? st / p.stages.length : 0, stagesDone: st };
};
const current = (p) => p.stages.findIndex((s) => !s.done);
const saved = (p) => (p.money?.entries || []).reduce((a, e) => a + Number(e.amount || 0), 0);

function ring(pct, color) {
  const r = 22, c = 2 * Math.PI * r;
  const svg = `<svg viewBox="0 0 54 54" width="54" height="54"><circle cx="27" cy="27" r="${r}" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="6"/><circle cx="27" cy="27" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 27 27)"/><text x="27" y="31" text-anchor="middle" font-size="12" font-weight="800" fill="#3b2a35">${Math.round(pct * 100)}%</text></svg>`;
  return h('div', { className: 'ring', innerHTML: svg });
}

function confetti(el) {
  for (let i = 0; i < 26; i++) {
    const s = h('span', { className: 'heart-burst', textContent: ['♥', '✦', '♥', '❀'][i % 4] });
    s.style.cssText = `left:${50 + (Math.random() - 0.5) * 30}%;top:40%;--dx:${(Math.random() - 0.5) * 420}px;--dy:${-120 - Math.random() * 260}px;--r:${(Math.random() - 0.5) * 720}deg;color:${['#f08aa0', '#e9b35f', '#7fb3c8', '#a99ad6'][i % 4]}`;
    el.append(s); setTimeout(() => s.remove(), 1600);
  }
}

export async function renderPlans(el) {
  if (!store.all('plans').length && !store.get('meta', 'plansSeeded')) {
    const p = { ...TEMPLATES.study.make(), created: Date.now() };
    await store.put('plans', uid(), p).catch(console.warn);
    await store.put('meta', 'plansSeeded', { at: Date.now() }).catch(console.warn);
  }
  let openId = null, sel = 0, picking = false, saveT = 0;
  store.watch(el, ['plans'], () => draw());
  const draw = () => {
    const sc = el.querySelector('.pmap')?.scrollLeft;
    el.replaceChildren(openId ? planView() : listView());
    const m = el.querySelector('.pmap'); if (m && sc) m.scrollLeft = sc;
  };

  function listView() {
    const plans = store.all('plans').sort((a, b) => a.created - b.created);
    const top = h('div', { className: 'pbar' }, h('b', { textContent: 'Наши планы' }), h('span', { className: 'grow' }),
      h('button', { className: 'primary', textContent: picking ? 'отмена' : '＋ новый план', onclick: () => { picking = !picking; draw(); } }));
    const pick = picking && h('div', { className: 'tpl' }, ...Object.entries(TEMPLATES).map(([k, t]) => h('button', { onclick: async () => {
      const id = uid(); await store.put('plans', id, { ...t.make(), created: Date.now() }).catch(console.warn);
      picking = false; openId = id; sel = 0; pop(); draw();
    } }, h('i', { textContent: t.emoji }), h('b', { textContent: t.label }), h('small', { textContent: t.hint }))));
    const cards = h('div', { className: 'pcards' }, ...plans.map((p) => {
      const pr = progress(p), ci = current(p), next = ci >= 0 ? p.stages[ci] : null;
      return h('button', { className: 'pcard', style: `--pc:${p.color}`, onclick: () => { openId = p.id; sel = Math.max(0, ci); draw(); } },
        h('i', { className: 'pemoji', textContent: p.emoji }),
        h('div', { className: 'pinfo' }, h('b', { textContent: p.title }),
          h('small', { textContent: next ? `сейчас: ${next.emoji} ${next.title}` : 'всё пройдено 🎉' }),
          p.due ? h('span', { className: 'chip', textContent: `🗓 ${dleft(days(p.due))}` }) : null,
          p.money ? h('span', { className: 'chip', textContent: `🐷 ${saved(p)}${p.money.currency}${p.money.goal ? ' из ' + p.money.goal + p.money.currency : ''}` }) : null),
        ring(pr.pct, p.color));
    }));
    if (!plans.length) cards.append(h('p', { className: 'empty', textContent: 'Пока ни одного плана — нажми «＋ новый план».' }));
    return h('div', {}, top, pick, cards);
  }

  function planView() {
    const p = store.get('plans', openId);
    if (!p) { openId = null; return listView(); }
    p.id = openId;
    const save = (redraw = true) => { clearTimeout(saveT); saveT = setTimeout(() => store.put('plans', openId, p).catch(console.warn), 400); if (redraw) draw(); };
    const pr = progress(p), ci = current(p);
    sel = Math.min(sel, p.stages.length - 1);

    const head = h('div', { className: 'phead', style: `--pc:${p.color}` },
      h('button', { textContent: '‹ все планы', onclick: () => { openId = null; draw(); } }),
      h('button', { className: 'pemoji big', title: 'сменить значок', textContent: p.emoji, onclick: () => { p.emoji = EMOJI[(EMOJI.indexOf(p.emoji) + 1) % EMOJI.length]; save(); } }),
      h('input', { className: 'ptitle', value: p.title, maxLength: 60, onchange: (e) => { p.title = e.target.value.trim() || 'План'; save(false); } }),
      h('label', { className: 'due' }, 'цель к ', h('input', { type: 'date', value: p.due || '', onchange: (e) => { p.due = e.target.value; save(); } })),
      h('button', { className: 'danger', textContent: 'удалить', onclick: async () => { if (!confirm(`Удалить план «${p.title}»?`)) return; await store.del('plans', openId).catch(console.warn); openId = null; draw(); } }));

    const meter = h('div', { className: 'pmeter' },
      h('div', { className: 'track' }, h('div', { className: 'fill', style: `width:${pr.pct * 100}%;background:${p.color}` })),
      h('span', { textContent: `${pr.total ? `сделано ${pr.done} из ${pr.total}` : `этапов ${pr.stagesDone} из ${p.stages.length}`}${p.due ? ' · ' + dleft(days(p.due)) : ''}` }));

    // тропинка с этапами
    const W = 120, H = 150, n = p.stages.length;
    const pts = p.stages.map((_, i) => [70 + i * W, 75 + Math.sin(i * 1.25) * 34]);
    const pathD = pts.map(([x, y], i) => {
      if (!i) return `M${x},${y}`;
      const [px, py] = pts[i - 1];
      return `C${px + W / 2},${py} ${x - W / 2},${y} ${x},${y}`;
    }).join(' ');
    const doneUpTo = ci < 0 ? n - 1 : ci;
    const donePath = pts.slice(0, doneUpTo + 1).map(([x, y], i, a) => (i ? `C${a[i - 1][0] + W / 2},${a[i - 1][1]} ${x - W / 2},${y} ${x},${y}` : `M${x},${y}`)).join(' ');
    const svgW = 70 * 2 + (n - 1) * W + 80;
    const map = h('div', { className: 'pmap' });
    map.innerHTML = `<svg width="${svgW}" height="${H}" viewBox="0 0 ${svgW} ${H}">
      <path d="${pathD}" fill="none" stroke="rgba(59,42,53,.18)" stroke-width="5" stroke-dasharray="2 10" stroke-linecap="round"/>
      <path d="${donePath}" fill="none" stroke="${p.color}" stroke-width="6" stroke-linecap="round"/></svg>`;
    p.stages.forEach((s, i) => {
      const [x, y] = pts[i], st = s.done ? 'done' : i === ci ? 'now' : 'todo';
      const node = h('button', { className: `node ${st}${i === sel ? ' sel' : ''}`, style: `left:${x}px;top:${y}px;--pc:${p.color}`, title: s.title, onclick: () => { sel = i; draw(); } },
        h('i', { textContent: s.emoji }), s.done ? h('em', { textContent: '✓' }) : null,
        h('small', { textContent: s.title }));
      if (i === ci) node.append(h('span', { className: 'here', textContent: 'мы здесь ♥' }));
      map.append(node);
    });
    map.append(h('button', { className: 'node add', style: `left:${70 + n * W - 30}px;top:${75 + Math.sin(n * 1.25) * 34}px`, textContent: '+', title: 'добавить этап', onclick: () => { p.stages.push(stage('⭐', 'Новый этап', [])); sel = p.stages.length - 1; save(); } }));

    return h('div', { className: 'plan' }, head, meter, map, stagePanel(p, save), p.money ? moneyBox(p, save) : h('button', { className: 'addmoney', textContent: '＋ добавить копилку к плану', onclick: () => { p.money = { goal: 0, currency: '€', entries: [] }; save(); } }));
  }

  function stagePanel(p, save) {
    const s = p.stages[sel];
    if (!s) return h('div');
    const setDone = (v) => {
      const was = s.done; s.done = v;
      if (!was && v) {
        chime(); confetti(el.closest('.win') || el);
        store.award('step', `${p.id}:${s.id}`);
        if (p.stages.every((x) => x.done)) store.award('plan', p.id);
      }
    };
    const tasks = h('ul', { className: 'tasks' }, ...s.tasks.map((t) => h('li', { className: t.done ? 'done' : '' },
      h('input', { type: 'checkbox', checked: t.done, onchange: (e) => {
        t.done = e.target.checked;
        if (s.tasks.length && s.tasks.every((x) => x.done)) setDone(true); else if (!t.done) s.done = false;
        save();
      } }),
      h('input', { className: 'ttext', value: t.text, onchange: (e) => { t.text = e.target.value; save(false); } }),
      h('button', { className: 'x', textContent: '✕', title: 'убрать', onclick: () => { s.tasks.splice(s.tasks.indexOf(t), 1); save(); } }))));
    const newTask = h('input', { placeholder: 'новая задача и Enter…', maxLength: 140 });
    const addTask = h('form', { className: 'addtask', onsubmit: (e) => { e.preventDefault(); if (!newTask.value.trim()) return; s.tasks.push({ id: uid(), text: newTask.value.trim(), done: false }); s.done = false; save(); } }, newTask);
    const lt = h('input', { placeholder: 'название' }), lu = h('input', { placeholder: 'https://…' });
    const links = h('div', { className: 'links' },
      ...s.links.map((l) => h('span', { className: 'link' }, h('a', { href: l.url, target: '_blank', rel: 'noopener', textContent: '🔗 ' + (l.title || l.url) }), h('button', { className: 'x', textContent: '✕', onclick: () => { s.links.splice(s.links.indexOf(l), 1); save(); } }))),
      h('form', { className: 'addlink', onsubmit: (e) => { e.preventDefault(); const url = lu.value.trim(); if (!/^https?:\/\//.test(url)) return lu.focus(); s.links.push({ title: lt.value.trim(), url }); save(); } }, lt, lu, h('button', { textContent: '＋' })));
    const move = (d) => { const j = sel + d; if (j < 0 || j >= p.stages.length) return; [p.stages[sel], p.stages[j]] = [p.stages[j], p.stages[sel]]; sel = j; save(); };
    return h('div', { className: 'stage', style: `--pc:${p.color}` },
      h('div', { className: 'shead' },
        h('button', { className: 'semoji', textContent: s.emoji, title: 'сменить значок', onclick: () => { s.emoji = EMOJI[(EMOJI.indexOf(s.emoji) + 1) % EMOJI.length]; save(); } }),
        h('input', { className: 'stitle', value: s.title, maxLength: 60, onchange: (e) => { s.title = e.target.value.trim() || 'Этап'; save(); } }),
        h('label', {}, 'срок ', h('input', { type: 'date', value: s.due || '', onchange: (e) => { s.due = e.target.value; save(); } })),
        h('label', {}, 'кто ', h('select', { onchange: (e) => { s.who = e.target.value; save(false); } }, ...people().map((w) => h('option', { value: w, textContent: w, selected: s.who === w })))),
      ),
      s.due ? h('div', { className: 'sdue', textContent: `🗓 ${fmtDate(s.due)} — ${dleft(days(s.due))}` }) : null,
      h('div', { className: 'scols' },
        h('div', {}, h('h4', { textContent: 'Задачи' }), tasks, addTask),
        h('div', {}, h('h4', { textContent: 'Заметки' }), h('textarea', { value: s.notes || '', placeholder: 'мысли, адреса, логины, что не забыть…', rows: 5, oninput: (e) => { s.notes = e.target.value; save(false); } }),
          h('h4', { textContent: 'Ссылки' }), links)),
      h('div', { className: 'sfoot' },
        h('button', { textContent: '←', title: 'сдвинуть раньше', onclick: () => move(-1) }),
        h('button', { textContent: '→', title: 'сдвинуть позже', onclick: () => move(1) }),
        h('span', { className: 'grow' }),
        h('button', { className: 'danger', textContent: 'убрать этап', onclick: () => { if (p.stages.length < 2 || !confirm(`Убрать этап «${s.title}»?`)) return; p.stages.splice(sel, 1); sel = Math.max(0, sel - 1); save(); } }),
        h('button', { className: s.done ? '' : 'primary', textContent: s.done ? '↺ вернуть в работу' : '✓ этап пройден', onclick: () => { setDone(!s.done); save(); } })));
  }

  function moneyBox(p, save) {
    const m = p.money, total = saved(p), pct = m.goal ? Math.min(1, total / m.goal) : 0;
    const amt = h('input', { type: 'number', placeholder: 'сумма', step: 'any' }), note = h('input', { placeholder: 'за что / откуда' });
    const whoSel = h('select', {}, ...people().map((w) => h('option', { value: w, textContent: w })));
    const jar = h('div', { className: 'jar', title: `${Math.round(pct * 100)}%` }, h('div', { className: 'coins', style: `height:${pct * 100}%;background:${p.color}` }), h('b', { textContent: `${total}${m.currency}` }));
    return h('div', { className: 'money' }, jar,
      h('div', { className: 'mright' },
        h('h4', { textContent: '🐷 Копилка' }),
        h('div', { className: 'mgoal' }, 'цель ', h('input', { type: 'number', value: m.goal || '', placeholder: '0', onchange: (e) => { m.goal = Number(e.target.value) || 0; save(); } }),
          h('select', { onchange: (e) => { m.currency = e.target.value; save(); } }, ...['€', '$', ' лей', ' ₽'].map((c) => h('option', { value: c, textContent: c.trim(), selected: m.currency === c }))),
          m.goal ? h('span', { textContent: total >= m.goal ? ' — накопили! 🎉' : ` — осталось ${m.goal - total}${m.currency}` }) : null),
        h('form', { className: 'addtask', onsubmit: (e) => {
          e.preventDefault(); const a = Number(amt.value); if (!a) return amt.focus();
          const before = total; m.entries.push({ id: uid(), amount: a, who: whoSel.value, note: note.value.trim(), date: new Date().toISOString() });
          if (m.goal && before < m.goal && before + a >= m.goal) { chime(); confetti(el.closest(".win") || el); }
          save();
        } }, amt, whoSel, note, h('button', { textContent: '＋' })),
        h('ul', { className: 'entries' }, ...[...m.entries].reverse().slice(0, 8).map((e) => h('li', {},
          h('b', { textContent: `${e.amount > 0 ? '+' : ''}${e.amount}${m.currency}` }), ` ${e.who}${e.note ? ' · ' + e.note : ''} · ${new Date(e.date).toLocaleDateString('ru-RU')}`,
          h('button', { className: 'x', textContent: '✕', onclick: () => { m.entries.splice(m.entries.indexOf(e), 1); save(); } }))))));
  }

  draw();
}
