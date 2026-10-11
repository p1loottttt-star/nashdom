// Темы и раскладки альбомов. Раскладка — слоты под фото на странице 3:4 (x, y, w, h — % ширины/высоты страницы, rot — наклон в градусах,
// тема умножает его на свой tilt) и место подписи cap. Вид тем — CSS-классы .th-<id> в index.html.
export const LAYOUTS = [
  { id: 'one', name: 'одно крупно', slots: [{ id: 'a', x: 10, y: 7, w: 80, h: 62, rot: -1 }], cap: { x: 12, y: 76, w: 76 } },
  { id: 'onec', name: 'одно с полями', slots: [{ id: 'a', x: 17, y: 13, w: 66, h: 48, rot: 2 }], cap: { x: 14, y: 68, w: 72 } },
  { id: 'twov', name: 'два лесенкой', slots: [{ id: 'a', x: 8, y: 5, w: 62, h: 37, rot: -3 }, { id: 'b', x: 30, y: 45, w: 62, h: 37, rot: 2 }], cap: { x: 6, y: 86, w: 60 } },
  { id: 'twoh', name: 'два рядом', slots: [{ id: 'a', x: 5, y: 18, w: 43, h: 36, rot: -3 }, { id: 'b', x: 52, y: 28, w: 43, h: 36, rot: 3 }], cap: { x: 10, y: 72, w: 80 } },
  { id: 'twobig', name: 'крупное и малое', slots: [{ id: 'a', x: 7, y: 5, w: 86, h: 50, rot: -1 }, { id: 'b', x: 50, y: 59, w: 43, h: 31, rot: 4 }], cap: { x: 6, y: 66, w: 40 } },
  { id: 'three', name: 'три лесенкой', slots: [{ id: 'a', x: 6, y: 4, w: 52, h: 31, rot: -3 }, { id: 'b', x: 42, y: 34, w: 52, h: 31, rot: 3 }, { id: 'c', x: 7, y: 64, w: 46, h: 28, rot: -2 }], cap: { x: 57, y: 72, w: 37 } },
  { id: 'threet', name: 'одно сверху, два снизу', slots: [{ id: 'a', x: 7, y: 5, w: 86, h: 43, rot: 0 }, { id: 'b', x: 6, y: 53, w: 42, h: 30, rot: -2 }, { id: 'c', x: 52, y: 53, w: 42, h: 30, rot: 2 }], cap: { x: 10, y: 87, w: 80 } },
  { id: 'threec', name: 'три столбика', slots: [{ id: 'a', x: 5, y: 10, w: 28, h: 44, rot: -2 }, { id: 'b', x: 36, y: 14, w: 28, h: 44, rot: 1 }, { id: 'c', x: 67, y: 10, w: 28, h: 44, rot: 3 }], cap: { x: 10, y: 66, w: 80 } },
  { id: 'four', name: 'сетка 2×2', slots: [{ id: 'a', x: 6, y: 6, w: 42, h: 32, rot: -1 }, { id: 'b', x: 52, y: 6, w: 42, h: 32, rot: 1 }, { id: 'c', x: 6, y: 42, w: 42, h: 32, rot: 1 }, { id: 'd', x: 52, y: 42, w: 42, h: 32, rot: -1 }], cap: { x: 10, y: 80, w: 80 } },
  { id: 'fourc', name: 'коллаж из четырёх', slots: [{ id: 'a', x: 5, y: 4, w: 56, h: 36, rot: -2 }, { id: 'b', x: 60, y: 9, w: 35, h: 27, rot: 5 }, { id: 'c', x: 6, y: 45, w: 36, h: 27, rot: -4 }, { id: 'd', x: 44, y: 42, w: 51, h: 34, rot: 2 }], cap: { x: 7, y: 80, w: 56 } },
  { id: 'five', name: 'пять', slots: [{ id: 'a', x: 5, y: 4, w: 43, h: 27, rot: -2 }, { id: 'b', x: 52, y: 4, w: 43, h: 27, rot: 2 }, { id: 'c', x: 5, y: 35, w: 90, h: 31, rot: 0 }, { id: 'd', x: 5, y: 70, w: 43, h: 26, rot: 2 }, { id: 'e', x: 52, y: 70, w: 43, h: 26, rot: -2 }] },
];
// новые страницы берут раскладки по кругу — альбом сразу разнообразный
export const SEQ = ['twoh', 'one', 'three', 'fourc', 'twobig', 'threet', 'onec', 'twov', 'four', 'threec'];

