// Мультяшный стиль дома (эталон — lab/cartoon.js): тун в 3 полосы с тёплыми сиреневыми тенями и ободком света,
// обводка «вывернутой оболочкой» постоянной толщины на экране, пухлая геометрия, рисованные холсты, ореолы вместо bloom.
// Неподвижное собирается Batch'ем в один меш + одну оболочку (мало вызовов); подвижное и сменное — toonify(root).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

export const P = {
  wall: '#fbe9d6', jamb: '#f1d2c2', cream: '#fff4e2', white: '#fffaf1',
  sage: '#a3c49b', sageL: '#b9d6ae', sageD: '#86ab80',
  wood: '#e3a462', woodD: '#c98549', woodL: '#efbd80',
  pink: '#f39db3', pinkL: '#f9c8d3', rose: '#e0708f', coral: '#f28c6f',
  lav: '#bba8e0', lavD: '#9a86c6', butter: '#f7d277', mint: '#9fdac6', sky: '#8fc6ec',
  terra: '#e08660', leaf: '#6db35e', leafD: '#529a4c', leafL: '#86c770',
  ink: '#4a2c2a', plum: '#5d4566', paper: '#fff8ea',
};
const col = (h) => new THREE.Color(h);
const INK = col(P.ink);

// ---------- тун-материал ----------
const gd = new Uint8Array(32);
for (let i = 0; i < 32; i++) { const d = ((i + 0.5) / 32) * 2 - 1; gd[i] = d < 0.03 ? 0 : d < 0.42 ? 150 : 255; }
export const grad = new THREE.DataTexture(gd, 32, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.LinearFilter; grad.generateMipmaps = false; grad.needsUpdate = true; // линейный: узкий переход между полосами — край тени не «лесенкой» и не мерцает при движении

// общие для всех тун-материалов: цвет тени (ночью — синее) и ободок света со стороны окна
export const TOON = { uTint: { value: new THREE.Vector3(0.78, 0.68, 0.96) }, uRim: { value: new THREE.Vector3(0.3, 0.26, 0.18) } };
function patch(s) {
  Object.assign(s.uniforms, TOON);
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform vec3 uRim;')
    .replace('#include <opaque_fragment>', `{
      const vec3 LW = vec3(0.299, 0.587, 0.114);
      float lv = dot(outgoingLight, LW) / max(dot(diffuseColor.rgb, LW), 1e-3);
      outgoingLight *= mix(uTint, vec3(1.0), smoothstep(0.42, 0.85, lv));
      float rim = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
      outgoingLight += diffuseColor.rgb * uRim * smoothstep(0.66, 0.7, rim) * clamp(dot(normal, vec3(-0.7, 0.7, 0.0)) * 1.5, 0.0, 1.0);
    }
    #include <opaque_fragment>`);
}
export function toon(o = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: grad, ...o });
  m.onBeforeCompile = patch;
  return m;
}

