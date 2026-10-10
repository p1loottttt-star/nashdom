// правила мини-игр (gamelogic.js)
import assert from 'node:assert/strict';
import { waveScore, waveVerdict, tttWinner, FLEET, N, randomFleet, validFleet, shoot, normWord, sameWord, hintMask } from '../gamelogic.js';

// «Одна волна»: очки по расстоянию до цели
assert.deepEqual([0, 4, 5, 11, 12, 18, 19, 60].map((d) => waveScore(50, 50 + d)), [4, 4, 3, 3, 2, 2, 0, 0]);
assert.equal(waveScore(10, 6), 4); // в обе стороны
assert.ok(waveVerdict(20).length && waveVerdict(0).length && waveVerdict(20) !== waveVerdict(0));

// крестики-нолики
const b = (s) => [...s].map((c) => (c === '.' ? null : c));
assert.equal(tttWinner(b('xxx......')), 'x');
assert.equal(tttWinner(b('o...o...o')), 'o');
assert.equal(tttWinner(b('..x.x.x..')), 'x');
assert.equal(tttWinner(b('xoxxoooxx')), 'draw');
assert.equal(tttWinner(b('xo.......')), null);

// морской бой: случайный флот всегда правильный (размеры, в поле, без касаний)
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 300; i++) assert.ok(validFleet(randomFleet(rnd)), 'флот ' + i);
assert.deepEqual(randomFleet(rnd).map((s) => s.length).sort(), [...FLEET].sort());
assert.ok(!validFleet([[0, 1, 2, 3], [N + 4]].concat(FLEET.slice(1).map(() => []))), 'касание по диагонали / пустые корабли — неправильно');
assert.ok(!validFleet([[0, 1, 2, 3], [5, 6, 7], [8 * 2, 8 * 2 + 1, 8 * 2 + 2], [N * 4, N * 4 + 1], [N * 6, N * 6 + 1], [N * 7 + 7], [7, 15]]), 'корабль не прямой/касается');
const fleet = [[0, 1, 2, 3], [16, 17, 18], [32, 33, 34], [48, 49], [6, 14], [63], [61]];
assert.ok(validFleet(fleet));
let shots = [];
const fire = (c) => { const r = shoot(fleet, shots, c); shots = [...shots, c]; return r; };
assert.deepEqual(fire(40), { hit: false, sunk: null, won: false });
assert.deepEqual(fire(63), { hit: true, sunk: 5, won: false });
assert.deepEqual(fire(0), { hit: true, sunk: null, won: false });
for (const c of [...fleet.flat()].filter((c) => !shots.includes(c)).slice(0, -1)) fire(c);
assert.equal(fire(fleet.flat().find((c) => !shots.includes(c))).won, true);

// «Рисуй — угадывай»: сравнение слов и подсказка
assert.equal(normWord('  Ёжик '), 'ежик');
assert.ok(sameWord('ёлка', 'Елка') && sameWord('кот', ' КОТ ') && !sameWord('кот', 'кит'));
assert.equal(hintMask('арбуз', 0), '_ _ _ _ _');
assert.equal(hintMask('арбуз', 2), 'а р _ _ _');
assert.equal(hintMask('лава лампа', 1), 'л _ _ _   _ _ _ _ _');
// данные: без повторов, шкал и слов хватает на много партий
import { SPECTRA, WORDS } from '../gamedata.js';
assert.equal(new Set(WORDS).size, WORDS.length, 'повтор слова');
assert.ok(SPECTRA.length >= 30 && WORDS.length >= 120 && SPECTRA.every((s) => s.length === 2));
console.log('games: ok');

// «Рисуй — угадывай»: близкие слова, очки, выбор слов, ужатие пауз
import { closeWord, drawPoints, drawChoices, squeeze, DRAW_T } from '../gamelogic.js';
import { EASY, MID, HARD } from '../gamedata.js';
assert.ok(closeWord('кошкa', 'кошка') && closeWord('жирав', 'жираф') && closeWord('черепаа', 'черепаха'));
assert.ok(!closeWord('кошка', 'кошка') && !closeWord('кот', 'дом лес') && !closeWord('сыр', 'нос'));
assert.ok(closeWord('ёлка', 'елкаа'));
assert.equal(drawPoints({ ok: false, stars: 3 }), 0);
assert.equal(drawPoints({ ok: true, stars: 1 }), 3);
assert.equal(drawPoints({ ok: true, stars: 3, live: true, left: DRAW_T }), 9);
assert.equal(drawPoints({ ok: true, stars: 1, live: true, left: 0, hints: 3 }), 1);
const ch = drawChoices([EASY, MID, HARD], [], () => 0.3);
assert.deepEqual(ch.map((c) => c.s), [1, 2, 3]); assert.ok(EASY.includes(ch[0].w) && HARD.includes(ch[2].w));
assert.equal(drawChoices([EASY, MID, HARD], ['наш диван'], () => 0.2)[1].w, 'наш диван');
assert.equal(drawChoices([EASY, MID, HARD], ['наш диван'], () => 0.7)[1].ours, undefined);
const sq = squeeze([{ c: 'x', w: 1, p: [[0, 0, 0], [0, 0, 100]] }, { c: 'x', w: 1, p: [[0, 0, 5100], [0, 0, 5200]] }], 350);
assert.deepEqual(sq[1].p.map((q) => q[2]), [450, 550]);
console.log('draw: ok');

// «Котобой»: формы, расстановка без касаний, выстрелы, карточки
import { CN, CATS, shapeOf, placeCat, validCats, randomCats, catShoot, bell, laser, fish } from '../gamelogic.js';
assert.deepEqual(shapeOf('kitten', 1), [[0, 0], [1, 0]]);
assert.equal(new Set(shapeOf('fat', 3, true).map(String)).size, 5);
assert.equal(placeCat('stretch', 0, 6), null); // не влезает
assert.deepEqual(placeCat('stretch', 0, 5).cells, [5, 6, 7, 8, 9]);
seed = 7;
for (let i = 0; i < 200; i++) assert.ok(validCats(randomCats(rnd)), 'коты ' + i);
const cs = randomCats(rnd);
assert.ok(!validCats([cs[0], cs[0], ...cs.slice(2)]));
const kit = cs.find((c) => c.k === 'kitten');
assert.deepEqual(catShoot(cs, [], kit.cells[0]), { hit: true, caught: null, won: false });
assert.equal(catShoot(cs, [kit.cells[0]], kit.cells[1]).caught, 0);
const all = cs.flatMap((c) => c.cells);
assert.ok(catShoot(cs, all.slice(1), all[0]).won);
const empty = [...Array(CN * CN).keys()].find((i) => !all.includes(i));
assert.equal(catShoot(cs, [], empty).hit, false);
assert.equal(bell([{ k: 'ball', cells: [0, 1, 10, 11] }], 0), 4);
assert.equal(bell([{ k: 'ball', cells: [0, 1, 10, 11] }], 33), 0);
assert.deepEqual(laser(8, false), [8, 9]); assert.deepEqual(laser(85, true), [85, 95]);
assert.ok(cs.flatMap((c) => c.cells).includes(fish(cs, [], rnd)));
assert.equal(fish(cs, all), null);
assert.equal(CATS.reduce((n, c) => n + c.cells.length, 0), 25);
console.log('cats: ok');
