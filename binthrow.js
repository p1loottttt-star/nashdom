// бросок в мусорку: чистая математика без three — дальность от силы, вылет, снос ветром, зелёная зона шкалы
export const G = -6;
export const SWEEP = (16 * Math.PI) / 180; // размах стрелки направления, ±
export const P_BEST = 0.6; // сила, при которой комок без ветра падает в центр корзины
export const flightT = (p) => 0.7 + 0.25 * p; // время до плоскости края корзины
export const reach = (len, p) => len * (0.7 + 0.5 * p);
export const drift = (wind, T) => 0.5 * wind * T * T; // боковой снос: ветер — постоянное ускорение вбок

// скорость вылета: theta — поворот от прямой на корзину (+ вправо), p — сила 0…1, rimY — высота центра комка над краем
export function shot(from, bin, theta, p, rimY) {
  const dx = bin.x - from.x, dz = bin.z - from.z, len = Math.hypot(dx, dz);
  const d0 = [dx / len, dz / len], right = [-d0[1], d0[0]];
  const c = Math.cos(theta), s = Math.sin(theta), D = reach(len, p), T = flightT(p);
  const dir = [d0[0] * c + right[0] * s, d0[1] * c + right[1] * s];
  return { len, right, T, v: [(dir[0] * D) / T, (rimY - from.y) / T - 0.5 * G * T, (dir[1] * D) / T] };
}
// угол, при котором ветер приносит комок в центр
export const bestTheta = (len, wind, p = P_BEST) => -Math.asin(drift(wind, flightT(p)) / reach(len, p));
// зелёная зона шкалы: сила, при которой комок проходит край в пределах tol от центра; золото — середина
export function zone(len, tol) {
  const h = tol / (0.5 * len);
  return { lo: P_BEST - h, hi: P_BEST + h, glo: P_BEST - h * 0.35, ghi: P_BEST + h * 0.35 };
}
