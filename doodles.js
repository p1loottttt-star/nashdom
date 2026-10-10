// Нарисованные иконки вместо эмодзи: одна сетка 48×48, контуры «от руки» (rough.js, seed закреплён — рисунок не дрожит).
// Три способа напечатать один и тот же рисунок: sticker — наклейка с белой высечкой, pencil — штриховка цветным карандашом,
// riso — плашки без контура + контур другой краской со сдвигом (ризограф). doodle(name, { style, accent }) → строка <svg>.
import { RoughGenerator } from 'roughjs/bin/generator.js';

const gen = new RoughGenerator();
const INK = '#3b2a35', PAPER = '#fffaf0';

// скруглённый прямоугольник и сердце — путями (у rough нет своих)
const rr = (x, y, w, h, r) => `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
const heart = (cx, cy, s) => { const k = (a, b) => `${cx + a * s} ${cy + b * s}`; return `M${k(0, .35)} C${k(-.55, 0)} ${k(-.5, -.42)} ${k(-.22, -.42)} C${k(-.08, -.42)} ${k(0, -.3)} ${k(0, -.22)} C${k(0, -.3)} ${k(.08, -.42)} ${k(.22, -.42)} C${k(.5, -.42)} ${k(.55, 0)} ${k(0, .35)} Z`; };
const pips = (pts, d, f) => pts.map(([x, y]) => ['circle', x, y, d, f, { line: false }]);

// фигура: [вид, ...числа, заливка, { stroke, w, line }]; заливка: 'a' акцент, 'b' светлый акцент, 'p' бумага, 'i' чернила, '#hex', null
// группа: ['g', угол, cx, cy, [фигуры]]
const ICONS = {
  tube: [['path', rr(5, 12, 38, 26, 4), 'a'], ['path', rr(10, 15, 28, 10, 2), 'p'], ['path', heart(24, 20.5, 7), 'a', { line: false }],
    ['circle', 17, 29, 7, 'p'], ['circle', 31, 29, 7, 'p'], ['line', 17, 29, 31, 29], ['path', 'M13 38 L16 34 L32 34 L35 38', null]],
  gallery: [['g', -8, 24, 24, [['path', rr(10, 7, 28, 34, 1.5), 'p'], ['rectangle', 13, 10, 22, 21, 'b'], ['circle', 29, 15, 5, '#f2c260'],
    ['polygon', [[13, 31], [20, 21], [25, 27], [28, 24], [35, 31]], 'a']]], ['g', 6, 24, 6, [['rectangle', 17, 3, 14, 6, '#f6dc8f', { line: false }]]]],
  plans: [['polygon', [[5, 12], [17, 8], [31, 12], [43, 8], [43, 38], [31, 42], [17, 38], [5, 42]], 'b'], ['line', 17, 8, 17, 38], ['line', 31, 12, 31, 42],
    ['path', 'M10 35 C14 25 21 31 25 23 S33 16 35 19', null, { stroke: 'a', w: 2.4 }], ['line', 34, 12, 40, 18, { stroke: 'a', w: 2.6 }], ['line', 40, 12, 34, 18, { stroke: 'a', w: 2.6 }]],
  thoughts: [['rectangle', 6, 13, 36, 24, 'p'], ['path', 'M6 13 L24 27 L42 13', null], ['path', 'M6 37 L19 24', null], ['path', 'M42 37 L29 24', null], ['path', heart(24, 27, 10), 'a']],
  counter: [['rectangle', 8, 11, 32, 30, 'p'], ['rectangle', 8, 11, 32, 8, 'a'], ['line', 16, 7, 16, 14], ['line', 32, 7, 32, 14], ['path', heart(24, 31, 13), 'a']],
  quiz: [['g', 12, 24, 24, [['path', rr(13, 8, 24, 32, 3), 'b']]], ['g', -6, 24, 24, [['path', rr(10, 9, 24, 32, 3), 'p'],
    ['path', 'M17 20 C17 13.5 28 13.5 28 19 C28 23.5 22.5 23 22.5 28.5', null, { stroke: 'a', w: 3 }], ['circle', 22.5, 34, 3.4, 'a', { line: false }]]]],
  games: [['g', -12, 16, 26, [['path', rr(6, 16, 20, 20, 3), 'a'], ...pips([[11, 21], [16, 26], [21, 31]], 3.6, 'p')]],
    ['g', 10, 32, 21, [['path', rr(23, 12, 19, 19, 3), 'p'], ...pips([[28, 17], [37, 17], [28, 26], [37, 26]], 3.2, 'i')]]],
  shop: [['polygon', [[8, 26], [22, 11], [40, 9], [39, 27], [24, 41]], 'a'], ['circle', 33, 16, 5, 'p'], ['path', 'M33 16 C38 6 46 9 44 3', null]],
  profile: [['path', rr(11, 6, 26, 36, 2.5), 'a'], ['circle', 24, 20, 11, null, { stroke: 'p', w: 2 }], ['line', 24, 15, 24, 25, { stroke: 'p', w: 1.6 }],
    ['line', 16, 32, 32, 32, { stroke: 'p', w: 2 }], ['line', 18, 36.5, 30, 36.5, { stroke: 'p', w: 2 }]],
  power: [['path', 'M27 7 A17 17 0 1 0 42 32 A13 13 0 0 1 27 7 Z', 'a'], ['line', 11, 9, 11, 15, { w: 1.6 }], ['line', 8, 12, 14, 12, { w: 1.6 }], ['line', 39, 39, 39, 44, { w: 1.6 }], ['line', 36.5, 41.5, 41.5, 41.5, { w: 1.6 }]],

  wave: [['path', 'M6 36 A18 18 0 0 1 42 36 Z', 'p'], ['path', 'M24 36 L30.2 19.1 A18 18 0 0 1 37.6 24.2 Z', 'a'], ['line', 24, 36, 14, 21, { w: 2.6 }], ['circle', 24, 36, 4.5, 'i', { line: false }]],
  draw: [['path', 'M5 43 C9 36 13 45 17 38 S24 40 26 37', null, { stroke: 'a', w: 2.4 }],
    ['g', 45, 24, 24, [['rectangle', 20, 8, 8, 25, 'a'], ['polygon', [[20, 33], [28, 33], [24, 41]], 'p'], ['polygon', [[22.6, 38.2], [25.4, 38.2], [24, 41]], 'i', { line: false }], ['rectangle', 20, 4, 8, 4, '#f4a3b5']]]],
  ttt: [['path', 'M18 7 L17 41', null], ['path', 'M30 7 L31 41', null], ['path', 'M7 18 L41 19', null], ['path', 'M7 30 L41 29', null],
    ['path', heart(12, 12.5, 9), 'a', { line: false }], ['path', heart(24, 24.5, 9), 'a', { line: false }], ['path', heart(36, 36.5, 9), 'a', { line: false }],
    ['line', 6, 7, 42, 42, { stroke: 'a', w: 2 }]],
  cats: [['polygon', [[10, 21], [12, 6], [22, 14]], 'a'], ['polygon', [[38, 21], [36, 6], [26, 14]], 'a'], ['ellipse', 24, 27, 32, 25, 'a'],
    ['circle', 18, 25, 3.6, 'i', { line: false }], ['circle', 30, 25, 3.6, 'i', { line: false }], ['polygon', [[22.4, 29.5], [25.6, 29.5], [24, 31.5]], '#f4a3b5', { line: false }],
    ['line', 3, 28, 12, 29.5, { w: 1.4 }], ['line', 3, 33, 12, 32, { w: 1.4 }], ['line', 45, 28, 36, 29.5, { w: 1.4 }], ['line', 45, 33, 36, 32, { w: 1.4 }]],

  chaos: [['ellipse', 24, 10, 32, 8, 'b'], ['ellipse', 25, 17, 25, 6.5, 'a'], ['ellipse', 24, 23.5, 18, 5.5, 'b'], ['ellipse', 26, 29.5, 12, 4.5, 'a'], ['ellipse', 27, 35, 7, 3.5, 'b'],
    ['path', 'M29 39 C29 42 26 42 27 45', null], ['rectangle', 4, 30, 6, 5, 'p'], ['circle', 42, 25, 4, '#f2c260']],
  bowl: [['path', 'M14 18 C11 14 16 12 13 7', null, { w: 1.6 }], ['path', 'M21 17 C18 13 23 11 20 6', null, { w: 1.6 }],
    ['line', 25, 23, 40, 5, { w: 2.4 }], ['line', 29, 24, 45, 9, { w: 2.4 }],
    ['path', 'M6 24 L42 24 C42 34 34 41 24 41 C14 41 6 34 6 24 Z', 'a'], ['ellipse', 24, 24, 36, 6, 'p']],
  cake: [['path', 'M8 23 L40 20 L40 37 L8 39 Z', 'b'], ['line', 8, 30, 40, 28.5, { stroke: 'a', w: 3 }], ['polygon', [[8, 23], [33, 13], [40, 20]], 'p'],
    ['circle', 31, 11, 7, '#e0614f'], ['path', 'M31 8 C31 4 34 3 36 2', null, { w: 1.6 }]],
  cloud: [['line', 16, 34, 13, 41, { stroke: 'a', w: 2.2 }], ['line', 24, 34, 21, 41, { stroke: 'a', w: 2.2 }], ['line', 32, 34, 29, 41, { stroke: 'a', w: 2.2 }],
    ['path', 'M12 31 C5 31 5 21 13 21 C13 12 25 10 28 18 C31 12 41 14 39 23 C45 23 45 31 38 31 Z', 'p']],
  love: [['g', -6, 24, 24, [['rectangle', 6, 13, 36, 24, 'b'], ['path', 'M6 13 L24 27 L42 13', null]]], ['path', heart(30, 13, 16), 'a']],
  flame: [['path', 'M24 43 C13 43 9 34 13 26 C15 30 19 31 19 31 C16 22 22 13 27 7 C28 16 37 20 38 30 C39 38 32 43 24 43 Z', '#f08b46'],
    ['path', 'M24 40 C20 40 18 36 20 32 C22 34 24 33 24 33 C24 29 26 27 28 25 C29 30 31 32 30 36 C29 39 27 40 24 40 Z', '#f6c64f', { line: false }]],
  heart: [['path', heart(24, 26, 38), 'a']],
  house: [['rectangle', 31, 9, 6, 10, 'p'], ['rectangle', 10, 23, 28, 19, 'p'], ['polygon', [[5, 25], [24, 8], [43, 25]], 'a'], ['rectangle', 21, 31, 7, 11, 'b'],
    ['rectangle', 13, 28, 5, 5, 'b'], ['path', heart(33, 30, 7), 'a', { line: false }]],
  pizza: [['polygon', [[24, 43], [8, 10], [40, 10]], '#f6c64f'], ['path', 'M6 11 C15 3 33 3 42 11 L40 15 C31 9 17 9 8 15 Z', '#d9934a'],
    ['circle', 20, 19, 6.5, 'a'], ['circle', 29, 22, 5.5, 'a'], ['circle', 23, 31, 5, 'a']],
  suitcase: [['path', 'M18 16 V10 Q18 7 21 7 H27 Q30 7 30 10 V16', null], ['path', rr(6, 15, 36, 26, 4), 'a'],
    ['line', 15, 16, 15, 40, { stroke: 'p', w: 3 }], ['line', 33, 16, 33, 40, { stroke: 'p', w: 3 }], ['circle', 24, 28, 8, '#f6c64f']],
  film: [['rectangle', 7, 20, 34, 21, 'p'], ['g', -12, 7, 19, [['rectangle', 7, 11, 34, 7, 'a'], ['line', 15, 11, 12, 18, { stroke: 'p', w: 2.4 }], ['line', 24, 11, 21, 18, { stroke: 'p', w: 2.4 }], ['line', 33, 11, 30, 18, { stroke: 'p', w: 2.4 }]]],
    ['polygon', [[20, 25], [31, 30.5], [20, 36]], 'a']],
  candle: [['ellipse', 24, 42, 28, 6, 'a'], ['rectangle', 18, 19, 12, 22, 'p'], ['path', 'M30 24 C27 24 28 29 26 29', null, { w: 1.6 }], ['line', 24, 19, 24, 15, { w: 1.6 }],
    ['path', 'M24 3 C29 9 30 13 24 16 C18 13 19 9 24 3 Z', '#f6c64f']],
  bed: [['rectangle', 5, 13, 7, 29, 'a'], ['rectangle', 5, 29, 38, 9, 'p'], ['ellipse', 18, 26, 12, 7, 'p'], ['polygon', [[24, 23], [43, 23], [43, 32], [24, 32]], 'a'],
    ['line', 8, 38, 8, 44], ['line', 40, 38, 40, 44]],
  bear: [['circle', 13, 13, 11, 'a'], ['circle', 35, 13, 11, 'a'], ['circle', 24, 27, 30, 'a'], ['ellipse', 24, 32, 13, 10, 'p'],
    ['circle', 18.5, 24, 3.4, 'i', { line: false }], ['circle', 29.5, 24, 3.4, 'i', { line: false }], ['ellipse', 24, 30, 5, 3.5, 'i', { line: false }]],
  hearts: [['path', heart(30, 30, 20), 'b'], ['path', heart(19, 21, 24), 'a']],
  roller: [['path', 'M38 13 H43 V24 H24 V30', null, { w: 2.4 }], ['path', rr(5, 7, 33, 12, 3), 'a'], ['rectangle', 21, 30, 6, 13, 'i'],
    ['line', 10, 22, 9, 30, { stroke: 'a', w: 2.6 }], ['line', 16, 21, 16, 26, { stroke: 'a', w: 2.6 }]],
  tea: [['line', 26, 20, 30, 11, { w: 1.4 }], ['rectangle', 28, 6, 6, 6, 'a'], ['path', 'M34 23 C42 23 42 33 34 33', null], ['path', 'M10 20 H34 V30 C34 38 28 42 22 42 C16 42 10 38 10 30 Z', 'p'], ['ellipse', 22, 20, 24, 4, '#c98a4b']],
  coffee: [['path', 'M17 12 C15 8 19 7 17 3', null, { w: 1.6 }], ['path', 'M25 12 C23 8 27 7 25 3', null, { w: 1.6 }], ['path', 'M35 22 C43 22 43 34 35 34', null], ['path', rr(9, 16, 26, 26, 4), 'a'], ['ellipse', 22, 17, 24, 5, '#e8c9a0'], ['path', heart(22, 31, 9), 'p', { line: false }]],
  sunrise: [['line', 24, 15, 24, 9, { stroke: '#e9a92f', w: 2.4 }], ['line', 12, 21, 8, 17, { stroke: '#e9a92f', w: 2.4 }], ['line', 36, 21, 40, 17, { stroke: '#e9a92f', w: 2.4 }],
    ['path', 'M12 34 A12 12 0 0 1 36 34 Z', '#f6c64f'], ['line', 4, 34, 44, 34], ['line', 10, 40, 20, 40, { stroke: 'a', w: 2.2 }], ['line', 27, 40, 38, 40, { stroke: 'a', w: 2.2 }]],
  sunset: [['path', 'M8 13 Q11 10 14 13 Q17 10 20 13', null, { w: 1.6 }], ['path', 'M26 8 Q28 6 30 8 Q32 6 34 8', null, { w: 1.4 }], ['path', 'M13 34 A11 11 0 0 1 35 34 Z', 'a'], ['line', 4, 34, 44, 34],
    ['line', 9, 40, 21, 40, { stroke: 'a', w: 2.2 }], ['line', 26, 40, 39, 40, { stroke: 'a', w: 2.2 }]],
  sea: [['circle', 36, 11, 9, '#f6c64f'], ['path', 'M4 22 C10 16 14 16 20 22 S30 28 36 22 S42 18 44 18', null, { stroke: 'a', w: 2.4 }], ['path', 'M4 31 C10 25 14 25 20 31 S30 37 36 31 S42 27 44 27 V43 H4 Z', 'a']],
  mountain: [['circle', 38, 9, 8, '#f6c64f'], ['polygon', [[3, 42], [18, 13], [27, 28], [33, 20], [45, 42]], 'a'], ['polygon', [[18, 13], [13.5, 22], [17, 20.5], [20, 23.5], [22.5, 19.5]], 'p']],
  dog: [['g', 22, 11, 22, [['ellipse', 11, 22, 10, 19, 'b']]], ['g', -22, 37, 22, [['ellipse', 37, 22, 10, 19, 'b']]], ['ellipse', 24, 26, 26, 25, 'a'], ['ellipse', 24, 33, 13, 9, 'p'],
    ['circle', 19, 23, 3.6, 'i', { line: false }], ['circle', 29, 23, 3.6, 'i', { line: false }], ['ellipse', 24, 30, 6, 4, 'i', { line: false }], ['path', 'M22 36 C22 41 26 41 26 36', '#f4a3b5']],
  book: [['path', 'M3 14 V42 C10 40 18 40 24 43 C30 40 38 40 45 42 V14', null, { stroke: 'a', w: 3 }], ['path', 'M24 13 C18 10 10 10 5 12 V39 C10 37 18 37 24 40 Z', 'p'], ['path', 'M24 13 C30 10 38 10 43 12 V39 C38 37 30 37 24 40 Z', 'p'],
    ['line', 9, 18, 20, 18, { w: 1.3 }], ['line', 9, 23, 20, 23, { w: 1.3 }], ['line', 9, 28, 17, 28, { w: 1.3 }], ['line', 28, 18, 39, 18, { w: 1.3 }], ['line', 28, 23, 39, 23, { w: 1.3 }]],
  sushi: [['line', 30, 10, 45, 4, { w: 2.2 }], ['line', 33, 13, 46, 9, { w: 2.2 }], ['rectangle', 8, 21, 32, 15, 'i'], ['ellipse', 24, 36, 32, 9, 'i'], ['ellipse', 24, 21, 32, 10, 'p'], ['ellipse', 24, 21, 14, 5, 'a']],
  snow: [['line', 24, 5, 24, 43, { stroke: 'a', w: 2.6 }], ['line', 7.5, 14.5, 40.5, 33.5, { stroke: 'a', w: 2.6 }], ['line', 7.5, 33.5, 40.5, 14.5, { stroke: 'a', w: 2.6 }],
    ['path', 'M19 8 L24 13 L29 8', null, { stroke: 'a', w: 2 }], ['path', 'M19 40 L24 35 L29 40', null, { stroke: 'a', w: 2 }], ['circle', 24, 24, 6, 'p']],
  sofa: [['path', rr(8, 12, 32, 16, 5), 'a'], ['ellipse', 16, 22, 11, 7, 'p'], ['path', rr(6, 25, 36, 10, 3), 'b'], ['path', rr(3, 20, 8, 16, 3), 'a'], ['path', rr(37, 20, 8, 16, 3), 'a'], ['line', 8, 36, 8, 41], ['line', 40, 36, 40, 41]],
  shoe: [['path', 'M6 31 C6 22 10 16 16 16 C18 22 24 24 30 24 C38 24 43 27 43 32 V35 H6 Z', 'a'], ['rectangle', 5, 34, 39, 5, 'p'], ['line', 16, 22, 21, 19, { stroke: 'p', w: 2 }], ['line', 19, 25, 24, 22, { stroke: 'p', w: 2 }]],
  icecream: [['polygon', [[15, 25], [33, 25], [24, 45]], '#e8b46a'], ['circle', 18, 21, 14, 'a'], ['circle', 30, 21, 14, 'b'], ['circle', 24, 13, 13, '#f6c64f'], ['circle', 25, 5, 5, '#e0614f']],
  tent: [['line', 24, 8, 24, 2], ['polygon', [[24, 2], [32, 4.5], [24, 7]], 'a', { line: false }], ['polygon', [[4, 40], [24, 8], [44, 40]], 'a'], ['polygon', [[24, 19], [18, 40], [30, 40]], 'i'], ['line', 2, 41, 46, 41]],
  note: [['polygon', [[18, 11], [35, 6], [35, 12], [18, 17]], 'i'], ['line', 18, 13, 18, 34, { w: 2.4 }], ['line', 35, 8, 35, 30, { w: 2.4 }], ['ellipse', 13.5, 34, 11, 8, 'a'], ['ellipse', 30.5, 30, 11, 8, 'a']],
  mic: [['path', 'M24 40 C24 46 34 45 37 41', null], ['polygon', [[19.5, 21], [28.5, 21], [26.5, 41], [21.5, 41]], 'p'], ['circle', 24, 14, 16, 'a'], ['line', 18, 11, 30, 11, { stroke: 'p', w: 1.4 }], ['line', 17, 16, 31, 16, { stroke: 'p', w: 1.4 }]],
  basket: [['path', 'M12 22 C12 7 36 7 36 22', null, { w: 2.6 }], ['path', 'M6 22 H42 L37 41 H11 Z', '#e8b46a'], ['rectangle', 9, 18, 30, 6, 'a'], ['line', 13, 29, 35, 29, { w: 1.4 }], ['line', 14, 35, 34, 35, { w: 1.4 }]],
  plate: [['circle', 26, 25, 32, 'p'], ['circle', 26, 25, 20, 'b'], ['line', 5, 8, 5, 42, { w: 2.2 }], ['path', 'M2 8 V16 C2 19 8 19 8 16 V8', null, { w: 1.8 }], ['path', 'M45 8 C40 14 41 24 45 26 V42', null, { w: 2.2 }]],
  gift: [['path', 'M24 16 C17 5 11 13 24 16 C37 13 31 5 24 16', 'p'], ['rectangle', 8, 22, 32, 20, 'a'], ['rectangle', 6, 16, 36, 7, 'a'], ['rectangle', 21, 16, 6, 26, 'p']],
  museum: [['polygon', [[5, 16], [24, 5], [43, 16]], 'p'], ['rectangle', 6, 16, 36, 4, 'a'], ['rectangle', 10, 20, 5, 18, 'b'], ['rectangle', 21.5, 20, 5, 18, 'b'], ['rectangle', 33, 20, 5, 18, 'b'], ['rectangle', 5, 38, 38, 5, 'p']],
  ferris: [['line', 24, 20, 15, 44], ['line', 24, 20, 33, 44], ['line', 11, 44, 37, 44], ['circle', 24, 20, 30, null], ['line', 9, 20, 39, 20, { w: 1.4 }], ['line', 16.5, 7, 31.5, 33, { w: 1.4 }], ['line', 31.5, 7, 16.5, 33, { w: 1.4 }],
    ...[[9, 20], [16.5, 7], [31.5, 7], [39, 20], [31.5, 33], [16.5, 33]].map(([x, y], i) => ['circle', x, y, 7, i % 2 ? '#f6c64f' : 'a'])],
  train: [['line', 6, 44, 42, 44], ['line', 14, 38, 10, 44], ['line', 34, 38, 38, 44], ['path', rr(8, 9, 32, 30, 6), 'a'], ['rectangle', 12, 14, 24, 10, 'p'], ['circle', 15, 32, 5, '#f6c64f'], ['circle', 33, 32, 5, '#f6c64f']],
  plane: [['polygon', [[20, 22], [29, 6], [34, 6], [29, 22]], 'a'], ['polygon', [[6, 25], [4, 14], [10, 14], [15, 23]], 'a'], ['path', 'M4 26 C14 21 34 19 42 19 C47 19 47 26 42 26 C34 27 14 28 4 26 Z', 'p'],
    ['polygon', [[21, 26], [29, 40], [34, 40], [29, 26]], 'a'], ['circle', 33, 22.5, 3, 'b', { line: false }], ['circle', 38, 22, 3, 'b', { line: false }]],
  gamepad: [['path', 'M10 17 H38 C44 17 47 30 43 36 C40 40 34 39 31 33 H17 C14 39 8 40 5 36 C1 30 4 17 10 17 Z', 'a'], ['line', 11, 26, 19, 26, { stroke: 'p', w: 2.8 }], ['line', 15, 22, 15, 30, { stroke: 'p', w: 2.8 }],
    ['circle', 31, 24, 4.5, 'p'], ['circle', 36, 29, 4.5, 'p']],
  phone: [['path', rr(14, 4, 20, 40, 4), 'i'], ['rectangle', 17, 9, 14, 27, 'b'], ['path', heart(24, 23, 10), 'a', { line: false }], ['circle', 24, 40, 2.6, 'p', { line: false }]],
  camera: [['rectangle', 15, 10, 12, 6, 'a'], ['path', rr(5, 15, 38, 25, 4), 'a'], ['circle', 24, 27.5, 17, 'p'], ['circle', 24, 27.5, 8, 'i'], ['rectangle', 34, 18, 5, 4, 'p']],
  tree: [['line', 4, 43, 44, 43], ['rectangle', 21, 29, 6, 14, '#a0703c'], ['circle', 15, 25, 15, 'a'], ['circle', 33, 25, 15, 'a'], ['circle', 24, 17, 22, 'a']],
  garland: [['path', 'M3 10 C14 21 34 21 45 10', null, { w: 1.6 }], ['path', 'M3 27 C14 38 34 38 45 27', null, { w: 1.6 }],
    ...[[10, 16], [18, 19.5], [26, 20], [34, 18], [41, 14], [10, 33], [18, 36.5], [26, 37], [34, 35], [41, 31]].map(([x, y], i) => ['circle', x, y + 3, 6, ['a', '#f6c64f', '#6fa8d6', '#7fae6a'][i % 4]])],
  bath: [['path', 'M40 24 V12 Q40 8 36 8 H32', null], ['circle', 30, 12, 6, 'b'], ['circle', 35, 6, 4, 'b'], ['line', 11, 39, 9, 44], ['line', 37, 39, 39, 44],
    ['circle', 12, 22, 9, 'b'], ['circle', 19, 19, 10, 'b'], ['circle', 27, 20, 9, 'b'], ['path', 'M5 24 H43 V30 C43 37 37 40 30 40 H18 C11 40 5 37 5 30 Z', 'a']],
  clip: [['path', 'M19 4 L19 33 C19 41 31 41 31 33 L31 10 C31 5 24 5 24 10 L24 31', null, { stroke: '#8a8f99', w: 2.2 }]],
  pin: [['circle', 24, 20, 20, 'a'], ['circle', 20, 16, 6, 'p', { line: false }], ['line', 24, 30, 24, 44, { stroke: '#8a8f99', w: 2.4 }]],
  check: [['path', 'M8 25 L19 36 L41 10', null, { w: 4 }]],
  star: [['polygon', [[24, 5], [29.5, 18], [43, 18.5], [32.5, 27], [36.5, 41], [24, 33], [11.5, 41], [15.5, 27], [5, 18.5], [18.5, 18]], 'a']],
};

// мягкий тон акцента для заливок 'b'
const tint = (hex, k = .55) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k)); return `rgb(${c})`; };

function draw(op, o, seed) {
  const [kind, ...rest] = op;
  if (kind === 'g') { const [rot, cx, cy, kids] = rest; return `<g transform="rotate(${rot} ${cx} ${cy})">${kids.map((k, i) => draw(k, o, seed + i * 7)).join('')}</g>`; }
  const extra = typeof rest[rest.length - 1] === 'object' && rest[rest.length - 1] && !Array.isArray(rest[rest.length - 1]) ? rest.pop() : {};
  const role = ['line'].includes(kind) ? null : rest.pop();
  const col = (r) => (r === 'a' ? o.accent : r === 'b' ? tint(o.accent) : r === 'p' ? PAPER : r === 'i' ? o.ink : r);
  const fill = col(role), stroke = extra.stroke ? col(extra.stroke) : o.ink, w = (extra.w ?? 2) * o.weight;
  const line = extra.line !== false && o.mode !== 'fill';
  const opts = { seed, roughness: o.roughness, bowing: 1, strokeWidth: w, stroke: line || !fill ? stroke : 'none', disableMultiStroke: o.single, preserveVertices: false };
  if (o.mode === 'line') opts.stroke = extra.stroke ? stroke : o.ink; // ризограф: контур рисуется второй краской
  if (o.mode === 'fill' && !fill) { opts.stroke = extra.stroke ? stroke : o.ink; opts.strokeWidth = w; } // открытые линии остаются
  if (fill && o.mode !== 'line') Object.assign(opts, { fill, fillStyle: o.fill, hachureGap: o.gap, fillWeight: o.fillWeight, hachureAngle: -41 + (seed % 9) * 3 });
  if (o.mode === 'under') Object.assign(opts, { stroke: o.under, strokeWidth: o.underW, fill: o.under, fillStyle: 'solid', disableMultiStroke: true });
  if (o.mode === 'line' && !line && fill) return '';
  const d = kind === 'path' ? gen.path(rest[0], opts) : kind === 'polygon' ? gen.polygon(rest[0], opts) : kind === 'circle' ? gen.circle(rest[0], rest[1], rest[2], opts)
    : kind === 'ellipse' ? gen.ellipse(...rest.slice(0, 4), opts) : kind === 'rectangle' ? gen.rectangle(...rest.slice(0, 4), opts) : gen.line(...rest.slice(0, 4), opts);
  return gen.toPaths(d).map((p) => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill || 'none'}"/>`).join('');
}