// ---------- обводка ----------
// uW — толщина в долях высоты экрана, uAspect — ширина/высота; ставит resize
export const OUTLINE = { uW: { value: 0.0045 }, uAspect: { value: 1.6 } };
const outlineMats = new Map();
// обводка отдельного меша: тот же меш (и кости), вершины сдвинуты по нормали в clip-space, рисуются задние грани
function outlineMat(color, w) {
  const key = color.getHexString() + w;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, OUTLINE);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uW, uAspect;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        #ifdef USE_SKINNING
          vec3 on = normalize(transformedNormal);
        #else
          vec3 on = normalize(normalMatrix * normal);
        #endif
        vec2 od = on.xy / max(length(on.xy), 0.35);
        gl_Position.xy += od * ${w.toFixed(3)} * uW * vec2(1.0 / uAspect, 1.0) * gl_Position.w;
      }`);
  };
  m.customProgramCacheKey = () => 'outline' + w;
  outlineMats.set(key, m);
  return m;
}
// у коробок нормали разрезаны по рёбрам — оболочка по ним рвётся; для неё берём сглаженную копию
const smoothCache = new WeakMap();
function smoothed(g) {
  if (smoothCache.has(g)) return smoothCache.get(g);
  let h = new THREE.BufferGeometry();
  for (const k of ['position', 'skinIndex', 'skinWeight']) if (g.attributes[k]) h.setAttribute(k, g.attributes[k].clone());
  if (g.index) h.setIndex(g.index.clone());
  h = mergeVertices(h, 1e-4); h.computeVertexNormals();
  smoothCache.set(g, h);
  return h;
}
const noRay = () => {};
// неподвижный слитый меш: луч мыши идёт по дереву (BVH), а не по всем треугольникам (было 6 мс на 33 тыс.)
export function fastRay(mesh) {
  mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
  mesh.raycast = acceleratedRaycast;
  return mesh;
}
export function outlineOf(mesh, w = 1, color) {
  const base = color ? col(color) : (mesh.material?.color ? mesh.material.color.clone() : col('#888'));
  const c = base.multiplyScalar(0.3).lerp(INK, 0.6);
  // живая геометрия (шторы, записки) меняется каждый кадр — копию не делаем, обводка идёт по ней же
  const geo = mesh.userData.liveGeo || mesh.isSkinnedMesh ? mesh.geometry : smoothed(mesh.geometry);
  const o = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(geo, outlineMat(c, w)) : new THREE.Mesh(geo, outlineMat(c, w));
  if (mesh.isSkinnedMesh) { o.bindMode = mesh.bindMode; o.bind(mesh.skeleton, mesh.bindMatrix); }
  o.userData.isOutline = true;
  o.castShadow = o.receiveShadow = false;
  o.raycast = noRay; // клики и «расставить» не должны попадать в оболочку
  o.renderOrder = 1; // после заливки: ранний z-тест отбрасывает скрытые пиксели оболочки
  o.frustumCulled = mesh.frustumCulled;
  mesh.add(o);
  mesh.userData.outline = o;
  return o;
}

// ---------- перевод готовых объектов на тун ----------
const toonCache = new WeakMap();
function toToon(m) {
  if (!m || !m.isMeshStandardMaterial) return m; // Basic (свечение, экраны), Shader, Points — как есть
  if (toonCache.has(m)) return toonCache.get(m);
  const t = toon({
    map: m.map, alphaMap: m.alphaMap, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
    transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, depthWrite: m.depthWrite,
    vertexColors: m.vertexColors, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
  });
  // тот же объект цвета: код, который потом перекрашивает исходный материал, перекрашивает и тун
  t.color = m.color; t.emissive = m.emissive;
  t.name = m.name; t.userData = m.userData;
  // прозрачность и видимость тоже живут в исходном (подарки тают, подсветка мигает)
  for (const k of ['opacity', 'transparent', 'visible']) Object.defineProperty(t, k, { get: () => m[k], set: (v) => { m[k] = v; }, configurable: true });
  toonCache.set(m, t);
  return t;
}
const opaque = (mat) => !(Array.isArray(mat) ? mat : [mat]).some((m) => !m || m.transparent || m.isMeshBasicMaterial || m.isShaderMaterial || m.isPointsMaterial);
const sphere = new THREE.Sphere(), sc = new THREE.Vector3();
const FLAT = new Set(['PlaneGeometry', 'CircleGeometry', 'ShapeGeometry']); // у плоского нет толщины — оболочка не видна, только лишний вызов
// root: группа или меш. Мелочь (глаза, блики) и прозрачное — без обводки; userData.noOutline — вручную
export function toonify(root, { outline = true, width = 1, minSize = 0.012 } = {}) {
  const list = [];
  root.traverse((m) => { if (m.isMesh && !m.userData.isOutline) list.push(m); });
  for (const m of list) {
    m.material = Array.isArray(m.material) ? m.material.map(toToon) : toToon(m.material);
    // прозрачное двустороннее three рисует в два прохода и перед каждым ставит needsUpdate — подбор шейдера дважды за кадр.
    // У нас такое не пишет глубину (лучи, конфетти, стекло) — порядок граней не виден, хватает одного прохода
    for (const mt of [].concat(m.material)) if (mt?.transparent && mt.side === THREE.DoubleSide) mt.forceSinglePass = true;
    if (!outline || m.userData.noOutline || m.userData.outline || m.isInstancedMesh || (FLAT.has(m.geometry.type) && !m.userData.liveGeo) || !opaque(m.material)) continue;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    sphere.copy(m.geometry.boundingSphere); m.getWorldScale(sc);
    if (sphere.radius * Math.max(sc.x, sc.y, sc.z) < minSize) continue;
    outlineOf(m, width);
  }
  return root;
}

// ---------- холсты и геометрия ----------
export function canvasTex(w, h, draw, repeat, aniso = 4) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; if (Array.isArray(repeat)) t.repeat.set(...repeat); }
  return t;
}
export const blob = (x, cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
export const heartPath = (x, cx, cy, s) => {
  x.beginPath(); x.moveTo(cx, cy + s * 0.35);
  x.bezierCurveTo(cx - s * 1.1, cy - s * 0.35, cx - s * 0.45, cy - s * 1.05, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.45, cy - s * 1.05, cx + s * 1.1, cy - s * 0.35, cx, cy + s * 0.35);
};
const V2 = (x, y) => new THREE.Vector2(x, y);
export const G = {
  smooth(g) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4); g.computeVertexNormals(); return g; },
  rbox: (w, h, d, r = 0.012, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01)),
  lathe: (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([a, b]) => V2(a, b)), seg),
  cyl: (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg),
  sph: (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs),
  leaf(len, wd, fold = 0.35, droop = 0.25) {
    const s = new THREE.Shape(); s.moveTo(0, 0);
    s.bezierCurveTo(wd * 0.62, len * 0.08, wd * 0.62, len * 0.72, 0, len);
    s.bezierCurveTo(-wd * 0.62, len * 0.72, -wd * 0.62, len * 0.08, 0, 0);
    const t = Math.max(0.003, len * 0.02);
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.8, bevelSize: t * 0.7, bevelSegments: 2, curveSegments: 8 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) - t / 2 + Math.abs(x) * fold - (y / len) ** 2 * len * droop); }
    return G.smooth(g);
  },
  heart(s, d, curve = 8) { // curve — гладкость контура: крупным сердцам нужно больше
    const h = new THREE.Shape(); h.moveTo(0, -s * 0.35);
    h.bezierCurveTo(-s * 1.1, s * 0.35, -s * 0.45, s * 1.05, 0, s * 0.45);
    h.bezierCurveTo(s * 0.45, s * 1.05, s * 1.1, s * 0.35, 0, -s * 0.35);
    return new THREE.ExtrudeGeometry(h, { depth: d, bevelEnabled: true, bevelThickness: d * 0.5, bevelSize: d * 0.5, bevelSegments: curve > 8 ? 4 : 2, curveSegments: curve });
  },
};

// ---------- общая оболочка обводки: цвет и толщина — в вершинах, один материал на всех ----------
function hullGeo(g, c, ow) {
  if (g.index) g = g.toNonIndexed();
  let h = new THREE.BufferGeometry(); h.setAttribute('position', g.attributes.position.clone());
  h = mergeVertices(h, 1e-4); h.computeVertexNormals();
  const n = h.attributes.position.count, oc = new Float32Array(n * 3);
  const tc = col(c).multiplyScalar(0.3).lerp(INK, 0.6);
  for (let i = 0; i < n; i++) tc.toArray(oc, i * 3);
  h.setAttribute('ocol', new THREE.BufferAttribute(oc, 3)); h.setAttribute('ow', new THREE.BufferAttribute(new Float32Array(n).fill(ow), 1));
  return h;
}
let hullMat = null;
const getHullMat = () => hullMat ||= new THREE.ShaderMaterial({
  side: THREE.BackSide, uniforms: OUTLINE,
  vertexShader: `attribute vec3 ocol; attribute float ow; uniform float uW, uAspect; varying vec3 vC;
    void main() {
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      vec2 d = n.xy / max(length(n.xy), 0.35);
      clip.xy += d * ow * uW * vec2(1.0 / uAspect, 1.0) * clip.w;
      gl_Position = clip; vC = ocol;
    }`,
  fragmentShader: 'varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }',
});
function hullMesh(hulls) {
  const o = new THREE.Mesh(mergeGeometries(hulls), getHullMat());
  o.renderOrder = 1; o.raycast = noRay; o.userData.isOutline = true;
  return o;
}

// ---------- вещь: неподвижные детали (прямые дети root с однотонным тун-материалом) → один меш + одна оболочка ----------
// Не трогаем: поверхности (userData.surface — по ним целится «расставить»), текстуры, прозрачное, свечение, двусторонние,
// вложенные группы (их крутит анимация) и меши с детьми. Было ~20 мешей и ~20 обводок на вещь — стало 2 вызова.
const bakeable = (m) => {
  const mt = m.material;
  return m.isMesh && !m.isInstancedMesh && !m.children.length && !m.userData.surface && !Array.isArray(mt) && mt.isMeshToonMaterial
    && !mt.map && !mt.transparent && mt.side === THREE.FrontSide && !(mt.emissiveIntensity > 0 && mt.emissive?.getHex());
};
export function bake(root, minSize = 0.012) {
  const parts = root.children.filter(bakeable);
  if (parts.length < 2) return root;
  const solids = [], hulls = [];
  for (const m of parts) {
    m.updateMatrix();
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    const n = g.attributes.position.count, ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) m.material.color.toArray(ca, i * 3);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal); out.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    solids.push(out);
    g.computeBoundingSphere();
    if (!m.userData.noOutline && g.boundingSphere.radius >= minSize) hulls.push(hullGeo(g, m.material.color, 1));
    root.remove(m);
  }
  for (const m of parts) { m.geometry.dispose(); m.material.dispose(); } // общие между деталями — освобождаем после
  const solid = fastRay(new THREE.Mesh(mergeGeometries(solids), toon({ vertexColors: true })));
  solid.castShadow = solid.receiveShadow = true; solid.userData.noOutline = true;
  if (hulls.length) solid.add(hullMesh(hulls));
  root.add(solid);
  return root;
}

// ---------- сборщик неподвижного: всё в один меш с цветами вершин + одна общая оболочка ----------
export class Batch {
  constructor(scene) { this.scene = scene; this.M = new THREE.Matrix4(); this.stack = []; this.solids = []; this.hulls = []; this.tmp = new THREE.Object3D(); }
  mat4(p = [0, 0, 0], r = [0, 0, 0], s = 1) {
    const t = this.tmp; t.position.set(...p); t.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ');
    if (typeof s === 'number') t.scale.setScalar(s); else t.scale.set(...s);
    t.updateMatrix(); return t.matrix.clone();
  }
  group(p, r, fn) { this.stack.push(this.M.clone()); this.M.multiply(this.mat4(p, r)); fn(); this.M.copy(this.stack.pop()); }
  bake(g, o) { return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.M, this.mat4(o.p, o.r, o.s))); }
  hull(g, c, ow) { this.hulls.push(hullGeo(g, c, ow)); }
  // o: { p, r, s, ow — толщина обводки (0 = без) }
  add(g, color, o = {}) {
    if (g.index) g = g.toNonIndexed();
    this.bake(g, o);
    const c = col(color), n = g.attributes.position.count, ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(ca, i * 3);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    this.solids.push(out);
    if ((o.ow ?? 1) > 0) this.hull(g, c, o.ow ?? 1);
    return out;
  }
  // отдельный меш со своим материалом (текстура), но его обводка — в общей оболочке; кладётся в сцену в мировых координатах
  addMesh(g, material, o = {}, color = '#888') {
    this.bake(g, o);
    const m = new THREE.Mesh(g, material);
    m.castShadow = o.cast ?? true; m.receiveShadow = true; m.userData.noOutline = true; this.scene.add(m); // обводка — в общей оболочке
    if ((o.ow ?? 1) > 0) this.hull(g, col(color), o.ow ?? 1);
    return m;
  }
  finish() {
    const solid = fastRay(new THREE.Mesh(mergeGeometries(this.solids), toon({ vertexColors: true })));
    solid.castShadow = solid.receiveShadow = true; solid.userData.noOutline = true; this.scene.add(solid);
    const outline = hullMesh(this.hulls); this.scene.add(outline);
    this.solids = []; this.hulls = [];
    return { solid, outline };
  }
}

// ---------- ореолы: аддитивные кружки вместо bloom (дёшево на встроенной графике) ----------
// list: [x, y, z, цвет, размер, фаза (−1 = не мерцает)]; uT — время; uK — общая яркость (лампа/гирлянда гаснут днём)
export function halos(list, uT, uK = { value: 1 }) {
  const n = list.length, pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), hc = new Float32Array(n * 12), hs = new Float32Array(n * 4), ph = new Float32Array(n * 4), idx = [];
  list.forEach(([x, y, z, c, s, p], i) => {
    const cl = col(c);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], k) => {
      pos.set([x, y, z], (i * 4 + k) * 3); cor.set([a, b], (i * 4 + k) * 2); cl.toArray(hc, (i * 4 + k) * 3); hs[i * 4 + k] = s; ph[i * 4 + k] = p;
    });
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('corner', new THREE.BufferAttribute(cor, 2));
  g.setAttribute('hcol', new THREE.BufferAttribute(hc, 3)); g.setAttribute('hs', new THREE.BufferAttribute(hs, 1)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT, uK },
    vertexShader: `attribute vec2 corner; attribute vec3 hcol; attribute float hs, ph; uniform float uT; varying vec2 vC; varying vec3 vCol;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += corner * hs; vC = corner;
        vCol = hcol * (ph >= 0.0 ? 0.8 + 0.2 * sin(uT * 1.6 + ph) : 1.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uK; varying vec2 vC; varying vec3 vCol;
      void main() { float r = length(vC); float a = (1.0 - smoothstep(0.0, 1.0, r)); a = a * a * 0.55 + smoothstep(0.35, 0.0, r) * 0.25; gl_FragColor = vec4(vCol * a * uK, 1.0); }`,
  }));
  m.frustumCulled = false; m.renderOrder = 10; m.raycast = noRay;
  return m;
}

// ---------- мягкие пятна-тени под предметами (как в Animal Crossing): одна сетка ----------
// list: [x, y, z, радиус по x, радиус по z, плотность]
let blobTex = null;
export function blobs(list) {
  blobTex ||= canvasTex(128, 128, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.62, 'rgba(255,255,255,.9)'); g.addColorStop(0.85, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
  const gs = list.map(([x, y, z, rx, rz, a]) => {
    const g = new THREE.PlaneGeometry(rx * 2, rz * 2).rotateX(-Math.PI / 2).translate(x, y, z);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(4 * 3).fill(a), 3)); return g;
  });
  const m = new THREE.Mesh(mergeGeometries(gs), new THREE.MeshBasicMaterial({ map: blobTex, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'gl_FragColor = vec4(vec3(0.11, 0.05, 0.15), diffuseColor.a * vColor.r);'); };
  m.renderOrder = 2; m.raycast = noRay;
  return m;
}

// ---------- пост: сцена в MSAA-цель (8 бит sRGB) → один проход: виньетка, вспышка, вывод ----------
// ponytail: без HDR/bloom — на встроенной графике цепочка стоила ~25 мс; свечение дают ореолы
export function createPost(renderer) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = { tScene: { value: rt.texture }, uFlash: { value: 0 }, uVig: { value: new THREE.Color(0.8, 0.68, 0.82) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tScene; uniform float uFlash; uniform vec3 uVig; varying vec2 vUv;
      void main() { vec3 c = texture2D(tScene, vUv).rgb;
        float v = smoothstep(0.42, 1.0, length((vUv - 0.5) * vec2(1.3, 1.0)) * 1.25);
        c *= mix(vec3(1.0), uVig, v * 0.6);
        c = mix(c, vec3(0.92, 0.95, 1.0), uFlash);
        gl_FragColor = linearToOutputTexel(vec4(c, 1.0)); }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  return {
    rt, uniforms,
    render(world, camera) {
      renderer.setRenderTarget(rt); renderer.render(world, camera);
      renderer.setRenderTarget(null); renderer.render(scene, cam);
    },
    resize(w, h, pr, samples) {
      if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
      rt.setSize(Math.round(w * pr), Math.round(h * pr));
      OUTLINE.uAspect.value = w / h;
    },
  };
}
