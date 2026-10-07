// Мебель и вещи «Нашего дома» в мультяшном стиле (эталон — lab/cartoon.js, набор — toon.js):
// тун-материалы из палитры P, пухлые скруглённые формы, рисованные холсты крупными пятнами без мелкого шума
// (мелкий шум мерцает при движении камеры). Обводку добавляет toonify в room.js.
// Каждый build() отдаёт новую независимую группу (свои геометрии, материалы, текстуры); анимация — group.userData.update(dt, t).
import * as THREE from 'three';
import { P, toon, G, canvasTex, blob, heartPath, bake } from './toon.js';
import * as lofi from './lofi.js';

export const TOP = 0.775; // поверхность стола

// ---------- помощники ----------
const PI = Math.PI, rnd = Math.random, rr = (a, b) => a + (b - a) * rnd();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const M = (color, o = {}) => toon({ color, ...o });
const glow = (color) => new THREE.MeshBasicMaterial({ color });
const rbox = (w, h, d, r = 0.015) => G.rbox(w, h, d, r, 3);
const shade = (hex, dl, ds = 0) => '#' + new THREE.Color(hex).offsetHSL(0, ds, dl).getHexString();
const lum = (hex) => { const c = new THREE.Color(hex); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; };
const WARM = [[1, 0.82, 0.5], [1, 0.62, 0.72], [1, 0.9, 0.66]];
const CAVEAT = (px) => `700 ${px}px Caveat, cursive`;

function add(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
// светящиеся и прозрачные части: без теней
const unlit = (m) => { m.castShadow = m.receiveShadow = false; return m; };
const softDot = () => canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});
function halo(color, size, opacity, map) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}
// дерево как в лаборатории: ровный цвет и несколько мягких широких волокон; крашеное (светлое/тёмное) — почти гладкое
function woodTex(hex) {
  const L = lum(hex), painted = L > 0.82 || L < 0.35, dark = shade(hex, -0.13), light = shade(hex, 0.09);
  return canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = hex; x.fillRect(0, 0, w, h);
    for (let i = 0; i < (painted ? 6 : 14); i++) {
      const y0 = rr(0, h); x.strokeStyle = (i % 2 ? dark : light) + (painted ? '33' : i % 2 ? '55' : '88'); x.lineWidth = rr(2, 4.5);
      x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(w * 0.3, y0 + rr(-12, 12), w * 0.6, y0 + rr(-12, 12), w, y0 + rr(-6, 6)); x.stroke();
    }
    if (!painted) { x.fillStyle = dark + '44'; x.beginPath(); x.ellipse(w * 0.8, h * 0.3, 11, 5, 0, 0, 7); x.fill(); }
  });
}
// цилиндр от точки a (верх) до точки b (низ)
function strut(parent, mat, a, b, rTop, rBot, seg = 12) {
  const d = V().subVectors(a, b), len = d.length();
  const m = add(G.cyl(rTop, rBot, len, seg), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}
const heartGeo = (s, d) => { const g = G.heart(s, d, s > 0.04 ? 20 : 10); g.center(); return g; };
// огоньки одним InstancedMesh: мерцают; возвращает tick(t)
function twinkler(points, size, palette, parent) {
  const im = new THREE.InstancedMesh(G.sph(size, 8, 6), new THREE.MeshBasicMaterial(), points.length);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  const seed = points.map((p, i) => { im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)); return { col: palette[i % palette.length], ph: rnd() * 6.3, w: 0.8 + rnd() * 2.4 }; });
  im.computeBoundingSphere(); unlit(im); parent.add(im);
  const tick = (t) => {
    seed.forEach((s, i) => { const k = 0.6 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.w + s.ph)) ** 2; im.setColorAt(i, c.setRGB(s.col[0] * k, s.col[1] * k, s.col[2] * k)); });
    im.instanceColor.needsUpdate = true;
  };
  tick(0);
  return tick;
}
// горшок с бортиком и землёй (как в лаборатории); верх земли — на высоте h
function pot(g, r, h, color, soil = '#7a4b32') {
  add(G.lathe([[0, 0], [r * 0.78, 0], [r * 0.92, h * 0.82], [r, h * 0.86], [r, h + 0.012], [r * 0.86, h + 0.012], [0, h]], 24), M(color), 0, 0, 0, g);
  add(G.cyl(r * 0.86, r * 0.86, 0.006, 20), M(soil), 0, h + 0.004, 0, g).castShadow = false;
}

// ---------- столы ----------
export const DESKS = {
  classic: { title: 'Классический', width: 1.9, thick: 0.065 }, // 4 круглые ножки, юбка с ящиком
  compact: { title: 'Компактный', width: 1.7, thick: 0.05 }, // прямые ножки, ящик под столешницей
  scandi: { title: 'Скандинавский', width: 1.9, thick: 0.05 }, // разведённые конусные ножки, маленький ящик
  worker: { title: 'Рабочий', width: 2.2, thick: 0.065 }, // тумба с тремя ящиками слева, две ножки справа
  shelves: { title: 'С полками', width: 1.9, thick: 0.065 }, // открытый стеллаж справа, две ножки слева
  loft: { title: 'Лофт', width: 2.0, thick: 0.075 }, // сливовая рама, толстая столешница
};
export const DESK_COLORS = { oak: P.wood, walnut: '#b5774c', white: P.cream, pink: '#f6b3c3', mint: '#a9dcc6', black: P.plum };
const BOOK_COLORS = [P.rose, P.sageD, P.butter, P.lav, P.coral, P.sky, P.mint, P.pink];

// книга корешком вперёд: обложка + выступающий по бокам блок страниц + две полоски на корешке
function book(parent, x, y, z, w, h, d, col, rz = 0) {
  const b = new THREE.Group(); b.position.set(x, y, z); b.rotation.z = rz; parent.add(b);
  add(rbox(w, h, d, Math.min(0.007, w / 3)), M(col), 0, h / 2, 0, b);
  add(new THREE.BoxGeometry(w + 0.003, h - 0.012, d - 0.016), M(P.paper), 0, h / 2, -0.004, b).userData.noOutline = true;
  for (const k of [0.8, 0.22]) add(new THREE.BoxGeometry(w + 0.002, Math.min(0.012, h * 0.08), 0.004), M(P.cream), 0, h * k, d / 2, b).userData.noOutline = true;
  return b;
}

