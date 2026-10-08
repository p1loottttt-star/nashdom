// Кот одной сплошной поверхностью на скелете (как настоящая игровая модель).
// Форма задаётся гладким объединением капсул и шаров (SDF), поверхность строится один раз (surface nets),
// потом «надевается» на кости: каждая вершина тянется за ближайшими костями с плавными весами.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = Math.random;

// ---------- форма в позе покоя (начало координат — центр туловища) ----------
const HEAD = [0.124, 0.06, 0];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const FRONT = (s) => [0.066, -0.016, s * 0.026];
const BACK = (s) => [-0.066, -0.016, s * 0.028];
const TAIL0 = [-0.112, 0.015, 0], TSEG = 0.03, TN = 9;

function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
// капсула с разными радиусами на концах
function cone(px, py, pz, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const t = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)));
  const dx = qx - bx * t, dy = qy - by * t, dz = qz - bz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t);
}
const ball = (px, py, pz, c, r, sy = 1) => Math.hypot(px - c[0], (py - c[1]) / sy, pz - c[2]) - r;

function field(x, y, z0) {
  const z = z0 * 1.12; // кошки узкие
  // туловище: грудь, мягкий живот, круглые бёдра
  let t = cone(x, y, z, [-0.072, 0.0, 0], [0.068, 0.002, 0], 0.046, 0.047);
  t = smin(t, ball(x, y, z, [0.0, -0.014, 0], 0.044), 0.03);
  t = smin(t, ball(x, y, z, [0.074, -0.008, 0], 0.047), 0.03);
  for (const s of [-1, 1]) t = smin(t, ball(x, y, z, [-0.068, -0.006, s * 0.02], 0.041), 0.03);
  // шея и голова
  t = smin(t, cone(x, y, z, [0.06, 0.018, 0], [0.11, 0.05, 0], 0.035, 0.029), 0.025);
  let h = ball(x, y, z, HEAD, 0.043, 0.95);
  h = smin(h, ball(x, y, z, add3(HEAD, [0.008, 0.019, 0]), 0.034), 0.02);
  for (const s of [-1, 1]) {
    h = smin(h, ball(x, y, z, add3(HEAD, [0.012, -0.013, s * 0.02]), 0.029), 0.02); // щёки
    h = smin(h, ball(x, y, z, add3(HEAD, [0.04, -0.016, s * 0.009]), 0.0125), 0.012); // подушечки с усами
  }
  h = smin(h, ball(x, y, z, add3(HEAD, [0.037, -0.013, 0]), 0.018), 0.014); // мордочка
  h = smin(h, ball(x, y, z, add3(HEAD, [0.03, -0.028, 0]), 0.011), 0.012);  // подбородок
  t = smin(t, h, 0.022);
  // лапы
  let legs = 1;
  for (const s of [-1, 1]) {
    const f = FRONT(s), b = BACK(s);
    let l = cone(x, y, z, f, add3(f, [0, -0.062, 0]), 0.022, 0.015);
    l = smin(l, cone(x, y, z, add3(f, [0, -0.062, 0]), add3(f, [0.002, -0.117, 0]), 0.015, 0.012), 0.01);
    l = smin(l, cone(x, y, z, add3(f, [0.0, -0.121, 0]), add3(f, [0.014, -0.122, 0]), 0.0135, 0.012), 0.012);
    let r = cone(x, y, z, b, add3(b, [0, -0.062, 0]), 0.03, 0.016);
    r = smin(r, cone(x, y, z, add3(b, [0, -0.062, 0]), add3(b, [0.002, -0.117, 0]), 0.015, 0.012), 0.01);
    r = smin(r, cone(x, y, z, add3(b, [0.0, -0.121, 0]), add3(b, [0.014, -0.122, 0]), 0.0135, 0.012), 0.012);
    legs = Math.min(legs, l, r);
  }
  t = smin(t, legs, 0.018);
  // хвост: прямо назад, сужается
  const tip = [TAIL0[0] - TSEG * TN, TAIL0[1], 0];
  t = smin(t, cone(x, y, z, TAIL0, tip, 0.0145, 0.0075), 0.012);
  return t;
}

