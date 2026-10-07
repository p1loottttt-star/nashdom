// Автоподстройка качества по времени кадра: сначала разрешение (плавно), потом дорогие эффекты — и обратно, когда машина справляется.
// Вниз: разрешение до 1 → ступени эффектов → разрешение до минимума. Вверх — в обратном порядке.
// ceil помнит разрешение, на котором стало тяжело, и медленно отпускает: иначе у предела vsync качели «выше-ниже».
// Ступени для тун-стиля: сглаживание и родное разрешение не трогаем никогда — без них обводка и края «рябят» при движении камеры
// (07.10: на Radeon 760M автоподстройка опускала до pr 0.85 без MSAA, отсюда «пиксельно» при идеальной лаборатории).
// Тяжело — сначала реже обновляем карту теней, потом MSAA 4→2 и тень 1024; дальше просто меньше кадров, но чисто.
export const TIERS = [
  { msaa: 4, shadow: 2048, shEvery: 1 },
  { msaa: 4, shadow: 2048, shEvery: 3 },
  { msaa: 2, shadow: 1024, shEvery: 3 },
];
// pr: ниже родного (до 1.5) не опускаемся; на экранах с dpr 1 есть запас вверх (1.25 — сверхвыборка)
export const prRange = (dpr, low = false) => {
  const max = Math.min(low ? 1.5 : 2, Math.max(dpr, 1.25));
  return { max, min: Math.min(max, Math.max(1, Math.min(dpr, 1.5))) };
};
export const SLOW = 0.0205, FAST = 0.0175, TOP_TIER = 2;
const step = (v) => Math.round(v * 20) / 20, floor = (v) => Math.floor(v * 20 + 1e-6) / 20;

export function createTuner({ min, max, tier = 0, pr = max }) {
  const soft = Math.min(max, 1);
  let ceil = max, fastFor = 0, at = -1e9, fails = 1, upAt = -1e9;
  pr = Math.min(max, Math.max(min, pr));
  // med — медиана времени кадра в секундах за последние ~30 кадров; вернёт true, если что-то поменялось
  function feed(med, now) {
    if (now - at < 500) return false;
    const q = () => pr - tier * 10, was = q(); // «качество одним числом»: выше — лучше
    if (med > SLOW) {
      fastFor = 0;
      // проба «выше» провалилась — запоминаем потолок разрешения и следующую пробу делаем реже;
      // обычное замедление (тяжёлая вкладка рядом) потолок не трогает
      const probe = now - upAt < 3000;
      if (probe) { fails++; if (pr > soft + 0.01 || tier === TOP_TIER) ceil = Math.max(min, Math.min(ceil, pr - 0.05)); upAt = -1e9; }
      if (pr > soft + 0.01) pr = Math.max(soft, step(pr * 0.88));
      else if (tier < TOP_TIER) { if (probe || now - at > 2000) tier++; } // неудачную пробу откатываем сразу
      else if (pr > min + 0.01) pr = Math.max(min, step(pr * 0.9));
    } else if (med < FAST) {
      ceil = Math.min(max, ceil + 0.0005 / fails ** 2); // снова пробуем через ~1 мин, после повторных неудач — реже
      if (++fastFor < 3) return false;
      if (pr < floor(Math.min(soft, ceil)) - 0.01) pr = Math.min(floor(Math.min(soft, ceil)), step(pr + 0.1));
      else if (tier > 0 && fastFor >= 6 * fails ** 2) tier--;
      else if (tier === 0 && pr < floor(ceil) - 0.01) pr = Math.min(floor(ceil), step(pr + 0.1));
    } else fastFor = 0;
    if (q() === was) return false;
    if (q() > was) upAt = now;
    at = now; fastFor = 0;
    return true;
  }
  return { feed, get tier() { return tier; }, get pr() { return pr; } };
}