export function buildDesk(id, color = 'oak') {
  if (!DESKS[id]) id = 'classic';
  const { width: W, thick: T } = DESKS[id], half = W / 2, ZC = -1.5;
  const hex = DESK_COLORS[color] || (/^#[0-9a-f]{6}$/i.test(color || '') ? color : DESK_COLORS.oak);
  const group = new THREE.Group(); group.name = 'desk:' + id;
  const top = M('#ffffff', { map: woodTex(hex) }), body = M(shade(hex, -0.07)), light = M(shade(hex, 0.07)), knob = M(P.cream), frame = M(P.plum);
  const legs = [], floorBlocks = [], surfaces = [];
  const put = (geo, mat, x, y, z) => add(geo, mat, x, y, z, group);
  const U = TOP - T; // низ столешницы
  const surface = (m) => { m.userData.surface = true; surfaces.push(m); return m; };
  surface(put(rbox(W, T, 0.8, Math.min(0.028, T / 2 - 0.002)), top, 0, TOP - T / 2, ZC));
  // круглая ножка с конусом и светлой «пяткой»
  const leg = (x, z, rt = 0.04, rb = 0.028) => {
    put(G.cyl(rt, rb, U, 16), body, x, U / 2, z);
    put(G.cyl(rb + 0.006, rb + 0.006, 0.02, 16), light, x, 0.01, z);
    legs.push([x, z]);
  };
  const apron = (x0, x1, z = -1.14) => put(rbox(x1 - x0, 0.09, 0.03, 0.012), body, (x0 + x1) / 2, U - 0.045, z);
  // фасад ящика (светлее) с круглой ручкой
  const drawer = (x, w, y, h, z = -1.13) => {
    put(rbox(w, h, 0.024, Math.min(0.012, h / 3)), light, x, y, z);
    put(G.sph(0.016, 14, 10), knob, x, y, z + 0.02);
  };

  if (id === 'classic') {
    put(rbox(W - 0.2, 0.09, 0.66, 0.02), body, 0, U - 0.045, ZC); // юбка
    drawer(0.45, 0.52, U - 0.045, 0.072, ZC + 0.342);
    for (const [x, z] of [[-0.86, -1.17], [0.86, -1.17], [-0.86, -1.83], [0.86, -1.83]]) leg(x, z);
  } else if (id === 'compact') {
    for (const x of [-0.79, 0.79]) for (const z of [-1.17, -1.83]) leg(x, z, 0.026, 0.022);
    put(rbox(1.5, 0.06, 0.025, 0.01), body, 0, U - 0.03, -1.83); // задняя царга
    put(rbox(0.54, 0.1, 0.66, 0.018), body, 0.4, U - 0.05, ZC); // короб ящика
    drawer(0.4, 0.5, U - 0.05, 0.078, ZC + 0.342);
  } else if (id === 'scandi') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const b = V(sx * 0.87, 0, ZC + sz * 0.36);
      strut(group, body, V(sx * 0.8, U, ZC + sz * 0.3), b, 0.03, 0.017, 14);
      legs.push([b.x, b.z]);
    }
    for (const sx of [-1, 1]) put(rbox(0.035, 0.05, 0.62, 0.012), body, sx * 0.8, U - 0.025, ZC);
    put(rbox(1.6, 0.05, 0.03, 0.012), body, 0, U - 0.025, -1.8);
    put(rbox(0.42, 0.07, 0.58, 0.016), body, 0.45, U - 0.035, -1.48);
    drawer(0.45, 0.38, U - 0.035, 0.054, -1.178);
  } else if (id === 'worker') {
    const px0 = -half + 0.02, px1 = -half + 0.49, pw = px1 - px0, pc = (px0 + px1) / 2;
    put(rbox(pw, U, 0.72, 0.022), body, pc, U / 2, ZC); // тумба
    floorBlocks.push({ x0: px0, x1: px1, z0: -1.86, z1: -1.14 });
    const dh = (U - 0.06) / 3;
    for (let i = 0; i < 3; i++) drawer(pc, pw - 0.05, 0.06 + dh * (i + 0.5), dh - 0.02, -1.13);
    leg(half - 0.07, -1.17); leg(half - 0.07, -1.83);
    apron(px1, half - 0.07);
  } else if (id === 'shelves') {
    const sx0 = half - 0.49, sx1 = half - 0.02, sc = (sx0 + sx1) / 2, sw = sx1 - sx0, p = 0.03, bw = sw - 2 * p;
    for (const x of [sx0 + p / 2, sx1 - p / 2]) put(rbox(p, U, 0.74, 0.012), body, x, U / 2, ZC);
    put(new THREE.BoxGeometry(bw, U, 0.012), body, sc, U / 2, -1.864).userData.noOutline = true; // задняя стенка
    floorBlocks.push({ x0: sx0, x1: sx1, z0: -1.87, z1: -1.13 });
    const ys = [0.05, 0.38];
    for (const y of ys) surface(put(rbox(bw, 0.028, 0.72, 0.01), light, sc, y, -1.505));
    // книги: ряд внизу, три и стопка наверху; передняя половина полок свободна
    let x = sx0 + p + 0.012;
    for (let i = 0; i < 5; i++) { const w = 0.03 + (i % 3) * 0.008; book(group, x + w / 2, ys[0] + 0.014, -1.66, w, 0.2 + ((i * 37) % 5) * 0.015, 0.16, BOOK_COLORS[i]); x += w + 0.004; }
    book(group, x + 0.04, ys[0] + 0.014, -1.66, 0.03, 0.2, 0.15, BOOK_COLORS[5], -0.3); // наклонилась
    x = sx0 + p + 0.012;
    for (let i = 0; i < 3; i++) { const w = 0.034 + (i % 2) * 0.01; book(group, x + w / 2, ys[1] + 0.014, -1.66, w, 0.22 + i * 0.012, 0.16, BOOK_COLORS[(i + 3) % 8]); x += w + 0.004; }
    let y = ys[1] + 0.014;
    for (let i = 0; i < 2; i++) { add(rbox(0.17, 0.034, 0.13, 0.008), M(BOOK_COLORS[i * 2 + 1]), sx1 - p - 0.1, y + 0.017, -1.7, group).rotation.y = (i - 0.5) * 0.15; y += 0.034; }
    leg(-half + 0.07, -1.17); leg(-half + 0.07, -1.83);
    apron(-half + 0.07, sx0);
  } else if (id === 'loft') {
    for (const sx of [-1, 1]) {
      const x = sx * (half - 0.09);
      for (const z of [-1.17, -1.83]) { put(rbox(0.05, U, 0.05, 0.016), frame, x, U / 2, z); legs.push([x, z]); }
      put(rbox(0.05, 0.045, 0.74, 0.016), frame, x, U - 0.0225, ZC); // верхняя перекладина
      put(rbox(0.06, 0.035, 0.78, 0.014), frame, x, 0.0175, ZC); // опора на полу
    }
    put(rbox(W - 0.18, 0.04, 0.04, 0.014), frame, 0, 0.5, -1.83); // поперечина сзади, выше кошки
  }

  bake(group); // ножки, юбка, ящики → один меш (столешница и полки остаются: по ним ставят вещи)
  function dispose() {
    group.traverse((o) => {
      o.geometry?.dispose();
      if (o.userData.isOutline) return; // материал обводки общий (toon.js)
      for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
    });
    group.removeFromParent();
  }
  return { group, half, floorBlocks, legs, surfaces, dispose };
}

// ---------- предметы на стол / полку ----------
function cactus() {
  const g = new THREE.Group();
  pot(g, 0.042, 0.058, P.terra);
  add(new THREE.CapsuleGeometry(0.027, 0.055, 6, 14), M(P.leaf), 0, 0.118, 0, g);
  for (const [s, y, l] of [[1, 0.104, 0.024], [-1, 0.128, 0.016]]) {
    add(new THREE.CapsuleGeometry(0.011, 0.012, 4, 10), M(P.leafL), s * 0.03, y, 0, g).rotation.z = PI / 2;
    add(new THREE.CapsuleGeometry(0.012, l, 4, 10), M(P.leafL), s * 0.042, y + l / 2 + 0.006, 0, g);
  }
  add(G.sph(0.016, 14, 10), M(P.pink), 0, 0.176, 0, g).scale.y = 0.65; // цветок
  add(G.sph(0.006, 8, 6), M(P.butter), 0, 0.184, 0, g);
  return g;
}

// три свечи на подставке, пламя дрожит
function candles() {
  const g = new THREE.Group(), dot = softDot();
  add(G.cyl(0.064, 0.066, 0.014, 28), M(P.butter), 0, 0.007, 0, g);
  const flames = [];
  for (const [x, z, h, r, col] of [[-0.02, 0.014, 0.09, 0.022, P.paper], [0.026, 0.016, 0.064, 0.02, P.pinkL], [0.004, -0.026, 0.046, 0.024, P.cream]]) {
    add(G.lathe([[0, 0], [r, 0], [r, h - 0.006], [r * 0.82, h], [0, h]], 20), M(col), x, 0.014, z, g);
    const top = 0.014 + h;
    add(G.cyl(0.0018, 0.0018, 0.01, 5), M(P.plum), x, top + 0.004, z, g).castShadow = false;
    const fl = unlit(add(G.sph(1, 12, 8), glow('#ffcf6e'), x, top + 0.018, z, g));
    fl.scale.set(0.008, 0.016, 0.008);
    const hl = halo('#ffb36b', 0.08, 0.35, dot); hl.position.set(x, top + 0.018, z); g.add(hl);
    flames.push({ fl, hl, ph: rnd() * 10 });
  }
  g.userData.update = (dt, t) => {
    for (const { fl, hl, ph } of flames) {
      const k = 1 + 0.14 * Math.sin(t * 13 + ph) + 0.08 * Math.sin(t * 29 + ph * 2);
      fl.scale.set(0.008, 0.016 * k, 0.008); fl.rotation.z = Math.sin(t * 7 + ph) * 0.08;
      hl.material.opacity = 0.3 * k;
    }
  };
  return g;
}

// глобус с сердечками, медленно крутится
function globe() {
  const g = new THREE.Group(), b = M(P.butter);
  const map = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = P.sky; x.fillRect(0, 0, w, h);
    for (let c = 0; c < 6; c++) {
      const cx = 50 + rnd() * (w - 100), cy = 60 + rnd() * 130; x.fillStyle = c % 2 ? P.butter : P.sageL;
      for (let i = 0; i < 6; i++) blob(x, cx + rr(-40, 40), cy + rr(-24, 24), rr(16, 30));
    }
    x.fillStyle = P.rose; for (let i = 0; i < 4; i++) { heartPath(x, 60 + i * 120 + rr(0, 30), rr(70, 190), 16); x.fill(); }
  });
  add(G.lathe([[0, 0], [0.05, 0], [0.05, 0.01], [0.034, 0.018], [0.01, 0.024], [0, 0.024]], 24), b, 0, 0, 0, g);
  add(G.cyl(0.006, 0.006, 0.02, 8), b, 0, 0.032, 0, g);
  const axis = new THREE.Group(); axis.position.y = 0.112; axis.rotation.z = 0.41; g.add(axis);
  const ball = add(G.sph(0.072, 32, 20), M('#ffffff', { map }), 0, 0, 0, axis);
  ball.rotation.y = rnd() * 6;
  add(new THREE.TorusGeometry(0.081, 0.0055, 8, 40, PI), b, 0, 0, 0, axis).rotation.set(0, 0.5, -PI / 2);
  g.userData.update = (dt) => { ball.rotation.y += dt * 0.15; };
  return g;
}

