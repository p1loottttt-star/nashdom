// Жидкое стекло для прототипов: у каждого элемента .lg — своя карта смещения (линза по краю, как у Apple Liquid Glass),
// backdrop-filter: url(#фильтр) преломляет фон у кромки. Хром — полностью, Safari/Firefox — только размытие (класс .lg остаётся стеклом).
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
document.body.append(svg);

// карта: R/G = 128 ± наклон поверхности у края (по скруглённому прямоугольнику), середина плоская
function lensMap(w, h, r, bevel) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h }), x = c.getContext('2d'), img = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    // расстояние до края скруглённого прямоугольника и направление нормали
    const px = i + 0.5, py = j + 0.5, cx = Math.min(Math.max(px, r), w - r), cy = Math.min(Math.max(py, r), h - r);
    let dx = px - cx, dy = py - cy, d;
    const inCorner = (px < r || px > w - r) && (py < r || py > h - r);
    if (inCorner) { const l = Math.hypot(dx, dy) || 1; d = r - l; dx /= l; dy /= l; }
    else { const e = [px, w - px, py, h - py], m = Math.min(...e), k = e.indexOf(m); d = m; dx = k === 0 ? -1 : k === 1 ? 1 : 0; dy = k === 2 ? -1 : k === 3 ? 1 : 0; }
    const t = Math.max(0, 1 - d / bevel), s = Math.pow(t, 2.2); // у самой кромки сильнее
    const o = (j * w + i) * 4;
    img.data[o] = 128 - dx * s * 127; img.data[o + 1] = 128 - dy * s * 127; img.data[o + 2] = 128; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c.toDataURL();
}
let n = 0;
export function glass(el, { scale = 46, blur = 3, sat = 1.7, bevel = 22 } = {}) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h) return;
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, h / 2, w / 2), id = 'lg' + n++;
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', id); f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '100%'); f.setAttribute('height', '100%'); f.setAttribute('color-interpolation-filters', 'sRGB');
  f.innerHTML = `<feImage href="${lensMap(w, h, r, Math.min(bevel, h / 2))}" x="0" y="0" width="${w}" height="${h}" result="m" preserveAspectRatio="none"/>
    <feDisplacementMap in="SourceGraphic" in2="m" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
  svg.append(f);
  el.style.backdropFilter = `url(#${id}) blur(${blur}px) saturate(${sat})`;
}
export const glassAll = (root = document, opts) => root.querySelectorAll('.lg').forEach((e) => glass(e, { ...opts, ...(e.dataset.lg ? JSON.parse(e.dataset.lg) : {}) }));
