// Зоны приближения: невидимые объёмы в комнате, рисованная лупа над зоной и кнопка «назад».
// Полёт камеры и состояния — в room.js; здесь только «куда попал курсор» и HTML поверх сцены.
import * as THREE from 'three';

const LENS = `<svg viewBox="0 0 48 48" width="56" height="56"><g fill="none" stroke="#4a2c2a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
<path d="M20.5 7.5c6.8-.6 12.6 4.6 12.9 11.6.3 7-5.1 12.7-11.9 12.9-6.9.2-12.6-5-13-11.8C8.2 13.4 13.7 8 20.5 7.5z" fill="#fff8ea"/>
<path d="M30.2 29.6l9.6 9.9" stroke-width="5"/><path d="M15.6 15.8c1.4-2 3.4-3 5.8-3.1" stroke="#f39db3"/></g></svg>`;

// list: [{ id, box: [[x0,y0,z0],[x1,y1,z1]], anchor: [x,y,z], pos: [x,y,z], look: [x,y,z] }]
export function createZones({ camera, list, onZoom, onBack }) {
  const zones = list.map((z) => ({ ...z, box3: new THREE.Box3(new THREE.Vector3(...z.box[0]), new THREE.Vector3(...z.box[1])),
    anchorV: new THREE.Vector3(...z.anchor), posV: new THREE.Vector3(...z.pos), lookV: new THREE.Vector3(...z.look) }));
  const lens = Object.assign(document.createElement('button'), { className: 'zlens', innerHTML: LENS, hidden: true, title: 'приблизить' });
  const back = Object.assign(document.createElement('button'), { className: 'zback', textContent: '← назад', hidden: true });
  document.body.append(lens, back);
  let shown = null;
  lens.onclick = () => shown && onZoom(shown);
  back.onclick = () => onBack();
  const tmp = new THREE.Vector3(), hitP = new THREE.Vector3();
  return {
    zones,
    byId: (id) => zones.find((z) => z.id === id),
    // ближайшая зона на луче (Raycaster уже выставлен pick'ом)
    at(ray) {
      let best = null, bd = Infinity;
      for (const z of zones) if (ray.ray.intersectBox(z.box3, hitP)) { const d = hitP.distanceTo(ray.ray.origin); if (d < bd) { bd = d; best = z; } }
      return best;
    },
    contains: (z, ray) => !!ray.ray.intersectBox(z.box3, hitP),
    hover(z) { shown = z; lens.hidden = !z; },
    zoomed(on) { back.hidden = !on; document.body.classList.toggle('zoomed', on); if (on) this.hover(null); },
    // каждый кадр: лупа над якорем зоны
    frame() {
      if (!shown) return;
      tmp.copy(shown.anchorV).project(camera);
      lens.style.left = ((tmp.x + 1) / 2) * innerWidth + 'px';
      lens.style.top = ((1 - tmp.y) / 2) * innerHeight + 'px';
    },
  };
}