// открытая коробка конфет-сердце
function choco() {
  const g = new THREE.Group(), flat = (s, d) => heartGeo(s, d).rotateX(-PI / 2); // толщина сердца = 2d (фаска)
  add(flat(0.07, 0.004), M(P.rose), 0.008, 0.004, -0.018, g).rotation.y = 0.14; // крышка снизу
  add(flat(0.067, 0.016), M(P.rose), 0, 0.02, 0, g);
  add(flat(0.058, 0.0015), M(P.butter), 0, 0.037, 0, g).userData.noOutline = true;
  const bon = G.sph(1, 14, 10), BROWN = ['#8a5537', '#6b3e28', '#a8693f'];
  [[0, 0.004], [-0.038, 0.026], [0.038, 0.026], [-0.021, -0.022], [0.021, -0.022], [0, -0.04]].forEach(([x, y], i) => {
    add(bon, M(BROWN[i % 3]), x, 0.043, -y, g).scale.set(0.011, 0.007, 0.011);
  });
  return g;
}

// плюшевый мишка с сердцем: большая голова, пухлые лапы
function teddy() {
  const g = new THREE.Group(), fur = M('#e3a97c'), light = M(P.cream), dark = M(P.ink), ball = G.sph(1, 20, 14);
  const part = (mat, x, y, z, sx, sy, sz, rz = 0, rx = 0) => { const m = add(ball, mat, x, y, z, g); m.scale.set(sx, sy, sz); m.rotation.set(rx, 0, rz); return m; };
  part(fur, 0, 0.058, 0, 0.054, 0.058, 0.05); // туловище
  part(light, 0, 0.052, 0.034, 0.034, 0.036, 0.02); // животик
  for (const s of [-1, 1]) {
    part(fur, s * 0.034, 0.02, 0.032, 0.024, 0.02, 0.034); // лапы
    part(light, s * 0.034, 0.02, 0.064, 0.014, 0.014, 0.005);
    part(fur, s * 0.054, 0.07, 0.016, 0.019, 0.032, 0.019, s * 0.45, -0.3); // ручки
    part(fur, s * 0.04, 0.198, -0.004, 0.02, 0.02, 0.012); // ушки
    part(light, s * 0.04, 0.198, 0.005, 0.011, 0.011, 0.005);
    part(dark, s * 0.019, 0.165, 0.048, 0.006, 0.0075, 0.004); // глазки
    part(M(P.pinkL), s * 0.033, 0.15, 0.044, 0.009, 0.006, 0.004); // щёчки
  }
  part(fur, 0, 0.152, 0, 0.056, 0.052, 0.05); // голова
  part(light, 0, 0.14, 0.04, 0.024, 0.018, 0.016); // мордочка
  part(dark, 0, 0.149, 0.056, 0.008, 0.006, 0.005); // нос
  add(heartGeo(0.03, 0.012), M(P.rose), 0, 0.066, 0.058, g);
  return g;
}

// букет в вазе: пухлые цветы-шарики с серединкой и листья
function flowers() {
  const g = new THREE.Group();
  add(G.lathe([[0, 0], [0.036, 0], [0.048, 0.045], [0.042, 0.095], [0.026, 0.125], [0.032, 0.138], [0.026, 0.14], [0.02, 0.125]], 24), M(P.pinkL), 0, 0, 0, g);
  const stemM = M(P.leafD), ball = G.sph(1, 14, 10);
  const COL = [P.pink, P.butter, P.white, P.coral, P.rose, P.lav, P.white];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4 + 0.3, r = i ? 0.035 + (i % 3) * 0.018 : 0, h = 0.31 - r * 0.9 + (i % 2) * 0.02;
    const end = V(Math.cos(a) * r, h, Math.sin(a) * r * 0.8);
    add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0, 0.1, 0), V(end.x * 0.4, h * 0.6, end.z * 0.4), end), 6, 0.0035, 5), stemM, 0, 0, 0, g);
    add(ball, M(COL[i]), end.x, end.y, end.z, g).scale.set(0.028, 0.02, 0.028);
    add(ball, M(i % 2 ? P.butter : P.coral), end.x, end.y + 0.016, end.z, g).scale.setScalar(0.008);
    if (i % 2) add(G.leaf(0.06, 0.03, 0.3, 0.2), M(P.leaf), end.x * 0.6, h * 0.55, end.z * 0.6, g).rotation.set(0, -a, (i % 4 ? 1 : -1) * 0.8);
  }
  return g;
}

// шкатулка с кольцом, камень поблёскивает
function ring() {
  const g = new THREE.Group(), velvet = M(P.rose), satin = M(P.cream);
  add(rbox(0.062, 0.034, 0.056, 0.012), velvet, 0, 0.017, 0, g);
  add(rbox(0.05, 0.01, 0.044, 0.004), satin, 0, 0.034, 0, g);
  const hinge = new THREE.Group(); hinge.position.set(0, 0.034, -0.028); hinge.rotation.x = -1.9; g.add(hinge);
  add(rbox(0.062, 0.02, 0.056, 0.01), velvet, 0, 0.01, 0.028, hinge);
  add(rbox(0.05, 0.004, 0.044, 0.002), satin, 0, -0.001, 0.028, hinge);
  add(new THREE.TorusGeometry(0.012, 0.0035, 10, 28), M(P.butter), 0, 0.05, 0, g);
  add(new THREE.OctahedronGeometry(0.008), M(P.sky, { emissive: new THREE.Color('#bfe6ff'), emissiveIntensity: 0.4 }), 0, 0.068, 0, g);
  const star = canvasTex(64, 64, (x) => { // блик-звёздочка
    x.translate(32, 32);
    for (const [a, l] of [[0, 31], [PI / 2, 31], [PI / 4, 14], [-PI / 4, 14]]) {
      x.save(); x.rotate(a);
      const gr = x.createLinearGradient(-l, 0, l, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(-l, -1.5, 2 * l, 3); x.restore();
    }
  });
  const glint = halo('#ffffff', 0.055, 0, star); glint.position.set(0.003, 0.071, 0.005); g.add(glint);
  const ph = rnd() * 6;
  g.userData.update = (dt, t) => { glint.material.opacity = Math.max(0, Math.sin(t * 1.7 + ph)) ** 10; glint.material.rotation = t * 0.6; };
  return g;
}

// шарик-сердце на грузике, парит в ~0.5 м над ним и качается
function balloon() {
  const g = new THREE.Group();
  add(rbox(0.03, 0.026, 0.03, 0.01), M(P.rose), 0, 0.013, 0, g); // грузик
  const b = new THREE.Group(); g.add(b);
  const geo = heartGeo(0.11, 0.05); geo.computeBoundingBox();
  add(geo, M(P.pink), 0, 0, 0, b);
  const knot = V(0, geo.boundingBox.min.y + 0.008, 0), Y0 = 0.5;
  add(G.sph(0.009, 10, 8), M(P.rose), knot.x, knot.y - 0.006, knot.z, b);
  const N = 14, pos = new Float32Array(N * 3), strGeo = new THREE.BufferGeometry();
  strGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const str = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: P.plum })); str.frustumCulled = false; g.add(str);
  const A = V(0, 0.026, 0), B = V(), C = V(), Q = V(), ph = rnd() * 6;
  g.userData.update = (dt, t) => {
    t += ph;
    b.position.set(0.03, Y0 + Math.sin(t * 1.1) * 0.03, -0.02);
    b.rotation.set(0, Math.sin(t * 0.45) * 0.3, Math.sin(t * 0.8) * 0.07);
    b.updateMatrix(); B.copy(knot).applyMatrix4(b.matrix);
    C.lerpVectors(A, B, 0.5).add(Q.set(Math.sin(t * 0.9) * 0.03, -0.06, 0));
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), a = (1 - u) ** 2, m = 2 * u * (1 - u), c = u * u;
      pos.set([A.x * a + C.x * m + B.x * c, A.y * a + C.y * m + B.y * c, A.z * a + C.z * m + B.z * c], i * 3);
    }
    strGeo.attributes.position.needsUpdate = true;
  };
  g.userData.update(0, 0);
  return g;
}

