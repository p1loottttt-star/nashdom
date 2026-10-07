// Стены и пол комнаты в рисованном мультяшном стиле: плоские цвета, мягкие мотивы, без фото-шума.
// Холсты повторяются по стене и полу (RepeatWrapping), поэтому каждая текстура бесшовная.

// детерминированный случайный ряд: одна и та же комната выглядит одинаково при каждой загрузке
function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (str) => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h; };
// рисует fn со сдвигами на размер холста: что вылезло за край, появляется с другой стороны
function wrapped(x, w, h, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { x.save(); x.translate(dx, dy); fn(); x.restore(); }
}
const dot = (x, cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
const heart = (x, cx, cy, s) => {
  x.beginPath(); x.moveTo(cx, cy + s * 0.35);
  x.bezierCurveTo(cx - s * 1.1, cy - s * 0.35, cx - s * 0.45, cy - s * 1.05, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.45, cy - s * 1.05, cx + s * 1.1, cy - s * 0.35, cx, cy + s * 0.35);
  x.fill();
};
const star = (x, cx, cy, r) => {
  x.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.48 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  x.closePath(); x.fill();
};
// широкие мягкие мазки кистью: еле заметная неровность краски (vert — мазки сверху вниз)
function brush(x, w, h, r, n, alpha, vert = false) {
  x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = r() * w, b = r() * h, len = (vert ? h : w) * (0.3 + r() * 0.4), lw = 40 + r() * 50;
    const b1 = (r() - 0.5) * 24, b2 = (r() - 0.5) * 24, col = `rgba(255,250,240,${alpha})`;
    wrapped(x, w, h, () => {
      x.strokeStyle = col; x.lineWidth = lw; x.beginPath();
      if (vert) { x.moveTo(a, b); x.bezierCurveTo(a + b1, b + len * 0.33, a + b2, b + len * 0.66, a, b + len); }
      else { x.moveTo(a, b); x.bezierCurveTo(a + len * 0.33, b + b1, a + len * 0.66, b + b2, a + len, b); }
      x.stroke();
    });
  }
}

