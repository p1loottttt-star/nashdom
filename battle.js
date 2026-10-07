// Морской бой 8×8: оба расставляют флот (случайно, можно перемешать), потом стреляют по очереди; попал — стреляешь ещё.
// state: { fleets: { [id]: корабли | null }, shots: { [id]: клетки, по которым стрелял id } }; result: { winner }
import * as store from './store.js';
import { N, randomFleet, shoot } from './gamelogic.js';
import { h } from './games.js';

const nameOf = (id) => (id === store.me()?.id ? store.me().name : store.partner()?.name || 'партнёр');
const setup = (m) => m.players.some((id) => !m.state.fleets[id]);

// поле: fleet — показать корабли (своё поле), shots — выстрелы по этому полю, onShot — клик (поле противника)
function board(fleet, shots, { show, onShot }) {
  const hit = new Set(shots), ships = new Set(fleet.flat());
  const sunk = new Set(fleet.filter((s) => s.every((c) => hit.has(c))).flat());
  return h('div', { className: 'bt-grid' }, ...Array.from({ length: N * N }, (_, i) => {
    const shot = hit.has(i), ship = ships.has(i);
    const cls = 'bt-cell' + (show && ship ? ' ship' : '') + (shot && ship ? ' hit' : '') + (shot && !ship ? ' miss' : '') + (sunk.has(i) ? ' sunk' : '');
    return h('button', { className: cls, textContent: shot ? (ship ? '🔥' : '·') : '', disabled: !onShot || shot, onclick: () => onShot?.(i) });
  }));
}

export default {
  kind: 'battle', title: 'Морской бой', emoji: '⚓',
  rules: 'Поле 8×8, флот расставляется сам. Попал — стреляешь ещё',
  start: (me, partner) => ({ turn: null, state: { fleets: { [me]: null, [partner]: null }, shots: { [me]: [], [partner]: [] } } }),
  myTurn: (m, me) => (setup(m) ? !m.state.fleets[me] : m.turn === me),
  status: (m, me) => (m.done ? `победа: ${nameOf(m.result?.winner)}` : setup(m) ? 'расстановка' : `потоплено ${m.state.fleets[m.players.find((p) => p !== me)].filter((s) => s.every((c) => m.state.shots[me].includes(c))).length} из 7`),

  render(el, ctx) {
    const { m, me, partner, pname } = ctx, st = m.state;
    if (setup(m)) {
      if (st.fleets[me]) { el.append(h('p', { className: 'gm-big', textContent: `Флот готов. ${pname} ещё расставляет свой…` }), board(st.fleets[me], [], { show: true })); return; }
      let fleet = randomFleet();
      const wrap = h('div', {}, board(fleet, [], { show: true }));
      el.append(h('p', { className: 'gm-big', textContent: 'Расставь флот' }), h('p', { className: 'gm-sub', textContent: '4 + 3 + 3 + 2 + 2 + 1 + 1 палуба, корабли не касаются друг друга' }), wrap,
        h('div', { className: 'dr-tools' },
          h('button', { textContent: '🎲 перемешать', onclick: () => { fleet = randomFleet(); wrap.replaceChildren(board(fleet, [], { show: true })); } }),
          h('button', { className: 'gm-go', textContent: 'в бой!', onclick: () => {
            const fleets = { ...store.get('game', m.id).state.fleets, [me]: fleet }; // партнёр мог расставиться, пока я выбирал
            const ready = m.players.every((id) => fleets[id]);
            ctx.save({ state: { ...st, fleets }, turn: ready ? m.players[0] : null });
          } })));
      return;
    }
    const enemy = st.fleets[partner], mine = st.shots[me];
    const fire = (cell) => {
      const r = shoot(enemy, mine, cell), shots = { ...st.shots, [me]: [...mine, cell] };
      if (r.won) ctx.save({ state: { ...st, shots }, done: true, turn: null, result: { winner: me } });
      else ctx.save({ state: { ...st, shots }, turn: r.hit ? me : partner });
    };
    const line = m.done ? (m.result.winner === me ? 'Победа! Весь флот на дне 🎉' : `${pname} потопил(а) твой флот`) : ctx.mine ? 'Твой выстрел — жми по полю справа' : `${pname} целится…`;
    el.append(h('p', { className: 'gm-big', textContent: line }),
      h('div', { className: 'bt-boards' },
        h('div', {}, h('p', { className: 'gm-sub', textContent: 'твой флот' }), board(st.fleets[me], st.shots[partner], { show: true })),
        h('div', {}, h('p', { className: 'gm-sub', textContent: `флот: ${pname}` }), board(enemy, mine, { show: m.done, onShot: ctx.mine && !m.done ? fire : null }))),
      m.done ? h('button', { className: 'gm-go', textContent: 'ещё партию', onclick: () => ctx.again() }) : '');
  },
};