// суккулент-розетка в кремовом горшке
function succulent() {
  const g = new THREE.Group();
  pot(g, 0.045, 0.048, P.cream);
  const leaf = G.sph(1, 12, 8), mats = [P.sageD, P.sage, P.mint].map((c) => M(c));
  [[9, 0.012, 0.25, 0.028], [7, 0.008, 0.6, 0.023], [5, 0.004, 1.0, 0.017]].forEach(([n, rr2, tilt, len], ring) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + ring * 0.45, out = rr2 + len * Math.cos(tilt) * 0.9;
      const l = add(leaf, mats[ring], Math.cos(a) * out, 0.06 + len * Math.sin(tilt) * 0.9 + ring * 0.004, Math.sin(a) * out, g);
      l.scale.set(len * 0.6, len * 0.28, len); l.rotation.set(-tilt, PI / 2 - a, 0, 'YXZ');
    }
  });
  for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; add(leaf, M(P.pink), Math.cos(a) * 0.058, 0.066, Math.sin(a) * 0.058, g).scale.setScalar(0.004); } // розовые кончики
  return g;
}

// стопка из четырёх книг, корешками вперёд
function books() {
  const g = new THREE.Group();
  let y = 0;
  for (const [w, h, d, c, ry] of [[0.21, 0.038, 0.15, P.rose, 0.05], [0.19, 0.03, 0.14, P.sageD, -0.1], [0.17, 0.042, 0.125, P.butter, 0.12], [0.14, 0.028, 0.105, P.lav, -0.06]]) {
    const b = new THREE.Group(); b.position.y = y; b.rotation.y = ry; g.add(b);
    add(rbox(w, h, d, 0.008), M(c), 0, h / 2, 0, b);
    add(new THREE.BoxGeometry(w - 0.016, h - 0.012, d + 0.003), M(P.paper), -0.004, h / 2, 0, b).userData.noOutline = true; // страницы видны сбоку
    add(new THREE.BoxGeometry(w * 0.5, 0.006, 0.003), M(P.cream), 0, h / 2, d / 2 + 0.001, b).userData.noOutline = true; // полоска на корешке
    y += h;
  }
  return g;
}

// тюльпаны в розовой вазе
function vase_tulips() {
  const g = new THREE.Group();
  add(G.lathe([[0, 0], [0.037, 0], [0.052, 0.04], [0.05, 0.09], [0.032, 0.13], [0.036, 0.145], [0.03, 0.147], [0.026, 0.13]], 24), M(P.pink), 0, 0, 0, g);
  const stemM = M(P.leafD);
  const cup = G.lathe([[0, 0], [0.014, 0.003], [0.021, 0.016], [0.02, 0.032], [0.014, 0.045]], 16);
  const COL = [P.rose, P.pinkL, P.white, P.coral, P.butter];
  for (let i = 0; i < 5; i++) {
    const a = i * 2.5 + 0.4, r = i ? 0.04 + (i % 2) * 0.015 : 0, h = 0.3 - r * 0.8 + (i % 2) * 0.02;
    const end = V(Math.cos(a) * r, h, Math.sin(a) * r * 0.8);
    add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0, 0.12, 0), V(end.x * 0.3, h * 0.65, end.z * 0.3), end), 8, 0.0035, 5), stemM, 0, 0, 0, g);
    add(cup, M(COL[i], { side: THREE.DoubleSide }), end.x, end.y - 0.006, end.z, g).rotation.set(end.z * 3, 0, -end.x * 3);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 1;
    add(G.leaf(0.13, 0.035, 0.4, 0.15), M(P.leaf), Math.cos(a) * 0.02, 0.13, Math.sin(a) * 0.02, g).rotation.set(-0.25, -a + PI / 2, 0, 'YXZ');
  }
  return g;
}

// лава-лампа: светящиеся капли поднимаются и опускаются
function lava() {
  const g = new THREE.Group(), metal = M(P.plum);
  add(G.lathe([[0, 0], [0.052, 0], [0.052, 0.01], [0.032, 0.075], [0, 0.075]], 24), metal, 0, 0, 0, g);
  const GL = [[0.031, 0.075], [0.04, 0.15], [0.036, 0.2], [0.022, 0.245]];
  unlit(add(G.lathe(GL.map(([r, y]) => [r - 0.003, y]), 24), new THREE.MeshBasicMaterial({ color: '#f6a7c1', transparent: true, opacity: 0.6, depthWrite: false }), 0, 0, 0, g));
  add(G.lathe([[0.022, 0.245], [0.018, 0.28], [0, 0.285]], 20), metal, 0, 0, 0, g); // крышка
  const R = (y) => { for (let i = 1; i < GL.length; i++) if (y <= GL[i][1]) { const k = (y - GL[i - 1][1]) / (GL[i][1] - GL[i - 1][1]); return GL[i - 1][0] + (GL[i][0] - GL[i - 1][0]) * k; } return GL[GL.length - 1][0]; };
  const mat = glow('#ffd36e'), geo = G.sph(1, 14, 10);
  const blobs = Array.from({ length: 5 }, (_, i) => ({ m: unlit(add(geo, mat, 0, 0.1, 0, g)), ph: rnd() * 6.3, w: 0.25 + rnd() * 0.25, r: 0.009 + (i % 3) * 0.003 }));
  g.userData.update = (dt, t) => {
    for (const b of blobs) {
      const k = 0.5 + 0.5 * Math.sin(t * b.w + b.ph), y = 0.092 + k * 0.13, s = Math.min(b.r * (1 + 0.15 * Math.sin(t * 1.7 + b.ph)), R(y) - 0.006);
      b.m.position.set(Math.cos(b.ph) * R(y) * 0.3, y, Math.sin(b.ph) * R(y) * 0.3);
      b.m.scale.set(s, s * (1.1 + 0.3 * Math.cos(t * 1.3 + b.ph)), s);
    }
  };
  g.userData.update(0, 0);
  return g;
}

// фарфоровая кошечка сидит, глаза-улыбки
function cat_fig() {
  const g = new THREE.Group(), cer = M(P.white), pink = M(P.pinkL), ink = M(P.ink), ball = G.sph(1, 20, 14);
  const part = (mat, x, y, z, sx, sy, sz) => { const m = add(ball, mat, x, y, z, g); m.scale.set(sx, sy, sz); return m; };
  part(cer, 0, 0.046, -0.005, 0.044, 0.048, 0.038); // туловище
  part(cer, 0, 0.112, 0.004, 0.04, 0.034, 0.034); // голова
  for (const s of [-1, 1]) {
    add(new THREE.ConeGeometry(0.014, 0.026, 12), cer, s * 0.022, 0.142, 0.002, g).rotation.z = -s * 0.35;
    add(new THREE.ConeGeometry(0.008, 0.015, 10), pink, s * 0.022, 0.14, 0.009, g).rotation.z = -s * 0.35;
    part(cer, s * 0.018, 0.009, 0.032, 0.015, 0.01, 0.017); // лапки
    add(new THREE.TorusGeometry(0.006, 0.0016, 6, 12, PI), ink, s * 0.014, 0.116, 0.037, g).rotation.z = PI;
    part(pink, s * 0.023, 0.104, 0.031, 0.007, 0.005, 0.003); // щёчки
  }
  part(pink, 0, 0.106, 0.039, 0.005, 0.0035, 0.003); // нос
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.02, 0.012, -0.03), V(0.048, 0.01, 0), V(0.036, 0.01, 0.032), V(0.01, 0.012, 0.044)]), 16, 0.009, 8), cer, 0, 0, 0, g); // хвост
  add(heartGeo(0.016, 0.006), M(P.rose), 0, 0.058, 0.04, g);
  return g;
}

// сердце на подставке
function heart_fig() {
  const g = new THREE.Group();
  add(rbox(0.09, 0.022, 0.07, 0.01), M(P.wood), 0, 0.011, 0, g);
  add(G.cyl(0.004, 0.004, 0.022, 8), M(P.butter), 0, 0.03, 0, g);
  const geo = heartGeo(0.06, 0.016); geo.computeBoundingBox();
  add(geo, M(P.rose), 0, 0.036 - geo.boundingBox.min.y, 0, g);
  return g;
}

// игрушечный динозаврик, голова чуть к зрителю
function dino() {
  const g = new THREE.Group(), d = new THREE.Group(); d.rotation.y = -0.5; g.add(d);
  const skin = M(P.mint), spike = M(P.pink), ink = M(P.ink), ball = G.sph(1, 18, 12);
  const part = (mat, x, y, z, sx, sy, sz) => { const m = add(ball, mat, x, y, z, d); m.scale.set(sx, sy, sz); return m; };
  part(skin, 0, 0.056, 0, 0.052, 0.038, 0.036);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(G.cyl(0.013, 0.014, 0.04, 12), skin, sx * 0.028, 0.02, sz * 0.019, d);
  add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0.03, 0.065, 0), V(0.072, 0.08, 0), V(0.078, 0.118, 0)), 10, 0.015, 10), skin, 0, 0, 0, d); // шея
  part(skin, 0.088, 0.128, 0, 0.03, 0.024, 0.023); // голова
  for (const s of [-1, 1]) { part(ink, 0.1, 0.136, s * 0.015, 0.004, 0.005, 0.004); part(spike, 0.106, 0.124, s * 0.015, 0.005, 0.004, 0.002); }
  for (let i = 0; i < 7; i++) { const u = i / 6, r = 0.024 * (1 - u * 0.75); part(skin, -0.046 - u * 0.068, 0.055 - u * 0.034, u * u * 0.03, r, r, r); } // хвост
  for (let i = 0; i < 5; i++) {
    const x = 0.025 - (i / 4) * 0.07, y = 0.056 + 0.038 * Math.sqrt(Math.max(0, 1 - (x / 0.052) ** 2));
    add(new THREE.ConeGeometry(0.009, 0.016, 8), spike, x, y + 0.004, 0, d);
  }
  return g;
}