// ---------- поверхность (naive surface nets) ----------
function polygonize(step) {
  const min = V(-0.42, -0.165, -0.07), max = V(0.2, 0.12, 0.07);
  const nx = Math.ceil((max.x - min.x) / step) + 1, ny = Math.ceil((max.y - min.y) / step) + 1, nz = Math.ceil((max.z - min.z) / step) + 1;
  const val = new Float32Array(nx * ny * nz), id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[id(i, j, k)] = field(min.x + i * step, min.y + j * step, min.z + k * step);
  const cellV = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = val[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      n++;
    }
    cellV[id(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / n) * step, min.y + (j + sy / n) * step, min.z + (k + sz / n) * step);
  }
  const idx = [], P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const grad = (x, y, z) => { const e = step * 0.5; return V(field(x + e, y, z) - field(x - e, y, z), field(x, y + e, z) - field(x, y - e, z), field(x, y, z + e) - field(x, y, z - e)).normalize(); };
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const pa = V(...P(a)), pb = V(...P(b)), pc = V(...P(c));
    const nrm = pb.clone().sub(pa).cross(pc.clone().sub(pa));
    const mid = pa.add(pc).multiplyScalar(0.5);
    if (nrm.dot(grad(mid.x, mid.y, mid.z)) < 0) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++)
    if ((val[id(i, j, k)] < 0) !== (val[id(i + 1, j, k)] < 0)) quad(cellV[id(i, j, k)], cellV[id(i, j - 1, k)], cellV[id(i, j - 1, k - 1)], cellV[id(i, j, k - 1)]);
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++)
    if ((val[id(i, j, k)] < 0) !== (val[id(i, j + 1, k)] < 0)) quad(cellV[id(i, j, k)], cellV[id(i, j, k - 1)], cellV[id(i - 1, j, k - 1)], cellV[id(i - 1, j, k)]);
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++)
    if ((val[id(i, j, k)] < 0) !== (val[id(i, j, k + 1)] < 0)) quad(cellV[id(i, j, k)], cellV[id(i - 1, j, k)], cellV[id(i - 1, j - 1, k)], cellV[id(i, j - 1, k)]);
  // нормали — по градиенту поля (гладко, без «граней»)
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) grad(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]).toArray(nrm, v * 3);
  return { pos: new Float32Array(pos), nrm, idx };
}

// ---------- скелет в позе покоя ----------
// иерархия повторяет прежний «риг», поэтому вся анимация (позы, походка, хвост) работает как раньше
function makeBones() {
  const B = (name, parent, p) => { const b = new THREE.Bone(); b.name = name; b.position.set(...p); parent?.add(b); return b; };
  const body = B('body', null, [0, 0.145, 0]);
  const chest = B('chest', body, [0.03, 0, 0]);
  const pelvis = B('pelvis', body, [-0.03, 0, 0]);
  const neck = B('neck', chest, [0.085 - 0.03, 0.03, 0]);
  const head = B('head', neck, [0.035, 0.03, 0]);
  const legs = [];
  for (const [front, s] of [[true, 1], [true, -1], [false, 1], [false, -1]]) {
    const at = front ? FRONT(s) : BACK(s);
    const par = front ? chest : pelvis, off = front ? 0.03 : -0.03;
    const hip = B('hip', par, [at[0] - off, at[1], at[2]]);
    const knee = B('knee', hip, [0, -0.062, 0]);
    legs.push({ hip, knee, front, left: s > 0 });
  }
  const tail = [];
  let par = B('tail0', pelvis, [TAIL0[0] + 0.03, TAIL0[1], 0]);
  tail.push(par);
  for (let i = 1; i <= TN; i++) { par = B('tail' + i, par, [-TSEG, 0, 0]); tail.push(par); }
  return { body, chest, pelvis, neck, head, legs, tail };
}

// отрезки костей в покое (координаты от центра туловища) — по ним считаем веса
function boneSegments(sk) {
  const segs = [];
  const seg = (bone, a, b, gain = 1) => segs.push({ bone, a: V(...a), b: V(...b), gain });
  seg(sk.chest, [0.0, 0, 0], [0.085, 0, 0]);
  seg(sk.pelvis, [0.0, 0, 0], [-0.105, 0, 0]);
  seg(sk.neck, [0.07, 0.025, 0], [0.11, 0.055, 0]);
  seg(sk.head, HEAD, add3(HEAD, [0.05, -0.012, 0]), 1.4);
  for (const L of sk.legs) {
    const s = L.left ? 1 : -1, at = L.front ? FRONT(s) : BACK(s);
    seg(L.hip, add3(at, [0, -0.012, 0]), add3(at, [0, -0.062, 0]));
    seg(L.knee, add3(at, [0, -0.062, 0]), add3(at, [0.014, -0.125, 0]));
  }
  sk.tail.slice(0, TN).forEach((b, i) => seg(b, [TAIL0[0] - TSEG * i, TAIL0[1], 0], [TAIL0[0] - TSEG * (i + 1), TAIL0[1], 0]));
  return segs;
}

