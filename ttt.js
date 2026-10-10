// Крестики-нолики сердечками: ❤️ у создателя партии, 🐾 у второго. state: { board: 9 × ('x' | 'o' | null) }; result: { winner: id | null }
import * as store from './store.js';
import { tttWinner, tttLine } from './gamelogic.js';
import { h } from './games.js';

const ICON = { x: '❤️', o: '🐾' };
const markOf = (m, id) => (m.players[0] === id ? 'x' : 'o');
const nameOf = (id) => (id === store.me()?.id ? store.me().name : store.partner()?.name || 'партнёр');
// счёт серии: победы каждого во всех законченных партиях
function series(me, partner) {
  const done = store.all('game').filter((g) => g.kind === 'ttt' && g.done);
  const w = (id) => done.filter((g) => g.result?.winner === id).length;
  return `Счёт: ${nameOf(me)} ${w(me)} — ${w(partner)} ${nameOf(partner)}${done.some((g) => !g.result?.winner) ? ` · ничьих ${done.filter((g) => !g.result?.winner).length}` : ''}`;
}

export default {
  kind: 'ttt', title: 'Крестики-нолики', emoji: '❤️',
  rules: 'Сердечки против лапок, три в ряд. Счёт серий копится',
  start: (me) => ({ turn: me, state: { board: Array(9).fill(null) } }),
  status: (m, me) => (m.done ? (m.result?.winner ? `победа: ${nameOf(m.result.winner)}` : 'ничья') : `ты — ${ICON[markOf(m, me)]}`),

  render(el, ctx) {
    const { m, me, partner, pname } = ctx, b = m.state.board, win = tttLine(b), mark = markOf(m, me);
    const grid = h('div', { className: 'tt-grid' }, ...b.map((v, i) => h('button', {
      className: 'tt-cell' + (win?.includes(i) ? ' tt-win' : ''), textContent: v ? ICON[v] : '', disabled: !!v || !ctx.mine,
      onclick: () => {
        const board = b.slice(); board[i] = mark;
        const w = tttWinner(board);
        if (w) ctx.save({ state: { board }, done: true, turn: null, result: { winner: w === 'draw' ? null : me } });
        else ctx.save({ state: { board }, turn: partner });
      },
    })));
    const line = m.done ? (m.result?.winner ? (m.result.winner === me ? 'Ты победил(а)! 🎉' : `${pname} победил(а)`) : 'Ничья — вы слишком хорошо друг друга знаете')
      : ctx.mine ? `Твой ход — ставь ${ICON[mark]}` : `${pname} думает…`;
    el.append(h('p', { className: 'gm-big', textContent: line }), grid, h('p', { className: 'gm-sub', textContent: series(me, partner) }),
      m.done ? h('button', { className: 'gm-go', textContent: `ещё партию (первым ходит ${pname})`, onclick: () => ctx.again(partner) }) : '');
  },
};
