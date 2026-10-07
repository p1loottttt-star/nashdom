// «Игры» в ноутбуке: партии по ходам. Партия = game/<id> = { kind, players: [создатель, партнёр], turn, state, score, done, result, at }.
// Игра — модуль { kind, title, emoji, rules, start(me, partner) → { turn, state }, status(m, me), myTurn?(m, me), render(el, ctx) };
// ctx = { m, me, partner, pname, mine, save(patch), again() }. Правила — gamelogic.js, данные — gamedata.js.
import * as store from './store.js';
import { toast } from './desktop.js';
import { pop, chime } from './sound.js';
import wave from './wave.js';
import draw from './draw.js';
import ttt from './ttt.js';
import battle from './battle.js';

export const GAMES = [wave, draw, ttt, battle];
const byKind = (k) => GAMES.find((g) => g.kind === k);
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return e; };
export { h };
const meId = () => store.me()?.id;
const pName = () => store.partner()?.name || 'партнёр';
const isMine = (m, me = meId()) => !m.done && (byKind(m.kind)?.myTurn ? byKind(m.kind).myTurn(m, me) : m.turn === me);
const matches = () => store.all('game').filter((m) => byKind(m.kind) && m.players?.includes(meId())).sort((a, b) => b.at - a.at);

export function renderGames(el) {
  let open = null; // id открытой партии
  // перерисовка — только по открытой партии: иначе ход в другой партии сотрёт недорисованное
  const off = store.on('game', (id) => { if (!el.isConnected) return off(); if (!open || id === open) draw(); });

  function draw() {
    const m = open && store.get('game', open);
    el.replaceChildren(h('div', { className: 'gm' }, m ? matchView({ id: open, ...m }) : listView()));
  }

  function newMatch(g, firstTurn) { // firstTurn — кто ходит первым (по умолчанию создатель)
    const p = store.partner();
    if (!p) return toast('Игры откроются, когда в дом войдёт вторая половинка');
    const id = store.uid(), first = g.start(meId(), p.id);
    store.put('game', id, { kind: g.kind, players: [meId(), p.id], score: 0, done: false, at: Date.now(), ...first, ...(firstTurn ? { turn: firstTurn } : {}) }).catch(console.warn);
    badge();
    pop(); open = id; draw();
  }

  function listView() {
    const all = matches(), mine = all.filter((m) => isMine(m)), wait = all.filter((m) => !m.done && !isMine(m)), done = all.filter((m) => m.done).slice(0, 8);
    const row = (m, btn) => { const g = byKind(m.kind); return h('div', { className: 'gm-row' }, h('i', { textContent: g.emoji }), h('b', { textContent: g.title }), h('span', { textContent: g.status(m, meId()) }), h('button', { className: btn === 'играть' ? 'gm-go' : '', textContent: btn, onclick: () => { open = m.id; draw(); } })); };
    return [
      h('div', { className: 'gm-new' }, ...GAMES.map((g) => h('button', { className: 'gm-card', onclick: () => newMatch(g) }, h('i', { textContent: g.emoji }), h('b', { textContent: g.title }), h('small', { textContent: g.rules }), h('span', { className: 'gm-go', textContent: 'новая партия' })))),
      mine.length ? [h('h4', { className: 'gm-h', textContent: 'Твой ход' }), ...mine.map((m) => row(m, 'играть'))] : null,
      wait.length ? [h('h4', { className: 'gm-h', textContent: `Ждём, пока походит ${pName()}` }), ...wait.map((m) => row(m, 'смотреть'))] : null,
      done.length ? [h('h4', { className: 'gm-h', textContent: 'Сыграно' }), ...done.map((m) => row(m, 'итоги'))] : null,
    ];
  }

  function matchView(m) {
    const g = byKind(m.kind), me = meId(), p = store.partner();
    const box = h('div', { className: 'gm-board' });
    const ctx = {
      m, me, partner: p?.id, pname: pName(), mine: isMine(m, me),
      // ход: patch сливается в партию; done впервые — баллы паре
      save(patch) {
        const next = { ...store.get('game', m.id), ...patch, at: Date.now() };
        store.put('game', m.id, next).catch(console.warn);
        badge(); // своя запись событие в эту же вкладку не шлёт
        if (patch.done && !m.done) { store.award('game', m.id); chime(); } else pop();
        draw();
      },
      again: (first) => newMatch(g, first),
    };
    g.render(box, ctx);
    return [h('div', { className: 'gm-head' }, h('button', { className: 'gm-back', textContent: '← к играм', onclick: () => { open = null; draw(); } }), h('b', { textContent: `${g.emoji} ${g.title}` }), h('span', { textContent: g.status(m, me) })), box];
  }

  draw();
}

// счётчик «твой ход» на иконке «Игры» и подсказка при входе (как у «Тестов»)
let greeted = false;
export function badge() {
  const n = meId() ? matches().filter((m) => isMine(m)).length : 0;
  document.querySelectorAll('[data-app=games]').forEach((b) => (n ? b.setAttribute('data-n', n) : b.removeAttribute('data-n')));
  if (n && !greeted) { greeted = true; toast(`В «Играх» твой ход 🎲 — ${pName()} ждёт`, 6000); }
}
const born = Date.now();
store.on('game', (id) => {
  badge();
  const m = store.get('game', id);
  if (m && m.at > born && isMine({ id, ...m }) && !document.querySelector('.gm')) toast(`«${byKind(m.kind)?.title}»: твой ход 🎲`, 5000);
});
store.onPeople(badge);