let shared = null;
function sharedGeometry() {
  if (shared) return shared;
  const { pos, nrm, idx } = polygonize(0.0046);
  const sk = makeBones(), segs = boneSegments(sk), order = [];
  sk.body.traverse((b) => b.isBone && order.push(b));
  const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), uv = new Float32Array(n * 2);
  const p = V(), d = V(), ab = V();
  for (let v = 0; v < n; v++) {
    p.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    const w = segs.map((s) => {
      ab.subVectors(s.b, s.a);
      const t = Math.max(0, Math.min(1, d.subVectors(p, s.a).dot(ab) / ab.lengthSq()));
      const dist = d.subVectors(p, s.a).addScaledVector(ab, -t).length();
      return { i: order.indexOf(s.bone), w: s.gain / Math.pow(dist + 0.004, 5) };
    }).sort((a, b) => b.w - a.w).slice(0, 4);
    const sum = w.reduce((a, x) => a + x.w, 0);
    w.forEach((x, k) => { si[v * 4 + k] = x.i; sw[v * 4 + k] = x.w / sum; });
    uv[v * 2] = (p.x + 0.42) * 9; uv[v * 2 + 1] = (p.y + 0.165) * 9 + p.z * 4;
    pos[v * 3 + 1] += 0.145; // геометрия в координатах кота: туловище на высоте 0.145
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(idx);
  shared = g;
  return g;
}

function furTexture(base, dark, light) {
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const px = rnd() * 512, py = rnd() * 512, a = Math.PI + (rnd() - 0.5) * 0.7, l = 3 + rnd() * 7;
    x.strokeStyle = rnd() < 0.5 ? dark : light; x.globalAlpha = 0.1 + rnd() * 0.25; x.lineWidth = 0.7;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l * 0.4); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// точка на поверхности головы по лучу из центра — чтобы глаза, нос и уши сидели ровно на коже
const HEAD_BONE = [0.12, 0.06, 0];
function onSkin(from, dir, sink = 0) {
  const d = V(...dir).normalize();
  let t = 0;
  while (t < 0.09 && field(from[0] + d.x * t, from[1] + d.y * t, from[2] + d.z * t) < 0) t += 0.0004;
  t -= sink;
  return { p: V(from[0] + d.x * t - HEAD_BONE[0], from[1] + d.y * t - HEAD_BONE[1], from[2] + d.z * t - HEAD_BONE[2]), d };
}

// Луч по коту: не по 21 тыс. вершин с пересчётом скина (28 мс на проверку), а по сферам вокруг костей.
// Сферы берутся из самой модели в позе привязки: вершины, где кость главная, → центр и радиус в пространстве кости.
const boneSpheres = new WeakMap(); // геометрия → [{ i, c, r }]
function spheresOf(mesh) {
  if (boneSpheres.has(mesh.geometry)) return boneSpheres.get(mesh.geometry);
  const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const inv = mesh.skeleton.boneInverses, groups = new Map(), v = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    let best = 0;
    for (let j = 1; j < 4; j++) if (sw.getComponent(k, j) > sw.getComponent(k, best)) best = j;
    const b = si.getComponent(k, best);
    v.fromBufferAttribute(pos, k).applyMatrix4(mesh.bindMatrix).applyMatrix4(inv[b]);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(v.clone());
  }
  const out = [];
  for (const [i, pts] of groups) {
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
    const d = pts.map((p) => p.distanceTo(c)).sort((a, b) => a - b);
    out.push({ i, c, r: d[Math.floor(d.length * 0.9)] }); // 90-й процентиль: шерсть по краям не раздувает сферу
  }
  boneSpheres.set(mesh.geometry, out);
  return out;
}
function boneRaycast(mesh) {
  const sph = new THREE.Sphere(), hit = new THREE.Vector3();
  return (raycaster, out) => {
    let best = null;
    for (const { i, c, r } of spheresOf(mesh)) {
      const bone = mesh.skeleton.bones[i];
      sph.center.copy(c).applyMatrix4(bone.matrixWorld);
      sph.radius = r * bone.matrixWorld.getMaxScaleOnAxis();
      if (!raycaster.ray.intersectSphere(sph, hit)) continue;
      const distance = raycaster.ray.origin.distanceTo(hit);
      if (distance < raycaster.near || distance > raycaster.far || (best && best.distance <= distance)) continue;
      best = { distance, point: hit.clone(), object: mesh };
    }
    if (best) out.push(best);
  };
}