// маленькая фоторамка на подпорке; userData.photo — плоскость под фото
function photo_stand() {
  const g = new THREE.Group(), f = new THREE.Group(); f.rotation.x = -0.14; f.position.z = 0.01; g.add(f);
  const wood = M(P.wood);
  add(rbox(0.134, 0.174, 0.016, 0.01), wood, 0, 0.087, 0, f);
  add(new THREE.PlaneGeometry(0.114, 0.152), M(P.cream), 0, 0.088, 0.0082, f);
  const ph = canvasTex(256, 340, (x, w, h) => {
    x.fillStyle = P.pinkL; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.55)'; blob(x, 60, 280, 50); blob(x, 110, 290, 40); blob(x, 200, 70, 36);
    x.fillStyle = P.rose; heartPath(x, w / 2, h / 2 + 10, 70); x.fill();
  });
  const photo = add(new THREE.PlaneGeometry(0.1, 0.136), M('#ffffff', { map: ph }), 0, 0.09, 0.0086, f);
  photo.castShadow = false;
  add(rbox(0.032, 0.13, 0.008, 0.003), wood, 0, 0.061, -0.045, g).rotation.x = 0.35; // подпорка
  g.userData.photo = photo;
  return g;
}

// стеклянная банка с гирляндой внутри
function jar_lights() {
  const g = new THREE.Group();
  unlit(add(G.lathe([[0, 0.002], [0.042, 0.002], [0.047, 0.012], [0.048, 0.11], [0.038, 0.13], [0.034, 0.14]], 24), new THREE.MeshBasicMaterial({ color: '#eaf6f2', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 0, g));
  add(G.cyl(0.032, 0.034, 0.026, 20), M(P.woodL), 0, 0.153, 0, g); // пробка
  add(new THREE.TorusGeometry(0.036, 0.003, 6, 24), M(P.rose), 0, 0.134, 0, g).rotation.x = PI / 2; // ленточка
  const pts = Array.from({ length: 22 }, (_, i) => { const u = i / 21, a = u * PI * 8, r = 0.03 - 0.006 * Math.sin(u * PI); return V(Math.cos(a) * r, 0.014 + u * 0.1, Math.sin(a) * r); });
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts).getPoints(90)), new THREE.LineBasicMaterial({ color: P.sageD })));
  const tick = twinkler(pts, 0.0055, WARM, g);
  const hl = halo('#ffc58a', 0.22, 0.3, softDot()); hl.position.y = 0.07; g.add(hl);
  g.userData.update = (dt, t) => tick(t);
  return g;
}

// ретро-радио с ручкой и антенной
function radio() {
  const g = new THREE.Group(), cream = M(P.cream), b = M(P.butter);
  add(rbox(0.2, 0.124, 0.084, 0.032), M(P.pink), 0, 0.07, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(G.cyl(0.008, 0.008, 0.01, 10), M(P.plum), sx * 0.078, 0.005, sz * 0.028, g);
  const grille = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = P.cream; x.fillRect(0, 0, w, h); x.fillStyle = shade(P.pink, -0.12);
    for (let y = 22; y < h; y += 34) for (let xx = 22 + ((y / 34) % 2) * 17; xx < w; xx += 34) blob(x, xx, y, 8);
  });
  add(new THREE.CircleGeometry(0.034, 32), M('#ffffff', { map: grille }), -0.042, 0.07, 0.0425, g);
  add(new THREE.TorusGeometry(0.034, 0.005, 8, 32), b, -0.042, 0.07, 0.042, g);
  const dial = canvasTex(256, 112, (x, w, h) => {
    x.fillStyle = P.paper; x.fillRect(0, 0, w, h); x.strokeStyle = P.ink; x.lineWidth = 5; x.lineCap = 'round';
    for (let i = 0; i <= 8; i++) { const xx = 22 + i * ((w - 44) / 8); x.beginPath(); x.moveTo(xx, h - 22); x.lineTo(xx, h - (i % 2 ? 44 : 62)); x.stroke(); }
    x.fillStyle = P.rose; x.fillRect(w * 0.6, 14, 8, h - 28);
  });
  add(rbox(0.084, 0.042, 0.006, 0.0025), b, 0.042, 0.09, 0.041, g);
  add(new THREE.PlaneGeometry(0.074, 0.032), M('#ffffff', { map: dial }), 0.042, 0.09, 0.0444, g);
  for (const x of [0.026, 0.058]) add(G.cyl(0.011, 0.012, 0.014, 20), cream, x, 0.047, 0.047, g).rotation.x = PI / 2;
  add(new THREE.TorusGeometry(0.06, 0.009, 10, 24, PI), M(P.woodD), 0, 0.132, 0, g); // ручка
  strut(g, b, V(0.11, 0.235, -0.03), V(0.082, 0.132, -0.022), 0.0025, 0.0035, 6); // антенна
  add(G.sph(0.006, 8, 6), M(P.rose), 0.11, 0.237, -0.03, g);
  g.userData.act = lofi.toggle; // клик в комнате — играть / стоп
  g.userData.update = () => { const k = lofi.pulse(); g.scale.set(1 + k * 0.025, 1 + k * 0.05, 1 + k * 0.025); };
  return g;
}

// ---------- на стену (z=0 — плоскость стены, предмет смотрит в +z) ----------
function frame() {
  const g = new THREE.Group();
  const art = canvasTex(320, 256, (x, w, h) => {
    x.fillStyle = P.paper; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(243,157,179,.35)'; blob(x, 120, 120, 70); blob(x, 200, 140, 60);
    x.fillStyle = P.pink; heartPath(x, w / 2, h * 0.52, 82); x.fill();
    x.fillStyle = P.pinkL; heartPath(x, w / 2 - 22, h * 0.42, 22); x.fill();
    x.fillStyle = P.rose; x.font = CAVEAT(40); x.textAlign = 'right'; x.fillText('мы', w - 20, h - 18);
  });
  add(rbox(0.29, 0.24, 0.026, 0.012), M(P.wood), 0, 0, 0.013, g);
  add(new THREE.PlaneGeometry(0.25, 0.2), M(P.cream), 0, 0, 0.0265, g);
  add(new THREE.PlaneGeometry(0.19, 0.152), M('#ffffff', { map: art }), 0, 0, 0.027, g);
  return g;
}

// постер 0.36×0.5 в рамке; рисунок — draw(ctx, w, h)
function poster(draw, frameCol) {
  const g = new THREE.Group();
  add(rbox(0.37, 0.51, 0.022, 0.01), M(frameCol), 0, 0, 0.011, g);
  add(new THREE.PlaneGeometry(0.34, 0.48), M('#ffffff', { map: canvasTex(384, 544, draw) }), 0, 0, 0.0225, g);
  return g;
}
const INK = P.ink, CAP = (x, text, y, col = INK, size = 46) => { x.fillStyle = col; x.font = CAVEAT(size); x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillText(text, 192, y); };