// fonts: [подписи, второй]; ink — чернила подписей; frame — рамка фото; tilt — множитель наклона слотов
export const THEMES = [
  { id: 'kraft', name: 'Крафт и скотч', fonts: ['Caveat', 'Neucha'], ink: ['#3b2a35', '#9b3d4f', '#2f5a7a', '#4d6b3a', '#8a5a2b'], frame: 'polaroid', tilt: 1, cover: '#b98a5e' },
  { id: 'travel', name: 'Путешествие', fonts: ['PT Mono', 'Caveat'], ink: ['#24364f', '#a5402d', '#3b2a35', '#2f6b5e', '#7a5a1f'], frame: 'deckle', tilt: 1.2, cover: '#2f4a6b' },
  { id: 'film', name: 'Плёнка и кино', fonts: ['Amatic SC', 'Neucha'], ink: ['#f6efe2', '#ffd36b', '#ff8fab', '#9fd0ff', '#c9f0b0'], frame: 'film', tilt: 0, cover: '#26212b' },
  { id: 'water', name: 'Нежная акварель', fonts: ['Marck Script', 'Bad Script'], ink: ['#5b4a63', '#c06a86', '#5f86a8', '#6f9a72', '#b8875a'], frame: 'corners', tilt: 0.5, cover: '#e8c9d3' },
];
export const theme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
// украшения тем: наклейки (рисунки doodles.js) — стиль печати и краски; ленты — CSS-фон полоски
const DECOR = {
  kraft: { print: 'sticker', accents: ['#ef7f9b', '#6fa8d6', '#e9a92f', '#7fae6a'],
    stickers: ['heart', 'hearts', 'star', 'coffee', 'love', 'house', 'camera', 'note', 'flame', 'cake', 'bear', 'pin'],
    tapes: ['repeating-linear-gradient(45deg, #f08aa0 0 7px, #ffd6a0 7px 14px)', 'repeating-linear-gradient(90deg, #7fb3c8 0 6px, #fffaf2 6px 9px)', 'radial-gradient(circle, #fffaf2 2px, transparent 2.5px) 0 0 / 10px 10px, #8fc7a8',
      'linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px) 0 0 / 8px 8px, linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px) 0 0 / 8px 8px, #e9b35f', 'repeating-linear-gradient(0deg, rgba(200,80,95,.55) 0 5px, transparent 5px 10px), repeating-linear-gradient(90deg, rgba(200,80,95,.55) 0 5px, #fff2f0 5px 10px)', '#d8bf98'] },
  travel: { print: 'riso', accents: ['#e0614f', '#4b6fb5', '#e9a92f', '#5f9e8f'],
    stickers: ['plane', 'suitcase', 'stamp', 'compass', 'mountain', 'sea', 'train', 'tent', 'museum', 'ferris', 'camera', 'pin'],
    tapes: ['#e9dcbf', 'repeating-linear-gradient(45deg, #d9493c 0 8px, #fffaf0 8px 14px, #3e64a8 14px 22px, #fffaf0 22px 28px)', 'radial-gradient(circle, rgba(47,74,107,.6) 1.4px, transparent 2px) 0 0 / 7px 7px, #f3ead6', '#8d9a6a', 'repeating-linear-gradient(90deg, #2f4a6b 0 3px, #f2e8d3 3px 12px)'] },
  film: { print: 'sticker', accents: ['#ffd36b', '#ef7f9b', '#e0614f', '#6fa8d6'],
    stickers: ['film', 'ticket', 'popcorn', 'star', 'heart', 'mic', 'note', 'candle', 'icecream', 'pizza', 'camera', 'flame'],
    tapes: ['#26222a', 'linear-gradient(#b9b4bd, #8f8a93)', '#d9493c', 'repeating-linear-gradient(-45deg, #ffd36b 0 8px, #26222a 8px 16px)', 'radial-gradient(circle, #ffd36b 1.6px, transparent 2.2px) 0 0 / 9px 9px, #3a3340'] },
  water: { print: 'pencil', accents: ['#e8a0b8', '#a9c4e0', '#b5d3a8', '#d9b8e6'],
    stickers: ['flower', 'leaf', 'heart', 'hearts', 'star', 'cake', 'candle', 'gift', 'tree', 'sunrise', 'snow', 'garland'],
    tapes: ['rgba(240,180,200,.8)', 'radial-gradient(circle, #fff 1.8px, transparent 2.3px) 0 0 / 9px 9px, rgba(200,180,230,.85)', 'repeating-linear-gradient(90deg, rgba(170,210,180,.85) 0 5px, rgba(255,255,255,.8) 5px 8px)', 'rgba(255,214,180,.85)', 'radial-gradient(circle at 50% 0, transparent 3px, rgba(255,255,255,.95) 3.5px) 0 0 / 8px 6px, rgba(255,255,255,.6)'] },
};
for (const t of THEMES) Object.assign(t, DECOR[t.id]);
// краска наклейки — своя у каждого рисунка, стабильная
export const accentOf = (t, name) => t.accents[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % t.accents.length];