export function buildRig(o) {
  const fur = furTexture(o.fur, o.furDark, o.furLight);
  const furM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: fur, bumpMap: fur, bumpScale: 0.5, roughness: 0.9, sheen: 1, sheenRoughness: 0.5, sheenColor: o.sheen });
  const innerM = new THREE.MeshStandardMaterial({ color: o.inner, roughness: 0.75 });
  const root = new THREE.Group(); root.scale.setScalar(o.scale);
  const sk = makeBones();
  root.add(sk.body);
  const bones = [];
  sk.body.traverse((b) => b.isBone && bones.push(b));
  const mesh = new THREE.SkinnedMesh(sharedGeometry(), furM);
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.raycast = boneRaycast(mesh);

  const m = (geo, mat, parent, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; parent.add(me); return me; };
  const head = sk.head; // центр головы
  const nose = onSkin(add3(HEAD, [0.02, -0.006, 0]), [1, 0.3, 0], 0.0015);
  m(new THREE.SphereGeometry(0.0062, 10, 8), new THREE.MeshPhysicalMaterial({ color: o.nose, roughness: 0.35, clearcoat: 0.6 }), head, nose.p.x, nose.p.y, 0).scale.set(0.6, 0.55, 1);

  const eyesOpen = [], eyesClosed = [], ears = [];
  const irisM = new THREE.MeshPhysicalMaterial({ color: o.iris, roughness: 0.12, clearcoat: 1, emissive: o.iris, emissiveIntensity: 0.18 });
  const pupilM = new THREE.MeshStandardMaterial({ color: '#0b090d', roughness: 0.2 });
  const glintM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lidM = new THREE.MeshBasicMaterial({ color: o.lid });
  for (const s of [-1, 1]) {
    const es = onSkin(add3(HEAD, [0, 0.006, 0]), [0.8, 0.16, s * 0.52], 0.0045);
    const eye = new THREE.Group(); eye.position.copy(es.p); eye.rotation.y = -Math.atan2(es.d.z, es.d.x); head.add(eye);
    m(new THREE.SphereGeometry(0.0118, 18, 12), irisM, eye).scale.set(0.5, 0.85, 1.12);
    m(new THREE.SphereGeometry(0.006, 12, 8), pupilM, eye, 0.0045, 0, 0).scale.set(0.35, 1.3, 0.5);
    m(new THREE.SphereGeometry(0.0022, 6, 4), glintM, eye, 0.0064, 0.0038, 0.0028);
    eyesOpen.push(eye);
    const lp = es.p.clone().addScaledVector(es.d, 0.005);
    const lid = m(new THREE.TorusGeometry(0.009, 0.0016, 4, 12, Math.PI), lidM, head, lp.x, lp.y - 0.002, lp.z);
    lid.rotation.set(0, Math.PI / 2 - Math.atan2(es.d.z, es.d.x), Math.PI); lid.visible = false;
    eyesClosed.push(lid);
    // ухо: тонкая «ракушка», основание утоплено в голову
    const ea = onSkin(add3(HEAD, [-0.004, 0, 0]), [-0.05, 0.85, s * 0.52], 0.006);
    const ear = new THREE.Group(); ear.position.copy(ea.p); ear.rotation.set(s * -0.55, 0, -0.12); head.add(ear);
    m(new THREE.ConeGeometry(0.024, 0.042, 20), furM, ear, 0, 0.018, 0).scale.set(0.5, 1, 1);
    m(new THREE.ConeGeometry(0.0225, 0.037, 20), innerM, ear, 0.003, 0.016, 0).scale.set(0.32, 1, 1);
    ears.push(ear);
  }
  const wpts = [];
  for (const s of [-1, 1]) { const w = onSkin(add3(HEAD, [0.04, -0.016, s * 0.009]), [0.5, 0, s * 0.85], 0.001).p; for (let i = 0; i < 3; i++) wpts.push(w.x, w.y, w.z, w.x + 0.016, w.y - 0.008 + i * 0.008, w.z + s * 0.065); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpts, 3));
  head.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: o.whisker, transparent: true, opacity: 0.6 })));

  const collar = m(new THREE.TorusGeometry(0.037, 0.005, 8, 32), new THREE.MeshStandardMaterial({ color: o.collar, roughness: 0.5 }), sk.neck, 0.008, -0.004, 0);
  collar.rotation.set(0, Math.PI / 2, 0.55);
  m(new THREE.SphereGeometry(0.0072, 12, 8), new THREE.MeshStandardMaterial({ color: '#e9c46a', metalness: 0.9, roughness: 0.25 }), sk.neck, 0.032, -0.034, 0);
  if (o.bow) {
    const bowM = new THREE.MeshStandardMaterial({ color: o.bow, roughness: 0.45 });
    const bow = new THREE.Group(); bow.position.set(-0.004, 0.036, -0.034); bow.rotation.x = 0.55; head.add(bow);
    for (const s of [-1, 1]) m(new THREE.ConeGeometry(0.011, 0.024, 12), bowM, bow, s * 0.012, 0, 0).rotation.z = s * Math.PI / 2;
    m(new THREE.SphereGeometry(0.006, 8, 6), bowM, bow);
  }
  return { root, body: sk.body, chest: sk.chest, pelvis: sk.pelvis, legs: sk.legs, neck: sk.neck, head, ears, eyesOpen, eyesClosed, tail: sk.tail, mesh };
}
