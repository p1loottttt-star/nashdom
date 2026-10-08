// Превью вещей и столов для магазина: маленький отдельный рендер в том же тун-стиле (toonify + обводка), картинки — в памяти.
// Рисуем по одной за тик (fill), чтобы открытие магазина не подвисало на компиляции шейдеров.
import * as THREE from 'three';
import { ITEMS, buildDesk } from './furniture.js';
import { toonify, OUTLINE } from './toon.js';

const S = 192, cache = new Map(), V3 = THREE.Vector3;
let R, scene, cam;
function setup() {
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1); R.setSize(S, S, false);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff2e2', '#cdb2e6', 1.75));
  const key = new THREE.DirectionalLight('#ffd49a', 2.0); key.position.set(-1.5, 2.5, 2.5); scene.add(key);
  const fill = new THREE.DirectionalLight('#ffeedd', 0.9); fill.position.set(2, 1.5, 3); scene.add(fill); // свет как в лаборатории (lab/cartoon.js): полусфера + тёплое «солнце» + заполняющий
  cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
}
// общие материалы обводки (кэш toon.js) не выбрасываем — ими рисует и комната
function dispose(g) {
  g.traverse((o) => {
    o.geometry?.dispose();
    if (o.userData.isOutline) return; // материал обводки общий (toon.js)
    for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
  });
}

// id: вещь из ITEMS или стол 'd_<вид>'; картинка (blob) или null — превью нет
function render(id) {
  const desk = id.startsWith('d_'), def = ITEMS[id];
  if (!desk && !def) return null;
  R || setup();
  const g = desk ? buildDesk(id.slice(2)).group : def.build();
  g.userData.update?.(0, 0);
  scene.add(g); toonify(g); g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new V3()), r = box.getSize(new V3()).length() / 2;
  const dir = def?.mount === 'wall' ? new V3(0.3, 0.15, 1) : new V3(0.55, 0.6, 1);
  cam.position.copy(c).addScaledVector(dir.normalize(), (r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 0.92);
  cam.lookAt(c);
  const w = OUTLINE.uW.value, a = OUTLINE.uAspect.value;
  OUTLINE.uW.value = 0.011; OUTLINE.uAspect.value = 1; // в маленькой картинке обводка толще, чем в комнате
  R.render(scene, cam);
  OUTLINE.uW.value = w; OUTLINE.uAspect.value = a;
  scene.remove(g); dispose(g);
  return new Promise((ok) => R.domElement.toBlob(ok, 'image/png')); // кодирование не в главном потоке (toDataURL стоил ~40 мс)
}

// Превью рисуются один раз на браузер и лежат в Cache Storage: отдельный WebGL-контекст компилирует свои шейдеры
// (~200 мс), а сама вещь собирается 20–60 мс. Ключ — отпечаток кода вещей и стиля (__ART__, считается при сборке):
// поменялась вещь — превью перерисуются сами, старые кеши удаляются.
const CACHE = 'thumbs-' + __ART__;
const store = globalThis.caches?.open(CACHE).catch(() => null) ?? Promise.resolve(null);
globalThis.caches?.keys().then((ks) => ks.filter((k) => k.startsWith('thumbs-') && k !== CACHE).forEach((k) => caches.delete(k))).catch(() => {});
async function thumb(id) {
  if (cache.has(id)) return cache.get(id);
  const c = await store, key = '/__thumb/' + id + '.png';
  let blob = await c?.match(key).then((r) => r?.blob()).catch(() => null);
  const fresh = !blob;
  if (fresh) { blob = await render(id); if (blob) c?.put(key, new Response(blob, { headers: { 'content-type': 'image/png' } })).catch(() => {}); }
  const url = blob ? URL.createObjectURL(blob) : null;
  cache.set(id, url);
  return { url, fresh };
}

// list: [{ id, el }] — заменяет заглушку el (эмодзи) на картинку; новые рисуются по одной за тик
export async function fill(list) {
  for (const x of list) {
    if (!x.el.isConnected) continue;
    const t = await thumb(x.id), url = typeof t === 'string' ? t : t?.url;
    if (url && x.el.isConnected) x.el.replaceWith(Object.assign(document.createElement('img'), { className: 'sthumb', src: url, alt: '' }));
    if (t?.fresh) await new Promise((r) => setTimeout(r, 16));
  }
}
