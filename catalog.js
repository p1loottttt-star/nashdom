// Магазин и правила баллов. Цены и суммы дублируют supabase/migrations (shop и award) — их сверяет tests/catalog.test.mjs.
// kind: 'style' — стены/пол/стол, покупается один раз и дальше переключается бесплатно (price 0 — есть у всех сразу);
//       'decor' — вещь в комнату, можно сколько угодно, ставится перетаскиванием; 'gift' — подарок партнёру (после открытия тоже вещь).
// slot (у style): wall | floor | desk. cat (у decor): wall | table | floor — раздел в магазине.
export const SHOP = [
  // ---- стены: краска и обои ----
  { id: 'w_rose', kind: 'style', slot: 'wall', price: 0, emoji: '🌸', title: 'Розовая штукатурка' },
  { id: 'w_cream', kind: 'style', slot: 'wall', price: 0, emoji: '🍦', title: 'Сливочная' },
  { id: 'w_sage', kind: 'style', slot: 'wall', price: 0, emoji: '🌿', title: 'Шалфей' },
  { id: 'w_sky', kind: 'style', slot: 'wall', price: 0, emoji: '☁️', title: 'Небо' },
  { id: 'w_lavender', kind: 'style', slot: 'wall', price: 30, emoji: '💜', title: 'Лаванда' },
  { id: 'w_peach', kind: 'style', slot: 'wall', price: 30, emoji: '🍑', title: 'Персик' },
  { id: 'w_night', kind: 'style', slot: 'wall', price: 45, emoji: '🌌', title: 'Ночное небо' },
  { id: 'wp_stripes', kind: 'style', slot: 'wall', price: 60, emoji: '🎀', title: 'Обои в полоску' },
  { id: 'wp_dots', kind: 'style', slot: 'wall', price: 60, emoji: '🫧', title: 'Обои в горошек' },
  { id: 'wp_hearts', kind: 'style', slot: 'wall', price: 70, emoji: '💕', title: 'Обои с сердечками' },
  { id: 'wp_checks', kind: 'style', slot: 'wall', price: 70, emoji: '🏁', title: 'Обои в клетку' },
  { id: 'wp_flowers', kind: 'style', slot: 'wall', price: 90, emoji: '🌼', title: 'Обои с цветами' },
  // ---- пол ----
  { id: 'f_oak', kind: 'style', slot: 'floor', price: 0, emoji: '🪵', title: 'Дубовый паркет' },
  { id: 'f_light', kind: 'style', slot: 'floor', price: 0, emoji: '🌾', title: 'Светлое дерево' },
  { id: 'f_walnut', kind: 'style', slot: 'floor', price: 60, emoji: '🌰', title: 'Орех' },
  { id: 'f_herring', kind: 'style', slot: 'floor', price: 90, emoji: '🧩', title: 'Паркет «ёлочка»' },
  { id: 'f_tiles', kind: 'style', slot: 'floor', price: 80, emoji: '♟️', title: 'Плитка в шахматку' },
  { id: 'f_carpet', kind: 'style', slot: 'floor', price: 70, emoji: '🧶', title: 'Мягкий ковролин' },
  // ---- столы ----
  { id: 'd_classic', kind: 'style', slot: 'desk', price: 0, emoji: '🪑', title: 'Классический стол', hint: '1,9 м, четыре ножки' },
  { id: 'd_compact', kind: 'style', slot: 'desk', price: 80, emoji: '📐', title: 'Компактный', hint: '1,7 м, ящик' },
  { id: 'd_scandi', kind: 'style', slot: 'desk', price: 120, emoji: '🌲', title: 'Скандинавский', hint: '1,9 м, ножки врозь' },
  { id: 'd_shelves', kind: 'style', slot: 'desk', price: 160, emoji: '📚', title: 'С полками', hint: '1,9 м, открытые полки' },
  { id: 'd_worker', kind: 'style', slot: 'desk', price: 180, emoji: '🗄️', title: 'Рабочий', hint: '2,2 м, тумба с ящиками' },
  { id: 'd_loft', kind: 'style', slot: 'desk', price: 200, emoji: '🏭', title: 'Лофт', hint: '2 м, металл и дерево' },

  // ---- на стену ----
  { id: 'frame', kind: 'decor', cat: 'wall', price: 70, emoji: '🖼️', title: 'Акварель с сердцем' },
  { id: 'poster_paris', kind: 'decor', cat: 'wall', price: 50, emoji: '🗼', title: 'Постер «Париж»' },
  { id: 'poster_mountains', kind: 'decor', cat: 'wall', price: 50, emoji: '🏔️', title: 'Постер «Горы»' },
  { id: 'poster_cat', kind: 'decor', cat: 'wall', price: 50, emoji: '🐈', title: 'Постер с котом' },
  { id: 'poster_abstract', kind: 'decor', cat: 'wall', price: 50, emoji: '🎨', title: 'Абстракция' },
  { id: 'poster_moon', kind: 'decor', cat: 'wall', price: 50, emoji: '🌙', title: 'Фазы луны' },
  { id: 'clock', kind: 'decor', cat: 'wall', price: 60, emoji: '🕰️', title: 'Настенные часы', hint: 'показывают твоё время' },
  { id: 'mirror', kind: 'decor', cat: 'wall', price: 90, emoji: '🪞', title: 'Круглое зеркало' },
  { id: 'neon', kind: 'decor', cat: 'wall', price: 120, emoji: '💗', title: 'Неон «love»' },
  { id: 'lights', kind: 'decor', cat: 'wall', price: 110, emoji: '✨', title: 'Гирлянда-штора' },
  { id: 'shelf_s', kind: 'decor', cat: 'wall', price: 40, emoji: '📏', title: 'Полка 50 см', hint: 'на неё можно ставить вещи' },
  { id: 'shelf_l', kind: 'decor', cat: 'wall', price: 70, emoji: '📏', title: 'Полка 90 см', hint: 'на неё можно ставить вещи' },
  // ---- на стол и полки ----
  { id: 'cactus', kind: 'decor', cat: 'table', price: 40, emoji: '🌵', title: 'Кактус' },
  { id: 'succulent', kind: 'decor', cat: 'table', price: 30, emoji: '🪴', title: 'Суккулент' },
  { id: 'candles', kind: 'decor', cat: 'table', price: 50, emoji: '🕯️', title: 'Свечи' },
  { id: 'globe', kind: 'decor', cat: 'table', price: 90, emoji: '🌍', title: 'Глобус' },
  { id: 'books', kind: 'decor', cat: 'table', price: 35, emoji: '📚', title: 'Стопка книг' },
  { id: 'vase_tulips', kind: 'decor', cat: 'table', price: 55, emoji: '🌷', title: 'Ваза с тюльпанами' },
  { id: 'lava', kind: 'decor', cat: 'table', price: 85, emoji: '🫧', title: 'Лава-лампа' },
  { id: 'jar_lights', kind: 'decor', cat: 'table', price: 60, emoji: '🫙', title: 'Банка с огоньками' },
  { id: 'cat_fig', kind: 'decor', cat: 'table', price: 45, emoji: '🐱', title: 'Фарфоровый котик' },
  { id: 'heart_fig', kind: 'decor', cat: 'table', price: 40, emoji: '❤️', title: 'Сердце на подставке' },
  { id: 'dino', kind: 'decor', cat: 'table', price: 45, emoji: '🦕', title: 'Динозаврик' },
  { id: 'photo_stand', kind: 'decor', cat: 'table', price: 40, emoji: '🖼️', title: 'Рамка для фото' },
  { id: 'radio', kind: 'decor', cat: 'table', price: 75, emoji: '📻', title: 'Ретро-радио' },
  // ---- на пол ----
  { id: 'lamp', kind: 'decor', cat: 'floor', price: 140, emoji: '💡', title: 'Торшер' },
  { id: 'pouf', kind: 'decor', cat: 'floor', price: 160, emoji: '🟣', title: 'Пуф' },
  { id: 'side_table', kind: 'decor', cat: 'floor', price: 90, emoji: '🪵', title: 'Столик', hint: 'на него можно ставить вещи' },
  { id: 'monstera', kind: 'decor', cat: 'floor', price: 150, emoji: '🌿', title: 'Монстера' },
  { id: 'tree', kind: 'decor', cat: 'floor', price: 220, emoji: '🎄', title: 'Ёлочка' },

  // ---- подарки: открыл — и это твоя вещь, её тоже можно поставить куда хочешь ----
  { id: 'balloon', kind: 'gift', cat: 'table', price: 20, emoji: '🎈', title: 'Шарик-сердце', hint: 'просто так' },
  { id: 'choco', kind: 'gift', cat: 'table', price: 30, emoji: '🍫', title: 'Коробка конфет', hint: 'сладкое настроение' },
  { id: 'flowers', kind: 'gift', cat: 'table', price: 45, emoji: '💐', title: 'Букет', hint: 'в вазе' },
  { id: 'teddy', kind: 'gift', cat: 'table', price: 70, emoji: '🧸', title: 'Мишка', hint: 'обнимашки на расстоянии' },
  { id: 'ring', kind: 'gift', cat: 'table', price: 150, emoji: '💍', title: 'Шкатулка с кольцом', hint: 'очень серьёзно' },
];
export const ITEM = Object.fromEntries(SHOP.map((s) => [s.id, s]));
export const DEFAULT_ROOM = { wall: 'w_rose', floor: 'f_oak', desk: 'd_classic', deskColor: 'oak', place: {} };