function drawParis(x, w, h) {
  x.fillStyle = P.paper; x.fillRect(0, 0, w, h);
  x.fillStyle = P.pinkL; blob(x, w * 0.64, h * 0.3, 80);
  const cx = w / 2, base = h * 0.8, top = h * 0.14, Q = [[80, base], [30, h * 0.5], [6, top + 30]];
  const legAt = (y) => { // полуширина башни на высоте y
    let best = 0, bd = 1e9;
    for (let t = 0; t <= 1; t += 0.01) {
      const yy = (1 - t) ** 2 * Q[0][1] + 2 * t * (1 - t) * Q[1][1] + t * t * Q[2][1];
      if (Math.abs(yy - y) < bd) { bd = Math.abs(yy - y); best = (1 - t) ** 2 * Q[0][0] + 2 * t * (1 - t) * Q[1][0] + t * t * Q[2][0]; }
    }
    return best;
  };
  x.strokeStyle = INK; x.fillStyle = INK; x.lineWidth = 6; x.lineJoin = x.lineCap = 'round';
  x.beginPath();
  for (const s of [-1, 1]) { x.moveTo(cx + s * Q[0][0], Q[0][1]); x.quadraticCurveTo(cx + s * Q[1][0], Q[1][1], cx + s * Q[2][0], Q[2][1]); }
  x.stroke();
  x.beginPath(); x.arc(cx, base, 46, PI, 0); x.stroke(); // арка
  const y1 = h * 0.62, y2 = h * 0.42;
  for (const y of [y1, y2]) { const hw = legAt(y) + 12; x.beginPath(); x.roundRect(cx - hw, y - 6, 2 * hw, 12, 6); x.fill(); }
  x.beginPath(); x.roundRect(cx - 11, top + 22, 22, 12, 5); x.fill();
  x.beginPath(); x.moveTo(cx, top); x.lineTo(cx, top + 26); x.stroke(); // шпиль
  x.lineWidth = 3;
  for (const [ya, yb] of [[y1, y2], [y2, top + 30]]) {
    for (let j = 0; j < 2; j++) {
      const a = ya - (j * (ya - yb)) / 2, b = ya - ((j + 1) * (ya - yb)) / 2;
      x.beginPath(); x.moveTo(cx - legAt(a), a); x.lineTo(cx + legAt(b), b); x.moveTo(cx + legAt(a), a); x.lineTo(cx - legAt(b), b); x.stroke();
    }
  }
  x.fillStyle = P.wood; x.beginPath(); x.roundRect(40, base, w - 80, 8, 4); x.fill();
  x.fillStyle = P.rose; for (const [a, b] of [[70, 110], [300, 420], [96, 360]]) { heartPath(x, a, b, 14); x.fill(); }
  CAP(x, 'Paris', h * 0.93);
}
function drawMountains(x, w, h) {
  x.fillStyle = '#fde2d4'; x.fillRect(0, 0, w, h);
  x.fillStyle = P.butter; blob(x, w * 0.34, h * 0.28, 50);
  const layer = (col, pts) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, h); for (const [a, b] of pts) x.lineTo(a * w, b * h); x.lineTo(w, h); x.fill(); };
  layer(P.pinkL, [[0, 0.6], [0.2, 0.45], [0.38, 0.55], [0.6, 0.36], [0.82, 0.5], [1, 0.42]]);
  x.fillStyle = P.white; x.beginPath(); x.moveTo(0.6 * w, 0.36 * h); x.lineTo(0.55 * w, 0.405 * h); x.lineTo(0.6 * w, 0.395 * h); x.lineTo(0.645 * w, 0.41 * h); x.fill(); // снег
  layer(P.pink, [[0, 0.68], [0.25, 0.5], [0.45, 0.66], [0.7, 0.52], [1, 0.7]]);
  layer(P.lavD, [[0, 0.8], [0.3, 0.66], [0.55, 0.78], [0.8, 0.64], [1, 0.76]]);
  x.strokeStyle = INK; x.lineWidth = 4; x.lineCap = 'round';
  for (const [a, b] of [[250, 120], [280, 142], [226, 152]]) { x.beginPath(); x.moveTo(a - 10, b - 4); x.quadraticCurveTo(a - 4, b - 8, a, b); x.quadraticCurveTo(a + 4, b - 8, a + 10, b - 4); x.stroke(); } // птицы
  x.fillStyle = P.paper; x.fillRect(0, h * 0.85, w, h * 0.15);
  CAP(x, 'горы зовут', h * 0.95);
}
function drawCat(x, w, h) {
  x.fillStyle = P.paper; x.fillRect(0, 0, w, h);
  x.fillStyle = P.pinkL; blob(x, w / 2, h * 0.46, 140);
  const cx = w / 2;
  x.fillStyle = P.plum;
  x.beginPath(); x.ellipse(cx, h * 0.6, 80, 92, 0, 0, 7); x.fill(); // туловище
  blob(x, cx, h * 0.36, 64); // голова
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * 60, h * 0.34); x.lineTo(cx + s * 50, h * 0.21); x.lineTo(cx + s * 18, h * 0.29); x.fill(); }
  x.strokeStyle = P.plum; x.lineWidth = 18; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx + 70, h * 0.72); x.quadraticCurveTo(cx + 150, h * 0.66, cx + 118, h * 0.5); x.stroke(); // хвост
  x.strokeStyle = P.paper; x.lineWidth = 5;
  for (const s of [-1, 1]) {
    x.beginPath(); x.arc(cx + s * 24, h * 0.355, 10, 0.1 * PI, 0.9 * PI); x.stroke(); // глаза-улыбки
    for (const d of [-7, 7]) { x.beginPath(); x.moveTo(cx + s * 32, h * 0.4 + d * 0.5); x.lineTo(cx + s * 68, h * 0.4 + d); x.stroke(); } // усы
  }
  x.fillStyle = P.pink; x.beginPath(); x.moveTo(cx - 8, h * 0.385); x.lineTo(cx + 8, h * 0.385); x.lineTo(cx, h * 0.398); x.fill();
  x.fillStyle = 'rgba(243,157,179,.75)'; for (const s of [-1, 1]) blob(x, cx + s * 40, h * 0.395, 10);
  x.fillStyle = P.rose; heartPath(x, cx + 100, h * 0.17, 22); x.fill();
  CAP(x, 'мяу', h * 0.94);
}
function drawAbstract(x, w, h) {
  x.fillStyle = P.paper; x.fillRect(0, 0, w, h);
  x.fillStyle = P.pinkL; x.fillRect(0, h * 0.72, w, h * 0.08);
  [P.rose, P.pink, P.coral, P.paper].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(w * 0.38, h * 0.72, 130 - i * 30, PI, 0); x.fill(); }); // радуга-арка
  x.fillStyle = P.butter; blob(x, w * 0.72, h * 0.25, 52);
  x.fillStyle = P.mint; x.beginPath(); x.ellipse(w * 0.28, h * 0.24, 62, 40, 0.4, 0, 7); x.fill();
  x.strokeStyle = INK; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath();
  for (let px = 40; px <= w - 40; px += 4) { const py = h * 0.88 + Math.sin(px * 0.05) * 9; px === 40 ? x.moveTo(px, py) : x.lineTo(px, py); }
  x.stroke();
  x.fillStyle = INK; for (const [a, b] of [[300, 330], [322, 352], [280, 362], [334, 384]]) blob(x, a, b, 6);
}
function drawMoon(x, w, h) {
  x.fillStyle = P.plum; x.fillRect(0, 0, w, h);
  x.fillStyle = P.butter; for (let i = 0; i < 16; i++) blob(x, rr(16, w - 16), rr(16, h * 0.82), rr(2.5, 4.5));
  const r = 34, cx = w / 2;
  [1.35, 0.7, null, -0.7, -1.35].forEach((k, i) => { // фазы: тень — смещённый круг
    const cy = 80 + i * 80;
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip();
    x.fillStyle = P.cream; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    if (k !== null) { x.fillStyle = shade(P.plum, 0.08); blob(x, cx + k * r, cy, r); }
    x.restore();
  });
  CAP(x, 'до луны и обратно', h * 0.94, P.cream, 38);
}

// круглые часы, стрелки идут по местному времени
function clock() {
  const g = new THREE.Group(), ink = M(INK);
  const face = canvasTex(512, 512, (x, w) => {
    x.fillStyle = P.paper; x.fillRect(0, 0, w, w);
    x.translate(256, 256); x.fillStyle = INK;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; blob(x, Math.sin(a) * 210, -Math.cos(a) * 210, i % 3 ? 7 : 12); }
    x.font = '800 70px Nunito, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const [n, a] of [[12, 0], [3, 1], [6, 2], [9, 3]]) x.fillText(n, Math.sin(a * PI / 2) * 150, -Math.cos(a * PI / 2) * 150 + 4);
    x.fillStyle = P.rose; heartPath(x, 0, 80, 34); x.fill();
  });
  add(G.cyl(0.168, 0.168, 0.04, 48), M(P.pink), 0, 0, 0.02, g).rotation.x = PI / 2;
  add(new THREE.TorusGeometry(0.158, 0.013, 12, 64), M(P.rose), 0, 0, 0.04, g);
  add(new THREE.CircleGeometry(0.15, 64), M('#ffffff', { map: face }), 0, 0, 0.0405, g);
  const hand = (len, wd, z, mat) => {
    const p = new THREE.Group(); p.position.z = z; g.add(p);
    const geo = rbox(wd, len, 0.004, wd / 2.2); geo.translate(0, len / 2 - 0.015, 0);
    add(geo, mat, 0, 0, 0, p).castShadow = false;
    return p;
  };
  const hH = hand(0.075, 0.012, 0.044, ink), mH = hand(0.112, 0.008, 0.048, ink), sH = hand(0.122, 0.003, 0.052, M(P.rose));
  add(G.cyl(0.009, 0.009, 0.01, 16), M(P.butter), 0, 0, 0.054, g).rotation.x = PI / 2;
  g.userData.update = () => {
    const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
    sH.rotation.z = -(s / 60) * PI * 2; mH.rotation.z = -(m / 60) * PI * 2; hH.rotation.z = -(hr / 12) * PI * 2;
  };
  g.userData.update();
  return g;
}