const STYLE = {
  sticker: { roughness: .9, fill: 'solid', single: true, weight: 1, ink: INK },
  pencil: { roughness: 1.25, fill: 'hachure', gap: 3.2, fillWeight: 1.3, single: false, weight: .9, ink: INK },
  riso: { roughness: .7, fill: 'solid', single: true, weight: 1.1, ink: '#3d5588' },
};
const cache = new Map();

export function doodle(name, { style = 'sticker', accent = '#ef7f9b', ink, cls = '' } = {}) {
  const key = `${name}|${style}|${accent}|${ink}`;
  if (cache.has(key)) return cache.get(key);
  const ops = ICONS[name]; if (!ops) return '';
  const o = { ...STYLE[style], accent, ...(ink ? { ink } : {}) };
  const all = (mode, extra = {}) => ops.map((op, i) => draw(op, { ...o, mode, ...extra }, 11 + i * 13 + name.length)).join('');
  let body;
  if (style === 'sticker') body = `<g stroke-linecap="round" stroke-linejoin="round">${all('under', { under: PAPER, underW: 7 })}</g>${all('both')}`;
  else if (style === 'riso') body = `${all('fill')}<g transform="translate(1.3 .9)" style="mix-blend-mode:multiply">${all('line')}</g>`;
  else body = all('both');
  const svg = `<svg class="dd ${cls}" viewBox="-4 -4 56 56" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  cache.set(key, svg);
  return svg;
}
export const DOODLES = Object.keys(ICONS);

// краски приложений и игр (направление «скрапбук», 10.10)
export const TONE = { tube: '#e0614f', gallery: '#6fa8d6', plans: '#7fae6a', thoughts: '#a58bd1', counter: '#ef7f9b', quiz: '#e9a92f', games: '#3fa39a', shop: '#f08b46', profile: '#4b6fb5', power: '#f2c260',
  wave: '#6fa8d6', draw: '#e0614f', ttt: '#ef7f9b', cats: '#f08b46', battle: '#4b6fb5' };
export const sticker = (name, accent = TONE[name]) => doodle(name, { style: 'sticker', accent });