// верх стены (холст 512×512, на стене ~1×0.6 м) и низ-панель (256×256)
export const WALLS = {
  w_rose: { up: '#ebbcb2', low: '#c98488', hearts: 0.28 },
  w_cream: { up: '#f3e3cc', low: '#cda482' },
  w_sage: { up: '#d4dec3', low: '#8fab86' },
  w_sky: { up: '#cfe0ef', low: '#87a9c6' },
  w_lavender: { up: '#e0d1ec', low: '#a68ec4' },
  w_peach: { up: '#f6c9a9', low: '#d98f6b' },
  w_night: { up: '#323a5c', low: '#20263e', stars: true },
  wp_stripes: { up: '#f7dfdc', low: '#c98488', stripes: '#efbcc3' },
  wp_dots: { up: '#f8eadf', low: '#bd8790', dots: '#eba3b2' },
  wp_hearts: { up: '#f9e2e5', low: '#c98488', hearts: 0.85 },
  wp_checks: { up: '#f6ebda', low: '#ad8b6a', checks: 'rgba(214,160,112,.32)' },
  wp_flowers: { up: '#f1f3e2', low: '#9cb48c', flowers: true },
};
export function paintWall(upCanvas, lowCanvas, id) {
  const st = WALLS[id] || WALLS.w_rose, r = rng(hash(id || 'w_rose'));
  let x = upCanvas.getContext('2d'), w = upCanvas.width, h = upCanvas.height;
  const u = w / 512; // мотивы рассчитаны на 512 px
  x.fillStyle = st.up; x.fillRect(0, 0, w, h);
  brush(x, w, h, r, 10, st.stars ? 0.018 : 0.032);

  if (st.stripes) {
    for (let i = 0; i < 8; i++) {
      const sx = (i * 64 + 18) * u;
      x.fillStyle = st.stripes; x.fillRect(sx, 0, 28 * u, h);
      x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(sx + 3 * u, 0, 3 * u, h); // мягкий блик у края полосы
      x.fillStyle = 'rgba(205,120,135,.18)'; x.fillRect(sx + 46 * u, 0, 3 * u, h); // тонкая полоска между
    }
  }
  if (st.checks) {
    x.fillStyle = st.checks;
    for (let i = 0; i < 8; i++) { x.fillRect(i * 64 * u, 0, 32 * u, h); x.fillRect(0, i * 64 * u, w, 32 * u); }
    x.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 8; i++) { x.fillRect((i * 64 + 15) * u, 0, 2 * u, h); x.fillRect(0, (i * 64 + 15) * u, w, 2 * u); }
  }
  if (st.dots) {
    for (let rw = 0; rw < 8; rw++) for (let c = 0; c < 8; c++) {
      const cx = (c * 64 + (rw % 2 ? 48 : 16)) * u, cy = (rw * 64 + 32) * u;
      x.fillStyle = st.dots; dot(x, cx, cy, 9 * u);
      x.fillStyle = 'rgba(255,255,255,.45)'; dot(x, cx - 3 * u, cy - 3 * u, 2.6 * u);
    }
  }
  if (st.stars) {
    const pts = Array.from({ length: 70 }, () => [r() * w, r() * h, r()]);
    wrapped(x, w, h, () => {
      for (const [a, b, k] of pts) {
        if (k < 0.22) { x.fillStyle = '#ffe7a3'; star(x, a, b, (7 + k * 20) * u); }
        else { x.fillStyle = `rgba(255,236,190,${0.35 + k * 0.5})`; dot(x, a, b, (1.2 + k * 1.6) * u); }
      }
    });
  }
  if (st.flowers) {
    for (let rw = 0; rw < 4; rw++) for (let c = 0; c < 4; c++) {
      const cx = (c * 128 + (rw % 2 ? 96 : 32)) * u, cy = (rw * 128 + 54) * u;
      x.strokeStyle = '#9dbd86'; x.lineWidth = 3 * u; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx, cy + 8 * u); x.quadraticCurveTo(cx + 8 * u, cy + 26 * u, cx - 2 * u, cy + 40 * u); x.stroke();
      x.fillStyle = '#a9c892'; x.beginPath(); x.ellipse(cx + 8 * u, cy + 28 * u, 7 * u, 3.5 * u, -0.5, 0, Math.PI * 2); x.fill();
      x.fillStyle = (rw + c) % 2 ? '#f3a9b8' : '#f5cf74';
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; dot(x, cx + Math.cos(a) * 9 * u, cy + Math.sin(a) * 9 * u, 7 * u); }
      x.fillStyle = '#fff4d6'; dot(x, cx, cy, 5 * u);
      x.fillStyle = 'rgba(160,190,140,.45)'; dot(x, cx + 64 * u, cy + 64 * u, 3 * u); // крошечная точка между цветами
    }
  }
  if (st.hearts) {
    const many = st.hearts > 0.5;
    const pts = many ? Array.from({ length: 16 }, (_, i) => [(i % 4) * 128 + ((i >> 2) % 2 ? 96 : 32), (i >> 2) * 128 + 64]) : [[64, 96], [320, 96], [192, 352], [448, 352]];
    pts.forEach(([a, b], i) => {
      x.fillStyle = many ? (i % 3 ? '#f0a8b8' : '#e98da2') : 'rgba(214,120,135,.32)';
      heart(x, a * u, b * u, (many ? 18 : 14) * u);
      if (many) { x.fillStyle = 'rgba(255,255,255,.4)'; dot(x, (a - 6) * u, (b - 6) * u, 2.5 * u); }
    });
  }

  // низ: панель «вагонка» — плоский цвет, пазы с тенью и бликом
  x = lowCanvas.getContext('2d'); w = lowCanvas.width; h = lowCanvas.height;
  x.fillStyle = st.low; x.fillRect(0, 0, w, h);
  for (const gx of [0, w / 2]) {
    x.fillStyle = 'rgba(40,20,25,.22)'; x.fillRect(gx - 2, 0, 4, h);
    if (gx === 0) x.fillRect(w - 2, 0, 2, h);
    x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(gx + 4, 0, 3, h);
  }
}