// неоновая надпись «love» с сердечком, иногда мигает
function neon() {
  const g = new THREE.Group(), S = 0.01, OX = -1.5, OY = -3.5;
  const heart = Array.from({ length: 14 }, (_, i) => { const t = (i / 14) * PI * 2; return [25 + 0.28 * 16 * Math.sin(t) ** 3, 4 + 0.28 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; });
  const strokes = [
    [[[-26, -4], [-21, 4], [-19, 11], [-21, 15], [-23.5, 12], [-22.5, 2], [-21, -6], [-18, -8], [-15, -5]], false], // l
    [[[-9, 2], [-12.5, 0], [-13, -4], [-10, -7.5], [-6, -6.5], [-5, -2], [-7, 1.5]], true], // o
    [[[-5, 1.5], [-2, 2], [0.5, -2], [2, -8], [4.5, -2], [6.5, 2], [8, 1]], false], // v
    [[[9, -3], [14, -2], [17, 0.5], [15.5, 2.5], [12, 2], [9.5, -1.5], [10.5, -6.5], [14.5, -8], [19, -6]], false], // e
    [heart, true],
  ];
  const base = new THREE.Color('#ff86bd'), mat = new THREE.MeshBasicMaterial({ color: base.clone() });
  for (const [pts, closed] of strokes) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([a, b]) => V((a + OX) * S, (b + OY) * S, 0.03)), closed);
    unlit(add(new THREE.TubeGeometry(curve, 64, 0.007, 6, closed), mat, 0, 0, 0, g));
  }
  unlit(add(rbox(0.64, 0.3, 0.008, 0.02), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false }), 0, 0, 0.02, g)); // акриловая подложка
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(G.cyl(0.008, 0.008, 0.02, 10), M(P.butter), sx * 0.29, sy * 0.12, 0.01, g).rotation.x = PI / 2;
  const spillM = new THREE.MeshBasicMaterial({ map: softDot(), color: '#ff5c9a', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  unlit(add(new THREE.PlaneGeometry(0.9, 0.55), spillM, 0, 0, 0.003, g)); // розовый отсвет на стене
  const ph = rnd() * 50;
  g.userData.update = (dt, t) => {
    t += ph;
    let k = 1 + 0.03 * Math.sin(t * 17) + 0.02 * Math.sin(t * 31);
    if (Math.sin(t * 0.37) * Math.sin(t * 1.13) > 0.93 && Math.sin(t * 40) > 0) k = 0.55; // редкое мигание
    mat.color.copy(base).multiplyScalar(k); spillM.opacity = 0.3 * k;
  };
  return g;
}

// гирлянда-штора ~1.0×0.9 м
function lights() {
  const g = new THREE.Group(), o = new THREE.Group(); o.position.set(0, 0.45, 0.004); g.add(o);
  const sag = (x) => -0.025 * (1 - (x / 0.52) ** 2);
  const wire = new THREE.CatmullRomCurve3([-0.52, -0.26, 0, 0.26, 0.52].map((x) => V(x, sag(x), 0)));
  add(new THREE.TubeGeometry(wire, 40, 0.004, 5), M(P.sageD), 0, 0, 0, o);
  for (const x of [-0.52, 0.52]) add(G.sph(0.012, 10, 8), M(P.woodD), x, 0, 0.004, o);
  const seg = [], bulbs = [];
  for (let i = 0; i <= 10; i++) {
    const x = -0.5 + i * 0.1, y0 = sag(x), L = 0.6 + 0.25 * (0.5 + 0.5 * Math.sin(i * 1.7));
    seg.push(x, y0, 0, x, y0 - L, 0);
    for (let d = 0.045; d < L; d += 0.075) bulbs.push(V(x, y0 - d, 0.005));
  }
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  o.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: P.sageD })));
  const tick = twinkler(bulbs, 0.011, WARM, o);
  g.userData.update = (dt, t) => tick(t);
  return g;
}

// настенная полка длиной L на двух кремовых кронштейнах-уголках; доска — поверхность (верх на y = 0.0725)
function wallShelf(L) {
  return () => {
    const g = new THREE.Group(), cream = M(P.cream);
    const board = add(rbox(L, 0.03, 0.2, 0.012), M(P.wood), 0, 0.0575, 0.1, g);
    board.userData.surface = true;
    const bs = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.15, 0), new THREE.Vector2(0.15, 0.022), new THREE.Vector2(0.022, 0.12), new THREE.Vector2(0, 0.12)]);
    for (const s of [-1, 1]) {
      const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.024, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
      bg.rotateY(-PI / 2).rotateZ(PI); // уголок: вертикаль у стены, полка сверху
      add(bg, cream, s * (L / 2 - 0.08) - 0.012, 0.0425, 0.004, g);
    }
    return g;
  };
}

// круглое зеркало в деревянном ободе: мягкий рисованный «отблеск»
function mirror() {
  const g = new THREE.Group();
  add(G.cyl(0.255, 0.255, 0.014, 64), M(P.woodD), 0, 0, 0.007, g).rotation.x = PI / 2;
  const refl = canvasTex(256, 256, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#eef4fb'); gr.addColorStop(0.55, '#cfe2f3'); gr.addColorStop(1, '#e8def4');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.save(); x.translate(w / 2, h / 2); x.rotate(-PI / 4);
    for (const [o, wd, a] of [[-46, 34, 0.6], [6, 12, 0.45]]) { x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(-w, o, 2 * w, wd); }
    x.restore();
  });
  add(new THREE.CircleGeometry(0.245, 64), new THREE.MeshBasicMaterial({ map: refl }), 0, 0, 0.0145, g);
  add(new THREE.TorusGeometry(0.255, 0.026, 14, 72), M(P.wood), 0, 0, 0.022, g);
  return g;
}

// ---------- на пол ----------
function lamp() {
  const g = new THREE.Group(), b = M(P.butter);
  add(G.lathe([[0, 0], [0.14, 0], [0.145, 0.016], [0.11, 0.032], [0.024, 0.046], [0, 0.046]], 32), b, 0, 0, 0, g);
  add(G.cyl(0.014, 0.014, 1.28, 12), b, 0, 0.66, 0, g);
  const shade = add(G.lathe([[0.19, 1.27], [0.2, 1.28], [0.14, 1.52], [0.13, 1.53], [0.12, 1.52], [0.18, 1.285]], 32), M('#ffe7b0', { emissive: new THREE.Color('#ffb35c'), emissiveIntensity: 0.25, side: THREE.DoubleSide }), 0, 0, 0, g);
  shade.castShadow = true;
  add(new THREE.TorusGeometry(0.192, 0.01, 8, 40), M(P.rose), 0, 1.28, 0, g).rotation.x = PI / 2;
  unlit(add(G.sph(0.04, 14, 10), glow('#fff1d0'), 0, 1.36, 0, g));
  const dot = softDot(), hl = halo('#ffc58a', 0.75, 0.22, dot); hl.position.y = 1.4; g.add(hl);
  // тёплое пятно на полу вместо настоящего света
  const pool = unlit(add(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: dot, color: '#ffb36b', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.007, 0.05, g));
  pool.rotation.x = -PI / 2;
  return g;
}

function pouf() {
  const g = new THREE.Group();
  const knit = canvasTex(256, 128, (x, w, h) => { // крупные «косички» вязки
    x.fillStyle = P.lav; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let xx = 0; xx < w; xx += 32) {
      for (const [s, col] of [[-1, 'rgba(255,240,250,.4)'], [1, 'rgba(93,69,102,.22)']]) { x.fillStyle = col; x.beginPath(); x.ellipse(xx + 16 + s * 7, y + 16, 6, 13, s * 0.5, 0, 7); x.fill(); }
    }
  }, [6, 3]);
  const R = 0.21, H = 0.34, c = 0.09, pts = [[0, 0]];
  for (let i = 0; i <= 6; i++) { const a = -PI / 2 + (i / 6) * (PI / 2); pts.push([R - c + Math.cos(a) * c, c + Math.sin(a) * c]); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (PI / 2); pts.push([R - c + Math.cos(a) * c, H - c + Math.sin(a) * c]); }
  pts.push([0, H]);
  add(G.lathe(pts.map(([x, y]) => [x * (1 + 0.08 * Math.sin((y / H) * PI)), y]), 36), M('#ffffff', { map: knit }), 0, 0, 0, g);
  add(G.sph(1, 12, 8), M(P.lavD), 0, H - 0.004, 0, g).scale.set(0.022, 0.01, 0.022);
  return g;
}

