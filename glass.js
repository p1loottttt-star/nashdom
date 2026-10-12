// Жидкое стекло (как Apple Liquid Glass): у элемента .lg — карта линзы по его размеру, backdrop-filter: url(#фильтр)
// преломляет комнату у кромки. Chromium — полностью; Safari/Firefox — только размытие. body.flatglass — без преломления
// (включает автоподстройка gfx на верхней ступени и ?flatglass). Один <filter> на размер: одинаковые кнопки делят карту.
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true'); svg.style.position = 'absolute';
document.body.append(svg);

// карта: R/G = 128 ± наклон поверхности у края (по скруглённому прямоугольнику), середина плоская
function lensMap(w, h, r, bevel) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h }), x = c.getContext('2d'), img = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = i + 0.5, py = j + 0.5, cx = Math.min(Math.max(px, r), w - r), cy = Math.min(Math.max(py, r), h - r);
    let dx = px - cx, dy = py - cy, d;
    if ((px < r || px > w - r) && (py < r || py > h - r)) { const l = Math.hypot(dx, dy) || 1; d = r - l; dx /= l; dy /= l; }
    else { const e = [px, w - px, py, h - py], m = Math.min(...e), k = e.indexOf(m); d = m; dx = k === 0 ? -1 : k === 1 ? 1 : 0; dy = k === 2 ? -1 : k === 3 ? 1 : 0; }
    const s = Math.pow(Math.max(0, 1 - d / bevel), 2.2), o = (j * w + i) * 4; // у самой кромки сильнее
    img.data[o] = 128 - dx * s * 127; img.data[o + 1] = 128 - dy * s * 127; img.data[o + 2] = 128; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c.toDataURL();
}
const byKey = new Map();
export function glass(el, { scale = 46, bevel = 22 } = {}) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return;
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, h / 2, w / 2), key = `${w}x${h}x${r}`;
  let id = byKey.get(key);
  if (!id) {
    id = 'lg' + byKey.size; byKey.set(key, id);
    const f = document.createElementNS(NS, 'filter');
    for (const [k, v] of Object.entries({ id, x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
    f.innerHTML = `<feImage href="${lensMap(w, h, r, Math.min(bevel, h / 2))}" x="0" y="0" width="${w}" height="${h}" result="m" preserveAspectRatio="none"/>
      <feDisplacementMap in="SourceGraphic" in2="m" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
    svg.append(f);
  }
  el.style.setProperty('--lgf', `url(#${id})`);
}
const ro = new ResizeObserver((es) => es.forEach((e) => glass(e.target)));
export const watchGlass = (root) => (root.matches?.('.lg') ? [root] : []).concat([...root.querySelectorAll('.lg')]).forEach((e) => ro.observe(e));