// пол (холст 1024×1024, на полу ~2.7×2.7 м); возвращает свойства материала
export const FLOORS = {
  f_oak: { tones: ['#c4834f', '#bc7b48', '#cb8b57', '#b87645'], grain: '125,65,30', seam: '#7f4b28' },
  f_light: { tones: ['#e3b97f', '#dcb077', '#e8c088', '#d8aa71'], grain: '165,108,55', seam: '#ac7a46' },
  f_walnut: { tones: ['#7d4c34', '#74452f', '#85533a', '#6c402b'], grain: '45,22,12', seam: '#3e2316' },
  f_herring: { tones: ['#cc935f', '#c38a57', '#d39c68', '#bd8452'], grain: '125,70,35', seam: '#86552f', herring: true },
  f_tiles: { tiles: ['#f7ebde', '#e8a2ae'], mat: { roughness: 0.3, clearcoat: 0.5, bumpScale: 0.1 } },
  f_carpet: { carpet: '#ecb6c0', mat: { roughness: 1, clearcoat: 0, bumpScale: 0.2 } },
};
// одна доска: плоский тон, 2–3 мягких волокна, блик у верхнего края
function board(x, st, r, x0, y0, len, th, along = 'x') {
  x.save();
  if (along === 'y') { x.translate(x0 + th, y0); x.rotate(Math.PI / 2); x0 = 0; y0 = 0; }
  x.beginPath(); x.rect(x0, y0, len, th); x.clip();
  x.fillStyle = st.tones[Math.floor(r() * st.tones.length)]; x.fillRect(x0, y0, len, th);
  x.lineCap = 'round';
  const n = th > 60 ? 3 : 1 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const gy = y0 + th * (0.25 + 0.5 * r()), d = th * 0.08;
    x.strokeStyle = `rgba(${st.grain},${0.16 + r() * 0.1})`; x.lineWidth = th > 60 ? 2.5 : 1.8;
    x.beginPath(); x.moveTo(x0 + len * 0.06, gy);
    x.bezierCurveTo(x0 + len * 0.35, gy + (r() - 0.5) * d * 2, x0 + len * 0.65, gy + (r() - 0.5) * d * 2, x0 + len * (0.7 + r() * 0.24), gy + (r() - 0.5) * d);
    x.stroke();
  }
  if (th > 60 && r() < 0.25) { // сучок
    x.strokeStyle = `rgba(${st.grain},.28)`; x.lineWidth = 2;
    x.beginPath(); x.ellipse(x0 + len * (0.2 + r() * 0.6), y0 + th * (0.3 + r() * 0.4), 10, 5, 0, 0, Math.PI * 2); x.stroke();
  }
  x.strokeStyle = 'rgba(255,236,200,.32)'; x.lineWidth = th > 60 ? 4 : 2.5;
  x.beginPath(); x.moveTo(x0 + 10, y0 + (th > 60 ? 9 : 5)); x.lineTo(x0 + len * (0.4 + r() * 0.3), y0 + (th > 60 ? 9 : 5)); x.stroke();
  x.restore();
}
export function paintFloor(canvas, id) {
  const st = FLOORS[id] || FLOORS.f_oak, x = canvas.getContext('2d'), w = canvas.width, r = rng(hash(id || 'f_oak'));
  if (st.tiles) {
    const n = 8, s = w / n, g = 3;
    for (let rw = 0; rw < n; rw++) for (let c = 0; c < n; c++) {
      const tx = c * s, ty = rw * s;
      x.fillStyle = st.tiles[(rw + c) % 2]; x.fillRect(tx, ty, s, s);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(tx + g + 3, ty + g + 3, s - 2 * g - 12, 4); x.fillRect(tx + g + 3, ty + g + 3, 4, s - 2 * g - 12);
      x.fillStyle = 'rgba(120,60,65,.12)'; x.fillRect(tx + g + 6, ty + s - g - 7, s - 2 * g - 9, 4); x.fillRect(tx + s - g - 7, ty + g + 6, 4, s - 2 * g - 9);
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 3; x.lineCap = 'round'; // блик
      x.beginPath(); x.moveTo(tx + s * 0.2, ty + s * 0.36); x.lineTo(tx + s * 0.36, ty + s * 0.2); x.moveTo(tx + s * 0.22, ty + s * 0.5); x.lineTo(tx + s * 0.28, ty + s * 0.44); x.stroke();
    }
    x.fillStyle = '#d8c3ba';
    for (let i = 0; i <= n; i++) { x.fillRect(i * s - g, 0, 2 * g, w); x.fillRect(0, i * s - g, w, 2 * g); }
  } else if (st.carpet) {
    x.fillStyle = st.carpet; x.fillRect(0, 0, w, w);
    const n = 16, s = w / n, loops = [];
    for (let rw = 0; rw < n; rw++) for (let c = 0; c < n; c++) loops.push([(c + 0.5 + (rw % 2) * 0.5) * s + (r() - 0.5) * s * 0.4, (rw + 0.5) * s + (r() - 0.5) * s * 0.4, r() * Math.PI * 2, r() < 0.5]);
    x.lineWidth = 4; x.lineCap = 'round';
    wrapped(x, w, w, () => {
      for (const [a, b, ang, light] of loops) {
        x.strokeStyle = light ? 'rgba(255,240,244,.6)' : 'rgba(190,105,125,.26)';
        x.beginPath(); x.arc(a, b, 10, ang, ang + 2.2); x.stroke();
      }
    });
  } else if (st.herring) {
    // ёлочка: «лесенка» пар доска-лёжа/доска-стоя под 45°; после поворота решётка становится (0,64) и (256,0) px — кратна холсту
    const T = 64 / Math.SQRT2, L = 4 * T;
    x.fillStyle = st.seam; x.fillRect(0, 0, w, w);
    for (let a = -8; a < w / 64 + 8; a++) for (let b = -w / 256 - 2; b < 3; b++) {
      const X = -256 * b, Y = 64 * a; // положение точки решётки на холсте
      if (X < -300 || X > w + 300 || Y < -300 || Y > w + 300) continue;
      // тон и волокна зависят от положения по модулю холста — у края тайла доска совпадает с собой
      const k = hash(id) ^ Math.imul(((X % w) + w) % w, 7919) ^ Math.imul(((Y % w) + w) % w, 104729);
      const px = a * T - b * L, py = a * T + b * L;
      x.save(); x.rotate(Math.PI / 4);
      board(x, st, rng(k), px + 1.5, py + 1.5, L - 3, T - 3);
      board(x, st, rng(k + 1), px + 1.5, py + T + 1.5, L - 3, T - 3, 'y');
      x.restore();
    }
  } else {
    const rows = 8, rh = w / rows;
    for (let rw = 0; rw < rows; rw++) {
      const y = rw * rh;
      let pos = r() * w; const end = pos + w;
      while (pos < end - 1) {
        let len = 300 + r() * 260; if (end - pos - len < 200) len = end - pos;
        const k = hash(id) + rw * 97 + Math.floor(pos);
        for (const dx of [0, -w]) board(x, st, rng(k), pos + dx, y, len, rh);
        x.fillStyle = st.seam;
        for (const dx of [0, -w]) x.fillRect(pos + dx - 2, y, 4, rh);
        pos += len;
      }
      x.fillStyle = st.seam; x.fillRect(0, y + rh - 4, w, 4);
    }
  }
  return { roughness: 0.55, clearcoat: 0.25, bumpScale: 0.15, ...st.mat };
}
// образцы для кнопок выбора
export const swatch = (id) => (WALLS[id]?.up || (FLOORS[id]?.tones?.[0] ?? FLOORS[id]?.tiles?.[1] ?? FLOORS[id]?.carpet) || '#ccc');
