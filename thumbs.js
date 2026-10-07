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

// id: вещь из ITEMS или стол 'd_<вид>'; null — превью нет
export function thumb(id) {
  if (cache.has(id)) return cache.get(id);
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
  const url = R.domElement.toDataURL('image/png');
  scene.remove(g); dispose(g);
  cache.set(id, url);
  return url;
}

// list: [{ id, el }] — заменяет заглушку el (эмодзи) на картинку, по одной за тик
export function fill(list) {
  const q = list.slice();
  const step = () => {
    const x = q.shift();
    if (!x) return;
    const cached = cache.has(x.id);
    if (x.el.isConnected) {
      const u = thumb(x.id);
      if (u) x.el.replaceWith(Object.assign(document.createElement('img'), { className: 'sthumb', src: u, alt: '' }));
    }
    cached ? step() : setTimeout(step, 16);
  };
  step();
}