// ёлочка ~0.8 м с игрушками и огоньками
function tree() {
  const g = new THREE.Group();
  pot(g, 0.095, 0.11, P.cream);
  add(G.cyl(0.097, 0.095, 0.026, 28), M(P.rose), 0, 0.085, 0, g);
  add(G.cyl(0.02, 0.024, 0.08, 10), M(P.woodD), 0, 0.15, 0, g);
  const TIERS = [[0.24, 0.3, 0.27], [0.19, 0.26, 0.45], [0.13, 0.22, 0.62]]; // радиус, высота, центр
  TIERS.forEach(([r, h, y], i) => { add(new THREE.ConeGeometry(r, h, 24, 1), M([P.leafD, '#5fa456', P.leaf][i]), 0, y, 0, g).rotation.y = i * 0.35; });
  const env = (y) => Math.max(0, ...TIERS.map(([r, h, cy]) => (y >= cy - h / 2 && y <= cy + h / 2 ? (r * (cy + h / 2 - y)) / h : 0)));
  const onCone = (y, a, out) => V(Math.cos(a) * (env(y) + out), y, Math.sin(a) * (env(y) + out));
  const toys = [M(P.rose), M(P.butter), M(P.sky)];
  const toy = G.sph(0.02, 12, 8);
  for (let i = 0; i < 10; i++) { const y = 0.16 + (i / 10) * 0.5; add(toy, toys[i % 3], ...onCone(y, i * 2.1 + 1, 0.008).toArray(), g); }
  const tick = twinkler(Array.from({ length: 16 }, (_, i) => onCone(0.15 + (i / 16) * 0.56, i * 1.25, 0.005)), 0.009, WARM, g);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.02 : 0.045, a = (i / 10) * PI * 2 + PI / 2; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2 }); starGeo.center();
  add(starGeo, M(P.butter, { emissive: new THREE.Color('#ffb84d'), emissiveIntensity: 0.35 }), 0, 0.78, 0, g);
  const hl = halo('#ffd27a', 0.16, 0.3, softDot()); hl.position.y = 0.78; g.add(hl);
  g.userData.update = (dt, t) => tick(t);
  return g;
}

// большая монстера ~1.1 м в кремовом кашпо (как в лаборатории: пухлые листья с прожилкой)
function monstera() {
  const g = new THREE.Group();
  add(G.lathe([[0, 0], [0.15, 0], [0.17, 0.03], [0.18, 0.29], [0, 0.29]], 32), M(P.cream), 0, 0, 0, g);
  add(new THREE.TorusGeometry(0.185, 0.022, 10, 32), M(P.terra), 0, 0.295, 0, g).rotation.x = PI / 2;
  add(G.cyl(0.165, 0.165, 0.01, 24), M('#7a4b32'), 0, 0.282, 0, g).castShadow = false;
  const stemM = M(P.leafD), ribM = M('#a8dc8c');
  for (let i = 0; i < 13; i++) {
    const a = i * 2.39 + 0.4, h = 0.3 + (i % 5) * 0.11, out = 0.14 + (i % 3) * 0.08;
    const tip = V(Math.cos(a) * out, 0.28 + h, Math.sin(a) * out);
    add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(Math.cos(a) * 0.03, 0.28, Math.sin(a) * 0.03), V(tip.x * 0.15, 0.28 + h * 0.85, tip.z * 0.15), tip), 10, 0.008, 6), stemM, 0, 0, 0, g);
    const len = 0.3 + (i % 3) * 0.05, droop = 0.32;
    const rot = [-0.95 - (i % 3) * 0.15, -a + PI / 2 + PI, 0, 'YXZ'];
    add(G.leaf(len, len * 0.8, 0.22, droop), M([P.leaf, P.leafL, '#5fae55'][i % 3]), tip.x, tip.y, tip.z, g).rotation.set(...rot);
    const rib = []; for (let k = 0; k <= 6; k++) { const y = (k / 6) * len * 0.92; rib.push(V(0, y, len * 0.03 - ((y / len) ** 2) * len * droop)); }
    const r = add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib), 8, 0.0035, 4), ribM, tip.x, tip.y, tip.z, g);
    r.rotation.set(...rot); r.userData.noOutline = true;
  }
  return g;
}

// круглый приставной столик; столешница — поверхность
function side_table() {
  const g = new THREE.Group(), top = M('#ffffff', { map: woodTex(P.wood) }), leg = M(P.woodD);
  add(G.cyl(0.22, 0.22, 0.03, 40), top, 0, 0.535, 0, g).userData.surface = true;
  for (let i = 0; i < 3; i++) {
    const a = (i * PI * 2) / 3 + PI / 6;
    strut(g, leg, V(Math.cos(a) * 0.14, 0.52, Math.sin(a) * 0.14), V(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19), 0.022, 0.015, 12);
  }
  add(G.cyl(0.165, 0.165, 0.02, 32), M(P.woodL), 0, 0.2, 0, g); // нижняя полочка
  return g;
}

// ---------- каталог ----------
// r — примерный радиус следа (для настенных — половина ширины), h — высота; shelfTop — верх полки относительно начала координат
export const ITEMS = {
  // стена
  frame: { mount: 'wall', r: 0.145, h: 0.24, build: frame },
  poster_paris: { mount: 'wall', r: 0.185, h: 0.51, build: () => poster(drawParis, P.plum) },
  poster_mountains: { mount: 'wall', r: 0.185, h: 0.51, build: () => poster(drawMountains, P.wood) },
  poster_cat: { mount: 'wall', r: 0.185, h: 0.51, build: () => poster(drawCat, P.pink) },
  poster_abstract: { mount: 'wall', r: 0.185, h: 0.51, build: () => poster(drawAbstract, P.cream) },
  poster_moon: { mount: 'wall', r: 0.185, h: 0.51, build: () => poster(drawMoon, P.woodD) },
  clock: { mount: 'wall', r: 0.17, h: 0.34, build: clock },
  neon: { mount: 'wall', r: 0.32, h: 0.3, build: neon },
  lights: { mount: 'wall', r: 0.52, h: 0.9, build: lights },
  shelf_s: { mount: 'wall', r: 0.25, h: 0.145, shelfTop: 0.0725, build: wallShelf(0.5) },
  shelf_l: { mount: 'wall', r: 0.45, h: 0.145, shelfTop: 0.0725, build: wallShelf(0.9) },
  mirror: { mount: 'wall', r: 0.28, h: 0.56, build: mirror },
  // стол и полки
  cactus: { mount: 'surface', r: 0.05, h: 0.19, build: cactus },
  candles: { mount: 'surface', r: 0.066, h: 0.13, build: candles },
  globe: { mount: 'surface', r: 0.085, h: 0.19, build: globe },
  choco: { mount: 'surface', r: 0.08, h: 0.06, build: choco },
  flowers: { mount: 'surface', r: 0.08, h: 0.36, build: flowers },
  teddy: { mount: 'surface', r: 0.07, h: 0.22, build: teddy },
  ring: { mount: 'surface', r: 0.04, h: 0.08, build: ring },
  balloon: { mount: 'surface', r: 0.03, h: 0.62, build: balloon },
  succulent: { mount: 'surface', r: 0.05, h: 0.09, build: succulent },
  books: { mount: 'surface', r: 0.12, h: 0.14, build: books },
  vase_tulips: { mount: 'surface', r: 0.06, h: 0.34, build: vase_tulips },
  lava: { mount: 'surface', r: 0.055, h: 0.29, build: lava },
  cat_fig: { mount: 'surface', r: 0.05, h: 0.16, build: cat_fig },
  heart_fig: { mount: 'surface', r: 0.06, h: 0.14, build: heart_fig },
  dino: { mount: 'surface', r: 0.1, h: 0.15, build: dino },
  photo_stand: { mount: 'surface', r: 0.07, h: 0.18, build: photo_stand },
  jar_lights: { mount: 'surface', r: 0.05, h: 0.17, build: jar_lights },
  radio: { mount: 'surface', r: 0.11, h: 0.24, build: radio },
  // пол
  lamp: { mount: 'floor', r: 0.2, h: 1.54, build: lamp },
  pouf: { mount: 'floor', r: 0.23, h: 0.35, build: pouf },
  tree: { mount: 'floor', r: 0.25, h: 0.83, build: tree },
  monstera: { mount: 'floor', r: 0.3, h: 1.1, build: monstera },
  side_table: { mount: 'floor', r: 0.22, h: 0.55, shelfTop: 0.55, build: side_table },
};
// неподвижные детали каждой вещи сливаются в один меш с одной обводкой (toon.js → bake)
for (const def of Object.values(ITEMS)) { const b = def.build; def.build = () => bake(b()); }