// стили, открытые у человека: бесплатные + купленные им самим
export const ownedStyles = (rows, uid) => new Set([...SHOP.filter((s) => s.kind === 'style' && !s.price).map((s) => s.id),
  ...rows.filter((r) => r.reason === 'style' && r.user_id === uid).map((r) => r.item)]);
// вещи человека: купленные им декор и открытые подарки ему; id экземпляра — по строке копилки
export const inventory = (rows, uid) => rows
  .filter((r) => (r.reason === 'decor' && r.user_id === uid) || (r.reason === 'gift' && r.to_user === uid && r.opened))
  .map((r) => ({ id: 'L' + String(r.id).replace(/\D/g, ''), item: r.item }));

// reason: [баллы, предел в день на пару, как написать в истории]
export const EARN = {
  daily: [5, 2, 'заглянули домой'],
  note: [5, 3, 'записка'],
  photo: [2, 20, 'фото'],
  album: [20, 3, 'новый альбом'],
  step: [10, 10, 'этап плана'],
  plan: [50, 2, 'план выполнен'],
  watch: [30, 3, 'посмотрели вместе'],
  quiz: [10, 3, 'тест вдвоём'],
  game: [5, 5, 'игра вдвоём'],
  trash: [3, 10, 'в мусорку'],
};
