// Мягкий стиль: пастель, крупные скругления, мягкий свет и тени «как в дорогом 3D-рендере».
// Свет: окружение-градиент (PMREM) + ключевой свет спереди-сверху без теней + солнце через окно (единственная тень, VSM, карта
// считается один раз). Мягкие тени предметов запекаются при загрузке: ортопроекция предметов на стол / стену / пол
// (прямо — контакт и AO, косо — тень от ключевого света), размытие, прозрачная плёнка поверх. В кадре это почти бесплатно.
// Пост: MSAA → bloom (лампочки, лампа) → Neutral-тонмаппинг.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

export async function build({ THREE, renderer, scene, camera, L }) {
  const V2 = THREE.Vector2, V3 = THREE.Vector3, PI = Math.PI;
  const T = L.DESK.top, I = L.ITEMS, WIN = L.WINDOW, BACK = L.ROOM.back;
  const font = await handFont();

  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const M = (p = [0, 0, 0], r = [0, 0, 0], s = 1) =>
    new THREE.Matrix4().compose(new V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), typeof s === 'number' ? new V3(s, s, s) : new V3(...s));
  const RB = (w, h, d, r, s = 4) => new RoundedBoxGeometry(w, h, d, s, r);
  const C = (h) => new THREE.Color(h);

  // деталь: геометрия → без индекса, на месте, с цветом в вершинах (лёгкий градиент: низ темнее — «встроенный AO»)
  const tmpC = new THREE.Color();
  function part(geo, color, m, g = 0.84) {
    const q = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) q.applyMatrix4(m);
    q.computeBoundingBox();
    const lo = q.boundingBox.min.y, span = q.boundingBox.max.y - lo || 1;
    const pos = q.attributes.position, n = pos.count, a = new Float32Array(n * 3);
    const base = typeof color === 'function' ? null : C(color);
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i), c = base || tmpC.set(color(pos.getX(i), y, pos.getZ(i)));
      const k = g + (1 - g) * Math.sqrt((y - lo) / span);
      a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
    }
    q.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) q.deleteAttribute(k);
    if (!q.attributes.normal) q.computeVertexNormals();
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return q;
  }
  // слои для запекания мягких теней: 1 — на стол, 2 — на пол, 3 — на заднюю стену
  function add(parts, mat, layers = [], cast = true) {
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.castShadow = cast; m.receiveShadow = true;
    for (const l of layers) m.layers.enable(l);
    scene.add(m);
    return m;
  }
  const arc = (pts, cx, cy, r, a0, a1, n = 6) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(new V2(Math.max(0, cx + r * Math.cos(a)), cy + r * Math.sin(a))); } };
  // пухлая шайба: цилиндр со скруглёнными рёбрами, низ на y = 0
  function puck(r, h, rr, seg = 48, rings = 0) {
    const p = [new V2(0, 0)];
    arc(p, r - rr, rr, rr, -PI / 2, 0); arc(p, r - rr, h - rr, rr, 0, PI / 2);
    for (let i = 1; i <= rings; i++) p.push(new V2((r - rr) * (1 - i / (rings + 1)), h));
    p.push(new V2(0, h));
    return new THREE.LatheGeometry(p, seg);
  }
  // открытая чашка/горшок со скруглённым дном и валиком по краю
  function cup(rb, rt, h, w, rr = 0.01, seg = 48) {
    const p = [new V2(0, 0)];
    arc(p, rb - rr, rr, rr, -PI / 2, 0);
    arc(p, rt - w / 2, h - w / 2, w / 2, 0, PI, 8);
    p.push(new V2(rb - w * 1.2, w * 1.5), new V2(0, w * 1.4));
    return new THREE.LatheGeometry(p, seg);
  }
  const tube = (pts, r, seg = 24, rs = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs, false);

  // ---------- материалы ----------
  const rim = (m) => {
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>',
        'outgoingLight += diffuseColor.rgb * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * 0.28;\n#include <opaque_fragment>');
    };
    return m;
  };
  const matte = rim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }));
  const satin = rim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }));
  const shell = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, shadowSide: THREE.DoubleSide });
  const glow = rim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: '#ffcf9c', emissiveIntensity: 0.6 }));

  // ---------- комната ----------
  const WALL = C('#f0d0cb'), WALL_TOP = C('#f8e4df'), WAIN = '#b5d3c2', CREAM = '#f7eee3';
  const wallCol = (x, y) => tmpC.copy(WALL).lerp(WALL_TOP, Math.min(1, Math.max(0, (y - 0.95) / 1.85)));
  function wallShape(y0, x0 = -3, x1 = 3) {
    const s = new THREE.Shape().moveTo(x0, y0).lineTo(x1, y0).lineTo(x1, 2.8).lineTo(x0, 2.8).closePath();
    s.holes.push(new THREE.Path().moveTo(WIN.x0, WIN.y0).lineTo(WIN.x0, WIN.y1).lineTo(WIN.x1, WIN.y1).lineTo(WIN.x1, WIN.y0).closePath());
    return new THREE.ShapeGeometry(s);
  }
  const W = L.WAINSCOT, room = [
    part(wallShape(W), wallCol, M([0, 0, BACK]), 1),
    part(new THREE.PlaneGeometry(6, W), WAIN, M([0, W / 2, BACK]), 0.9),
    part(new THREE.PlaneGeometry(4.4, 2.8 - W), wallCol, M([-3, (2.8 + W) / 2, 0.2], [0, PI / 2, 0]), 1),
    part(new THREE.PlaneGeometry(4.4, W), WAIN, M([-3, W / 2, 0.2], [0, PI / 2, 0]), 0.9),
    part(new THREE.PlaneGeometry(4.4, 2.8 - W), wallCol, M([3, (2.8 + W) / 2, 0.2], [0, -PI / 2, 0]), 1),
    part(new THREE.PlaneGeometry(4.4, W), WAIN, M([3, W / 2, 0.2], [0, -PI / 2, 0]), 0.9),
    part(new THREE.PlaneGeometry(6, 4.4), '#f8f0e8', M([0, 2.8, 0.2], [PI / 2, 0, 0]), 1),
  ];
  add(room, shell);
  // панели, рейка и плинтус
  const trim = [
    part(RB(6, 0.036, 0.03, 0.013), CREAM, M([0, W, BACK + 0.015])),
    part(RB(6, 0.09, 0.022, 0.009), CREAM, M([0, 0.045, BACK + 0.011])),
  ];
  add(trim, matte, [2, 3]);
  const panels = [];
  for (let x = -2.7; x < 2.8; x += 0.6) panels.push(part(RB(0.46, 0.56, 0.014, 0.012), '#c3ddce', M([x, 0.5, BACK + 0.007]), 0.92));
  add(panels, matte);

  // пол: светлый мёд, мягкие доски
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.4).rotateX(-PI / 2).translate(0, 0, 0.2),
    new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.75 }));
  floor.receiveShadow = true; scene.add(floor);

  // круглый ковёр с кольцами
  const ringCol = [[0, '#f8e8de'], [0.36, '#f8e8de'], [0.4, '#efb6c1'], [0.46, '#cdbce6'], [0.86, '#cdbce6'], [0.9, '#efb6c1'], [0.96, '#f8e8de']].map(([r, c]) => [r, C(c)]);
  const rugCol = (x, y, z) => {
    const r = Math.hypot(x - I.rug.x, z - I.rug.z) / I.rug.r;
    for (let i = ringCol.length - 1; i >= 0; i--) if (r >= ringCol[i][0]) return ringCol[i][1];
    return ringCol[0][1];
  };
  add([part(puck(I.rug.r, 0.016, 0.008, 72, 50), rugCol, M([I.rug.x, 0, I.rug.z]), 1)], matte, [], false);

  // ---------- окно ----------
  const wx = (WIN.x0 + WIN.x1) / 2, wy = (WIN.y0 + WIN.y1) / 2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0;
  const WF = '#fbf4ec', win = [
    // откосы внутри проёма
    part(RB(0.02, wh + 0.04, 0.16, 0.006), WF, M([WIN.x0 - 0.01, wy, BACK - 0.08])),
    part(RB(0.02, wh + 0.04, 0.16, 0.006), WF, M([WIN.x1 + 0.01, wy, BACK - 0.08])),
    part(RB(ww + 0.04, 0.02, 0.16, 0.006), WF, M([wx, WIN.y1 + 0.01, BACK - 0.08])),
    part(RB(ww + 0.04, 0.02, 0.16, 0.006), WF, M([wx, WIN.y0 - 0.01, BACK - 0.08])),
    // наличник
    part(RB(0.075, wh + 0.15, 0.03, 0.013), WF, M([WIN.x0 - 0.0375, wy + 0.0375, BACK + 0.012])),
    part(RB(0.075, wh + 0.15, 0.03, 0.013), WF, M([WIN.x1 + 0.0375, wy + 0.0375, BACK + 0.012])),
    part(RB(ww + 0.15, 0.075, 0.03, 0.013), WF, M([wx, WIN.y1 + 0.0375, BACK + 0.012])),
    // подоконник
    part(RB(ww + 0.22, 0.038, 0.15, 0.016), WF, M([wx, WIN.y0 - 0.019, BACK + 0.04])),
    // рама и переплёт
    part(RB(0.045, wh, 0.035, 0.012), WF, M([WIN.x0 + 0.0225, wy, BACK - 0.1])),
    part(RB(0.045, wh, 0.035, 0.012), WF, M([WIN.x1 - 0.0225, wy, BACK - 0.1])),
    part(RB(ww, 0.045, 0.035, 0.012), WF, M([wx, WIN.y1 - 0.0225, BACK - 0.1])),
    part(RB(ww, 0.045, 0.035, 0.012), WF, M([wx, WIN.y0 + 0.0225, BACK - 0.1])),
    part(RB(0.03, wh, 0.03, 0.01), WF, M([wx, wy, BACK - 0.1])),
    part(RB(ww, 0.03, 0.03, 0.01), WF, M([wx, wy + 0.08, BACK - 0.1])),
  ];
  add(win, matte, [3]);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.6), new THREE.MeshBasicMaterial({ map: skyTex(), color: new THREE.Color(1.12, 1.12, 1.12) }));
  sky.position.set(wx, 1.72, BACK - 0.32); scene.add(sky);

  // шторы: мягкие складки, сиреневые
  function curtain(x0, x1, folds) {
    const w = x1 - x0, h = 1.42, g = new THREE.PlaneGeometry(w, h, folds * 12, 18), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + w / 2) / w, v = (p.getY(i) + h / 2) / h;
      p.setZ(i, 0.024 * Math.sin(u * folds * 2 * PI) * (0.7 + 0.3 * (1 - v)) + 0.012);
      p.setY(i, p.getY(i) + (1 - v) * 0.012 * Math.cos(u * folds * 2 * PI));
    }
    g.computeVertexNormals();
    return part(g, (x, y) => tmpC.set('#cdbbe8').lerp(C('#dccdf1'), (y - 1.1) / 1.4), M([(x0 + x1) / 2, 2.5 - h / 2, BACK + 0.05]), 0.86);
  }
  add([curtain(WIN.x0 - 0.33, WIN.x0 + 0.06, 2.5), curtain(WIN.x1 - 0.06, WIN.x1 + 0.33, 2.5),
    part(new THREE.CapsuleGeometry(0.012, ww + 0.76, 4, 12), '#e9c49b', M([wx, 2.52, BACK + 0.07], [0, 0, PI / 2]))], matte, [3]);

  // ---------- стол ----------
  const D = L.DESK, HONEY = '#efcfa8', LEG = '#e2b98d';
  const desk = [
    part(RB(D.w, 0.048, D.d, 0.022, 5), HONEY, M([D.x, T - 0.024, D.z]), 0.9),
    part(RB(D.w - 0.14, 0.07, D.d - 0.12, 0.02), '#f5ebdf', M([D.x, T - 0.048 - 0.035, D.z])),
    part(RB(0.52, 0.05, 0.012, 0.006), '#fbf3ea', M([D.x + 0.42, T - 0.083, D.z + (D.d - 0.12) / 2 + 0.004])),
    part(new THREE.SphereGeometry(0.011, 16, 10), HONEY, M([D.x + 0.42, T - 0.083, D.z + (D.d - 0.12) / 2 + 0.014])),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = D.x + sx * (D.w / 2 - 0.08), lz = D.z + sz * (D.d / 2 - 0.08);
    desk.push(part(new THREE.CapsuleGeometry(0.022, T - 0.07, 6, 16), LEG, M([lx, (T - 0.048) / 2 + 0.01, lz]), 0.88));
  }
  add(desk, matte, [2, 3]);

  // ---------- на столе ----------
  const items = [], itemsSatin = [], itemsGlow = [];
  // ноутбук: лиловый алюминий, крышка откинута
  const lp = I.laptop, LAP = '#d6cfe3';
  itemsSatin.push(
    part(RB(lp.w, 0.014, lp.d, 0.006), LAP, M([lp.x, T + 0.007, lp.z]), 0.9),
    part(RB(lp.w - 0.04, 0.002, lp.d * 0.42, 0.001, 2), '#b9b0c9', M([lp.x, T + 0.0145, lp.z - 0.035]), 1),
    part(RB(0.11, 0.0015, 0.065, 0.001, 2), '#e1dbeb', M([lp.x, T + 0.0145, lp.z + 0.075]), 1),
  );
  const lid = M([lp.x, T + 0.012, lp.z - lp.d / 2 + 0.005], [lp.lidAngle, 0, 0]);
  itemsSatin.push(
    part(RB(lp.w, 0.236, 0.008, 0.0039), LAP, lid.clone().multiply(M([0, 0.118, 0])), 0.9),
    part(new THREE.PlaneGeometry(lp.w - 0.012, 0.226), '#463c50', lid.clone().multiply(M([0, 0.12, 0.0042])), 1),
  );
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(lp.w - 0.026, 0.2).applyMatrix4(lid.clone().multiply(M([0, 0.122, 0.0047]))),
    new THREE.MeshBasicMaterial({ map: screenTex(), color: new THREE.Color(0.95, 0.95, 0.95) }));
  scene.add(screen);

  // лампа-грибок: мятная ножка, светящийся опаловый купол
  const lm = I.lamp, MINT = '#a6d6c2';
  itemsSatin.push(
    part(puck(0.085, 0.024, 0.012), MINT, M([lm.x, T, lm.z]), 0.86),
    part(new THREE.CapsuleGeometry(0.016, 0.3, 4, 16), MINT, M([lm.x, T + 0.19, lm.z])),
  );
  itemsGlow.push(
    part(new THREE.SphereGeometry(0.15, 48, 18, 0, 2 * PI, 0, PI / 2), '#fff1df', M([lm.x, T + lm.h - 0.108, lm.z], [0, 0, 0], [1, 0.72, 1]), 0.92),
    part(new THREE.TorusGeometry(0.15, 0.0075, 10, 64), '#ffe9d2', M([lm.x, T + lm.h - 0.108, lm.z], [PI / 2, 0, 0])),
  );
  // провод от лампы за стол
  items.push(part(tube([new V3(lm.x + 0.06, T + 0.005, lm.z - 0.04), new V3(lm.x + 0.1, T + 0.004, lm.z - 0.18), new V3(lm.x + 0.12, T + 0.004, BACK + 0.04), new V3(lm.x + 0.13, T - 0.06, BACK + 0.012)], 0.0035), '#f3e6da'));

  // пилея в горшке: монетки-листья на тонких черешках
  const pl = I.plant, POT = '#eca796';
  itemsSatin.push(
    part(puck(0.078, 0.012, 0.006), '#e39c8b', M([pl.x, T, pl.z])),
    part(cup(0.055, 0.07, 0.1, 0.013), POT, M([pl.x, T + 0.012, pl.z]), 0.86),
  );
  items.push(part(new THREE.CylinderGeometry(0.062, 0.062, 0.006, 32), '#9a7362', M([pl.x, T + 0.098, pl.z])));
  const potTop = T + 0.1;
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996 + rnd() * 0.5, rr = 0.025 + 0.085 * Math.sqrt(rnd()), hh = 0.07 + 0.15 * rnd();
    const tip = new V3(pl.x + Math.cos(a) * rr, potTop + hh, pl.z + Math.sin(a) * rr * 0.8);
    if (tip.z < BACK + 0.05) tip.z = BACK + 0.05;
    items.push(part(tube([new V3(pl.x + Math.cos(a) * 0.01, potTop, pl.z + Math.sin(a) * 0.01), new V3(pl.x + Math.cos(a) * rr * 0.4, potTop + hh * 0.75, pl.z + Math.sin(a) * rr * 0.35), tip], 0.0022, 8, 5), '#9cca95'));
    const n = new V3(Math.cos(a) * 0.8, 1, Math.sin(a) * 0.8).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), n);
    const lr = 0.026 + 0.016 * rnd();
    items.push(part(new THREE.SphereGeometry(1, 20, 10), (x, y) => tmpC.set('#79bb8c').lerp(C('#a6d8a6'), Math.min(1, Math.max(0, (y - potTop) / 0.22))),
      new THREE.Matrix4().compose(tip.clone().addScaledVector(n, 0.002), q, new V3(lr, lr * 0.13, lr)), 0.9));
  }

  // кружка
  const mg = I.mug;
  itemsSatin.push(
    part(cup(0.04, 0.043, 0.095, 0.007, 0.012), '#c6b4e6', M([mg.x, T, mg.z]), 0.86),
    part(new THREE.TorusGeometry(0.027, 0.0078, 12, 28, PI), '#c6b4e6', M([mg.x + 0.042 * Math.cos(0.5), T + 0.05, mg.z + 0.042 * Math.sin(0.5)], [0, -0.5, -PI / 2])),
  );
  items.push(part(new THREE.CylinderGeometry(0.035, 0.035, 0.004, 28), '#a0705a', M([mg.x, T + 0.078, mg.z]), 1));

  // лоток для записок со стикерами и карандашом
  const tr = I.tray, TRAY = '#b1dac8';
  items.push(
    part(RB(tr.w, 0.012, tr.d, 0.005), TRAY, M([tr.x, T + 0.006, tr.z])),
    part(RB(tr.w, 0.034, 0.013, 0.006), TRAY, M([tr.x, T + 0.017, tr.z - tr.d / 2 + 0.0065])),
    part(RB(tr.w, 0.034, 0.013, 0.006), TRAY, M([tr.x, T + 0.017, tr.z + tr.d / 2 - 0.0065])),
    part(RB(0.013, 0.034, tr.d, 0.006), TRAY, M([tr.x - tr.w / 2 + 0.0065, T + 0.017, tr.z])),
    part(RB(0.013, 0.034, tr.d, 0.006), TRAY, M([tr.x + tr.w / 2 - 0.0065, T + 0.017, tr.z])),
    part(RB(0.078, 0.02, 0.078, 0.005), '#f8e3a0', M([tr.x - 0.06, T + 0.022, tr.z], [0, 0.18, 0])),
    part(RB(0.07, 0.012, 0.07, 0.005), '#f7c4cf', M([tr.x + 0.055, T + 0.018, tr.z - 0.02], [0, -0.25, 0])),
    part(new THREE.CapsuleGeometry(0.0045, 0.13, 4, 8), '#f5cf76', M([tr.x + 0.02, T + 0.03, tr.z + 0.055], [0, 0.3, PI / 2])),
  );

  // три скомканные записки
  const paper = ['#fdf6ea', '#f9d4db', '#e6ddf4'];
  I.notes.forEach(([x, z], i) => {
    let g = new THREE.IcosahedronGeometry(1, 3);
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const p = g.attributes.position, s = i * 1.7 + 0.4;
    for (let k = 0; k < p.count; k++) {
      const v = new V3().fromBufferAttribute(p, k);
      const d = 1 + 0.11 * Math.sin(v.x * 6 + s) * Math.cos(v.y * 5 - s * 1.3) + 0.07 * Math.sin(v.z * 9 + s * 2) + 0.05 * Math.sin((v.x + v.y) * 13 + s);
      p.setXYZ(k, v.x * d, v.y * d * 0.9, v.z * d);
    }
    g.computeVertexNormals();
    items.push(part(g, paper[i], M([x, T + 0.022, z], [s, s * 0.7, 0], 0.025), 0.86));
  });
  add(items, matte, [1, 3]); add(itemsSatin, satin, [1, 3]); add(itemsGlow, glow, [1, 3]);

  // ---------- полка с книгами ----------
  const sh = I.shelf, shelf = [
    part(RB(sh.w, 0.032, sh.d, 0.013), HONEY, M([sh.x, sh.y, sh.z]), 0.9),
    part(RB(0.03, 0.09, sh.d * 0.8, 0.013), CREAM, M([sh.x - sh.w / 2 + 0.12, sh.y - 0.055, BACK + sh.d * 0.4])),
    part(RB(0.03, 0.09, sh.d * 0.8, 0.013), CREAM, M([sh.x + sh.w / 2 - 0.12, sh.y - 0.055, BACK + sh.d * 0.4])),
  ];
  const books = [[0.042, 0.22, 0.15, '#f2b39b'], [0.032, 0.19, 0.14, '#b9a6dc'], [0.048, 0.236, 0.16, '#9fd1bd'], [0.036, 0.2, 0.15, '#f3d58a'], [0.042, 0.214, 0.15, '#e99bab']];
  let bx = sh.x - 0.08;
  for (const [w, h, d, c] of books) {
    const y = sh.y + 0.016 + h / 2, z = BACK + 0.012 + d / 2;
    shelf.push(part(RB(w, h, d, 0.007), c, M([bx + w / 2, y, z]), 0.88), part(RB(w * 0.7, 0.018, 0.003, 0.0012, 2), '#fbf3e8', M([bx + w / 2, y + h * 0.22, z + d / 2 + 0.0005]), 1));
    bx += w + 0.004;
  }
  // шестая — лёжа сверху справа? нет: наклонённая, опирается на соседку
  shelf.push(part(RB(0.04, 0.18, 0.14, 0.007), '#a9c8e8', M([bx + 0.06, sh.y + 0.016 + 0.087, BACK + 0.085], [0, 0, -0.32]), 0.88));
  add(shelf, matte, [3]);

  // ---------- полароиды ----------
  const photos = [], pics = [];
  I.photos.forEach(([x, y, tilt], i) => {
    const m = M([x, y, BACK + 0.003], [0, 0, tilt]);
    photos.push(part(RB(0.112, 0.134, 0.004, 0.0018, 2), '#fdfaf5', m, 0.95));
    photos.push(part(RB(0.05, 0.016, 0.0012, 0.0005, 1), ['#f6c9d3', '#bfe0d0', '#f8e1a6', '#cdbde9'][i], m.clone().multiply(M([0.01, 0.064, 0.0025], [0, 0, 0.12 - i * 0.07])), 1));
    const g = new THREE.PlaneGeometry(0.094, 0.094), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 4);
    pics.push(g.applyMatrix4(m.clone().multiply(M([0, 0.011, 0.0022]))));
  });
  add(photos, matte, [3]);
  const picMesh = new THREE.Mesh(mergeGeometries(pics), new THREE.MeshStandardMaterial({ map: photoTex(), roughness: 0.5 }));
  picMesh.receiveShadow = true; scene.add(picMesh);

  // ---------- гирлянда ----------
  const LI = I.lights, wire = [], bulbs = [];
  for (let x0 = LI.x0; x0 < LI.x1 - 0.01; x0 += 0.75) {
    for (let k = 0; k < 12; k++) { const t = k / 12; wire.push(new V3(x0 + 0.75 * t, LI.y - 0.1 * Math.sin(PI * t), BACK + 0.03)); }
    for (const t of [0.25, 0.5, 0.75]) bulbs.push(new V3(x0 + 0.75 * t, LI.y - 0.1 * Math.sin(PI * t) - 0.02, BACK + 0.035));
  }
  wire.push(new V3(LI.x1, LI.y, BACK + 0.03));
  add([part(tube(wire, 0.003, 300, 5), '#b9a79d')], matte, [], false);
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.7, 1.5) }), bulbs.length);
  bulbs.forEach((p, i) => bulbMesh.setMatrixAt(i, M(p.toArray(), [0, 0, 0], [0.012, 0.018, 0.012])));
  scene.add(bulbMesh);

  // ---------- когтеточка ----------
  const sc = I.scratcher, scr = [
    part(RB(0.38, 0.042, 0.38, 0.018), '#c8b6e3', M([sc.x, 0.021, sc.z]), 0.86),
    part(new THREE.CylinderGeometry(0.043, 0.043, 0.54, 20), '#dcbc90', M([sc.x, 0.31, sc.z])),
    part(puck(0.17, 0.05, 0.022), '#efb4c0', M([sc.x, 0.575, sc.z]), 0.86),
    part(tube([new V3(sc.x + 0.12, 0.58, sc.z + 0.08), new V3(sc.x + 0.135, 0.47, sc.z + 0.09), new V3(sc.x + 0.14, 0.37, sc.z + 0.1)], 0.002, 12, 4), '#f3e6da'),
    part(new THREE.SphereGeometry(0.03, 24, 16), '#a6d6c2', M([sc.x + 0.14, 0.345, sc.z + 0.1])),
  ];
  for (let i = 0; i < 31; i++) scr.push(part(new THREE.TorusGeometry(0.047, 0.0088, 8, 28), i % 2 ? '#e7cba2' : '#dfc095', M([sc.x, 0.052 + i * 0.0168, sc.z], [PI / 2, 0, 0]), 1));
  add(scr, matte, [2, 3]);

  // ---------- большое растение ----------
  const bp = I.bigPlant, big = [
    part(puck(0.17, 0.03, 0.013), '#efb4c0', M([bp.x, 0, bp.z]), 0.86),
    part(cup(0.15, 0.19, 0.36, 0.022, 0.03), '#f4ece2', M([bp.x, 0.03, bp.z]), 0.84),
    part(new THREE.CylinderGeometry(0.175, 0.175, 0.01, 32), '#9a7362', M([bp.x, 0.355, bp.z])),
  ];
  for (let i = 0; i < 11; i++) {
    const a = i * 2.39996 + 0.6, el = 0.95 + rnd() * 0.5, sl = 0.42 + rnd() * 0.6;
    const dir = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    if (dir.z < -0.15) dir.z = -dir.z * 0.4;
    const base = new V3(bp.x + dir.x * 0.03, 0.36, bp.z + dir.z * 0.03), tip = base.clone().addScaledVector(dir, sl);
    const mid = base.clone().addScaledVector(dir, sl * 0.5); mid.y -= sl * 0.08; mid.x += dir.x * sl * 0.06; mid.z += dir.z * sl * 0.06;
    big.push(part(tube([base, mid, tip], 0.0055, 16, 6), '#8dbf8a'));
    const len = 0.28 + rnd() * 0.12, wid = 0.085 + rnd() * 0.035;
    const g = new THREE.SphereGeometry(1, 22, 12), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = (p.getY(k) + 1) / 2; // 0 у основания, 1 у кончика
      p.setXYZ(k, p.getX(k) * wid * (1 - 0.35 * t), t * len, p.getZ(k) * 0.012 + 0.09 * t * t * len);
    }
    g.computeVertexNormals();
    const Y = new V3(dir.x * 1.25, dir.y * 0.75, dir.z * 1.25).normalize(), X = new V3().crossVectors(new V3(0, 1, 0), Y).normalize(), Z = new V3().crossVectors(X, Y);
    const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(tip);
    big.push(part(g, (x, y) => tmpC.set('#6aa886').lerp(C('#9fd1a6'), Math.min(1, Math.max(0, (y - 0.5) / 1.1))), m, 0.85));
  }
  add(big, matte, [2, 3]);

  // ---------- свет ----------
  // окружение: светлый сиреневый верх, персиковый горизонт, тёплый «отражённый от пола» низ, яркое пятно со стороны окна
  {
    const env = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), p = g.attributes.position, c = new Float32Array(p.count * 3);
    const top = C('#fbf4ff'), mid = C('#ffe6da'), bot = C('#c99c86').multiplyScalar(0.7);
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / 10, k = t > 0 ? tmpC.copy(mid).lerp(top, Math.sqrt(t)) : tmpC.copy(mid).lerp(bot, Math.sqrt(-t));
      c.set([k.r, k.g, k.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    env.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 2.2), side: THREE.DoubleSide }));
    pane.position.set(-5, 4, -6); pane.lookAt(0, 0, 0); env.add(pane);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose();
    scene.environmentIntensity = 0.8;
  }
  const keyDir = new V3(-0.5, 0.75, 0.5).normalize(); // к ключевому свету: спереди-слева-сверху
  const key = new THREE.DirectionalLight('#fff2ea', 1.9);
  key.position.copy(keyDir).multiplyScalar(6).add(new V3(0, 0.8, -1.2)); key.target.position.set(0, 0.8, -1.2);
  scene.add(key, key.target);

  const sunDir = new V3(...L.SUN.dir).normalize();
  const sun = new THREE.DirectionalLight(L.SUN.color, 5);
  sun.target.position.set(-0.6, 0.9, -1.1);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, -7);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 0.5, far: 15 });
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 9; sun.shadow.blurSamples = 16; sun.shadow.bias = -0.0003;
  scene.add(sun, sun.target);

  const bulb = new THREE.PointLight('#ffc48a', 0.22, 1.8, 2);
  bulb.position.set(lm.x, T + 0.37, lm.z); scene.add(bulb);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ---------- запекание мягких теней ----------
  scene.updateMatrixWorld(true);
  const fsVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const occ = new THREE.ShaderMaterial({
    uniforms: { o: { value: new V3() }, U: { value: new V3() }, V: { value: new V3() }, N: { value: new V3() }, D: { value: new V3() }, hs: { value: new V2() }, far: { value: 0.1 }, pw: { value: 2 } },
    vertexShader: `uniform vec3 o, U, V, N, D; uniform vec2 hs; varying float vS;
      void main(){ vec3 P = (modelMatrix * vec4(position, 1.)).xyz; float s = dot(P - o, N) / dot(D, N); vec3 Q = P - s * D; vS = s;
        gl_Position = vec4(dot(Q - o, U) / hs.x, dot(Q - o, V) / hs.y, 0., 1.); }`,
    fragmentShader: 'uniform float far, pw; varying float vS; void main(){ if (vS < -0.003) discard; gl_FragColor = vec4(pow(clamp(1. - vS / far, 0., 1.), pw)); }',
    side: THREE.DoubleSide, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,
  });
  const blurM = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, d: { value: new V2() } }, vertexShader: fsVert, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main(){
      vec4 s = texture2D(t, vUv) * 0.227027;
      s += (texture2D(t, vUv + d * 1.384615) + texture2D(t, vUv - d * 1.384615)) * 0.316216;
      s += (texture2D(t, vUv + d * 3.230769) + texture2D(t, vUv - d * 3.230769)) * 0.070270;
      gl_FragColor = s; }`,
  });
  const addM = new THREE.ShaderMaterial({ // экранное сложение: out = 1 - (1-out)(1-k·a)
    uniforms: { t: { value: null }, k: { value: 1 } }, vertexShader: fsVert, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D t; uniform float k; varying vec2 vUv; void main(){ float a = pow(texture2D(t, vUv).r, 0.6) * k; gl_FragColor = vec4(a, a, a, 1.); }',
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor,
  });
  const fsq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); fsq.frustumCulled = false; fsq.layers.enableAll();
  const fsScene = new THREE.Scene(); fsScene.add(fsq);
  const anyCam = new THREE.OrthographicCamera(-50, 50, 50, -50, -50, 50);

  function bake({ o, U, V, hu, hv, layer, res, levels }) {
    const [w, h] = res, opt = { type: THREE.HalfFloatType, depthBuffer: false };
    const A = new THREE.WebGLRenderTarget(w, h, opt), B = A.clone(), out = A.clone();
    const N = new V3().crossVectors(U, V);
    occ.uniforms.o.value.copy(o); occ.uniforms.U.value.copy(U); occ.uniforms.V.value.copy(V); occ.uniforms.N.value.copy(N); occ.uniforms.hs.value.set(hu, hv);
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), rt = renderer.getRenderTarget(), tm = renderer.toneMapping;
    renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(out); renderer.clear();
    anyCam.layers.set(layer);
    for (const lv of levels) {
      occ.uniforms.D.value.copy(lv.D || N).normalize(); occ.uniforms.far.value = lv.far; occ.uniforms.pw.value = lv.pw ?? 2;
      const mpp = 2 * hu / w; // метров на пиксель: размытие задано в метрах
      scene.overrideMaterial = occ; renderer.setRenderTarget(A); renderer.clear(); renderer.render(scene, anyCam); scene.overrideMaterial = null;
      fsq.material = blurM;
      for (const px of lv.blur.map((m) => m / mpp)) {
        blurM.uniforms.t.value = A.texture; blurM.uniforms.d.value.set(px / w, 0); renderer.setRenderTarget(B); renderer.render(fsScene, anyCam);
        blurM.uniforms.t.value = B.texture; blurM.uniforms.d.value.set(0, px / h); renderer.setRenderTarget(A); renderer.render(fsScene, anyCam);
      }
      fsq.material = addM; addM.uniforms.t.value = A.texture; addM.uniforms.k.value = lv.k;
      renderer.autoClear = false; renderer.setRenderTarget(out); renderer.render(fsScene, anyCam); renderer.autoClear = true;
    }
    renderer.setRenderTarget(rt); renderer.setClearColor(cc, ca); renderer.toneMapping = tm;
    A.dispose(); B.dispose();
    return out.texture;
  }
  function overlay(geo, r, tex, opacity, tint) {
    const N = new V3().crossVectors(r.U, r.V), p = geo.attributes.position, uv = geo.attributes.uv, P = new V3();
    for (let i = 0; i < p.count; i++) {
      P.fromBufferAttribute(p, i).sub(r.o);
      uv.setXY(i, P.dot(r.U) / r.hu * 0.5 + 0.5, P.dot(r.V) / r.hv * 0.5 + 0.5);
    }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: tint, alphaMap: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.renderOrder = 1; scene.add(m);
    return N;
  }
  // контакт (прямо вниз, резко) + AO (прямо, мягче) + тень ключевого света: ближняя чёткая и дальняя очень мягкая
  const lv = (contact, ao, cast, q = 1, KD = keyDir) => [
    { far: contact[0], k: contact[1], blur: [0.003, 0.0015] },
    { far: ao[0], k: ao[1], blur: [0.012 * q, 0.008 * q, 0.004 * q] },
    { D: KD, far: cast[0] * 0.3, k: cast[1], pw: 1.5, blur: [0.008, 0.005, 0.003] },
    { D: KD, far: cast[0], k: cast[1], pw: 1, blur: [0.035 * q, 0.026 * q, 0.018 * q, 0.011 * q, 0.006 * q] },
  ];
  const TINT = '#5e3f57';
  const rDesk = { o: new V3(D.x, T + 0.0015, D.z), U: new V3(1, 0, 0), V: new V3(0, 0, -1), hu: D.w / 2, hv: D.d / 2, layer: 1, res: [1520, 600], levels: lv([0.02, 0.85], [0.1, 0.6], [0.6, 0.8], 0.6, new V3(-0.7, 0.75, 0.3)) };
  const rWall = { o: new V3(0, 1.4, BACK + 0.002), U: new V3(1, 0, 0), V: new V3(0, 1, 0), hu: 2.6, hv: 1.4, layer: 3, res: [1300, 700], levels: lv([0.03, 0.7], [0.25, 0.55], [0.8, 0.6], 1.5) };
  const rFloor = { o: new V3(0, 0.02, 0.2), U: new V3(1, 0, 0), V: new V3(0, 0, -1), hu: 3, hv: 2.2, layer: 2, res: [1000, 733], levels: lv([0.03, 0.8], [0.3, 0.6], [1.0, 0.5], 2.2, new V3(-0.7, 0.75, 0.3)) };
  overlay(new THREE.PlaneGeometry(D.w - 0.02, D.d - 0.02).rotateX(-PI / 2).translate(D.x, rDesk.o.y, D.z), rDesk, bake(rDesk), 0.9, TINT);
  const wallTex = bake(rWall); // над панелями — у самой стены (полароиды не накрыть), внизу — поверх выпуклых панелей
  overlay(wallShape(W, -2.6, 2.6).translate(0, 0, rWall.o.z), rWall, wallTex, 0.85, TINT);
  overlay(new THREE.PlaneGeometry(5.2, W).translate(0, W / 2, BACK + 0.0145), rWall, wallTex, 0.85, TINT);
  overlay(new THREE.PlaneGeometry(6, 4.4).rotateX(-PI / 2).translate(0, rFloor.o.y, 0.2), rFloor, bake(rFloor), 0.9, TINT);
  renderer.shadowMap.needsUpdate = true;

  // ---------- пост ----------
  // MSAA на half-float целях на встройке стоит ~8 мс — вместо него SMAA в конце
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new V2(256, 256), 0.32, 0.6, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // финиш: мягкая виньетка + едва заметное зерно (в sRGB, после тонмаппинга)
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, asp: { value: 1.6 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float asp; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = (vUv - .5) * vec2(asp, 1.);
        c.rgb *= mix(1., smoothstep(1.25, .35, length(d)), .22);
        c.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) * .012;
        gl_FragColor = c; }`,
  });
  composer.addPass(finish);
  composer.addPass(new SMAAPass(1, 1));

  return {
    render(dt) { composer.render(dt); },
    resize(w, h, pr) { composer.setPixelRatio(pr); composer.setSize(w, h); finish.uniforms.asp.value = w / h; },
  };

  // ---------- текстуры ----------
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function skyTex() {
    const [c, x] = canvas(512, 512), g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#93c2ec'); g.addColorStop(0.5, '#c6ddf3'); g.addColorStop(0.78, '#f9e2d8'); g.addColorStop(1, '#fcd6c6');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    x.filter = 'blur(5px)'; x.fillStyle = 'rgba(255,255,255,.9)';
    for (const [cx, cy, s] of [[150, 150, 1], [370, 250, 0.8], [90, 300, 0.6]]) for (const [dx, dy, r] of [[0, 0, 34], [36, -10, 28], [-34, 6, 24], [66, 8, 20], [-62, 12, 16]]) {
      x.beginPath(); x.arc(cx + dx * s, cy + dy * s, r * s, 0, 2 * PI); x.fill();
    }
    x.filter = 'blur(1.5px)';
    for (const [col, y0, a] of [['#cfe6d6', 432, 30], ['#addbc0', 452, 22]]) {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, 512);
      for (let i = 0; i <= 512; i += 8) x.lineTo(i, y0 - a * Math.sin(i / 512 * PI * 1.6 + y0));
      x.lineTo(512, 512); x.fill();
    }
    return tex(c);
  }
  function screenTex() {
    const [c, x] = canvas(640, 420), g = x.createLinearGradient(0, 0, 640, 420);
    g.addColorStop(0, '#f9cbd8'); g.addColorStop(0.55, '#f3b8cb'); g.addColorStop(1, '#dcc6f0');
    x.fillStyle = g; x.fillRect(0, 0, 640, 420);
    for (const [cx, cy, r, a] of [[110, 90, 120, 0.35], [540, 330, 150, 0.3], [480, 70, 70, 0.25], [160, 360, 80, 0.22]]) {
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = rg; x.fillRect(0, 0, 640, 420);
    }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    x.font = '300 96px "Segoe UI", system-ui, sans-serif'; x.fillText('17:40', 320, 130);
    x.font = '400 22px "Segoe UI", system-ui, sans-serif'; x.globalAlpha = 0.85; x.fillText('среда, 7 октября', 320, 196); x.globalAlpha = 1;
    x.font = `600 62px ${font}`; x.shadowColor = 'rgba(190,90,120,.35)'; x.shadowBlur = 12;
    x.fillText('вместе 740 дней', 320, 286); x.shadowBlur = 0;
    heart(x, 320, 344, 13, '#fff');
    x.globalAlpha = 0.7; x.fillRect(270, 396, 100, 5); x.globalAlpha = 1;
    return tex(c);
  }
  function heart(x, cx, cy, s, col) {
    x.fillStyle = col; x.beginPath(); x.moveTo(cx, cy + s * 0.9);
    x.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.35);
    x.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9); x.fill();
  }
  function photoTex() {
    const [c, x] = canvas(512, 128);
    const cell = (i, f) => { x.save(); x.translate(i * 128, 0); x.beginPath(); x.rect(0, 0, 128, 128); x.clip(); f(); x.restore(); };
    const grad = (a, b) => { const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, 128, 128); };
    cell(0, () => { grad('#f7b9a6', '#fbe0c8'); x.fillStyle = '#fff3d6'; x.beginPath(); x.arc(64, 70, 22, 0, 2 * PI); x.fill(); x.fillStyle = '#b7a6dd'; x.fillRect(0, 80, 128, 48); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(30, 92, 68, 3); x.fillRect(44, 104, 40, 3); });
    cell(1, () => { grad('#f9d0da', '#f3b3c6'); heart(x, 52, 66, 22, '#fff'); heart(x, 82, 58, 14, '#f08aa0'); });
    cell(2, () => {
      grad('#bfe0f3', '#e8f4f1');
      for (const [col, pts] of [['#a9d4bf', [[0, 128], [0, 84], [40, 48], [78, 86], [128, 60], [128, 128]]], ['#7fbf9d', [[0, 128], [0, 104], [52, 72], [100, 104], [128, 92], [128, 128]]]]) {
        x.fillStyle = col; x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.fill();
      }
    });
    cell(3, () => {
      grad('#6f6aa8', '#c5a8d8'); x.fillStyle = '#fff6dc'; x.beginPath(); x.arc(84, 40, 18, 0, 2 * PI); x.fill();
      x.fillStyle = '#8b83bf'; x.beginPath(); x.arc(92, 34, 16, 0, 2 * PI); x.fill();
      x.fillStyle = '#fff'; for (const [a, b] of [[20, 30], [40, 60], [28, 90], [60, 20], [110, 80], [70, 100]]) { x.beginPath(); x.arc(a, b, 1.6, 0, 2 * PI); x.fill(); }
    });
    return tex(c);
  }
  function planks() {
    const [c, x] = canvas(512, 512), n = 12, pw = 512 / n;
    let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      let y = -r() * 300;
      while (y < 512) {
        const len = 260 + r() * 200, l = 0.94 + r() * 0.08;
        x.fillStyle = `rgb(${218 * l | 0},${172 * l | 0},${132 * l | 0})`; x.fillRect(i * pw, y, pw, len);
        x.fillStyle = 'rgba(150,100,70,.18)'; x.fillRect(i * pw, y, pw, 1.5);
        y += len;
      }
      x.fillStyle = 'rgba(150,100,70,.2)'; x.fillRect(i * pw, 0, 1.5, 512);
    }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2.2); t.rotation = PI / 2;
    return t;
  }
}

// рукописный шрифт для экрана: Caveat (свои файлы, @fontsource), без него — системный рукописный
async function handFont() {
  try { await document.fonts.load('600 64px Caveat', 'вместе'); return 'Caveat, "Segoe Print", cursive'; }
  catch { return '"Segoe Print", cursive'; }
}
