# Зоны приближения — план

> Исполнение: inline в этой же сессии (контекст room.js уже собран). Спека: `docs/specs/2026-10-07-zoom-zones-design.md`.

**Цель:** стена с фото, полка с альбомами и стол приближаются по клику на рисованную лупу/свободную часть зоны.
**Устройство:** `zones.js` (объёмы, лупа, кнопка «назад») + состояние `zoom` в `room.js`; полёт — существующий `tween`.
**Стек:** three r170 из importmap, без сборки. Юнит-тестов нет (three не грузится в node) — проверка в браузере через `?debug`.

## Файлы
- Create `zones.js` — объёмы зон (Box3), попадание луча, DOM лупы и кнопки «назад», позиция лупы на экране.
- Modify `room.js` — список зон, состояние `zoom`, `idle()` / `view()` для возврата из действий, обработчики наведения/клика/Esc/колеса, покачивание в приближении, ручки `?debug`.
- Modify `index.html` — стили `.zlens`, `.zback`, `body.zoomed .hud`.

## Задача 1: zones.js
```js
// Зоны приближения: невидимые объёмы в комнате, рисованная лупа над зоной и кнопка «назад».
// Полёт камеры и состояния — в room.js; здесь только «куда попал курсор» и HTML поверх сцены.
import * as THREE from 'three';

const LENS = `<svg viewBox="0 0 48 48" width="46" height="46"><g fill="none" stroke="#4a2c2a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
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
```

## Задача 2: стили (index.html, рядом с `.booklabel`)
```css
.zlens { position: fixed; transform: translate(-50%, -50%) rotate(-8deg); border: 0; background: none; padding: 0; cursor: zoom-in; z-index: 5; filter: drop-shadow(0 4px 8px rgba(60,20,40,.35)); animation: zpulse 1.6s ease-in-out infinite; }
.zlens[hidden] { display: none; }
@keyframes zpulse { 50% { transform: translate(-50%, -50%) rotate(-8deg) scale(1.12); } }
.zback { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) rotate(-1.5deg); z-index: 6; padding: 8px 22px; font: 700 26px/1 Caveat, cursive; color: var(--ink); background: var(--paper); border: 2px solid var(--ink); border-radius: 18px 14px 20px 12px; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
.zback:hover { transform: translateX(-50%) rotate(1deg) scale(1.05); }
.zback[hidden] { display: none; }
body.zoomed .hud, body.zoomed .tip { opacity: 0; pointer-events: none; }
body.zoomhover #scene { cursor: zoom-in; }
```

## Задача 3: room.js — зоны и состояние
1. `import { createZones } from './zones.js';`
2. После `HOME`/полароидов/полки (перед обработчиками указателя) — список и функции:
```js
// ---------- зоны приближения (zones.js): стена с фото, полка с альбомами, стол ----------
let zone = null; // текущая зона приближения
const idle = () => (zone ? 'zoom' : 'room'); // куда возвращаться после действия
const view = () => (zone ? { pos: zone.posV, look: zone.lookV } : HOME);
const zonesys = createZones({ camera, onZoom: (z) => zoomTo(z), onBack: () => unzoom(), list: [
  { id: 'photos', box: [[-0.86, 1.36, -2], [0.34, 2.02, -1.9]], anchor: [-0.27, 2.05, -1.97], pos: [-0.27, 1.73, -0.98], look: [-0.27, 1.71, -2] },
  { id: 'albums', box: [[0.35, 1.44, -2], [1.22, 1.82, -1.76]], anchor: [0.72, 1.86, -1.9], pos: [0.72, 1.66, -1.08], look: [0.72, 1.6, -1.95] },
  { id: 'desk', box: [[-0.96, 0.74, -1.95], [0.96, 1.1, -1.06]], anchor: [0.62, 0.95, -1.25], pos: [0, 1.48, -0.42], look: [0, 0.78, -1.5] },
] });
async function zoomTo(z) {
  if (state !== 'room' && state !== 'zoom') return;
  state = 'busy'; zone = z; zonesys.zoomed(true); body.classList.remove('zoomhover', 'hover'); sfx.click();
  const p0 = cam.pos.clone(), l0 = cam.look.clone();
  await tween(900, (k) => { const e = ease(k); cam.pos.lerpVectors(p0, z.posV, e); cam.look.lerpVectors(l0, z.lookV, e); });
  state = 'zoom';
}
async function unzoom() {
  if (state !== 'zoom') return;
  state = 'busy'; zone = null; zonesys.zoomed(false); hoveredBook = null;
  const p0 = cam.pos.clone(), l0 = cam.look.clone();
  await tween(800, (k) => { const e = ease(k); cam.pos.lerpVectors(p0, HOME.pos, e); cam.look.lerpVectors(l0, HOME.look, e); });
  state = 'room';
}
```
3. Возвраты из действий: `state = 'room'` → `state = idle()` в closeNote, закрытии ноутбука, альбома, фото на стене; в закрытии ноутбука `HOME.pos/HOME.look` → `view().pos/view().look`.
4. Указатель:
   - pointermove: `const live = state === 'room' || state === 'zoom'; const o = live ? pick(e) : null;` затем `const z = state === 'room' && !o ? zonesys.at(ray) : null; zonesys.hover(z); body.classList.toggle('zoomhover', !!z);`
   - click: `if (state === 'zoom') { const o = pick(e); if (o) return o.userData.act(); if (!zonesys.contains(zone, ray)) unzoom(); return; }` и в `room`: `const o = pick(e); if (o) return o.userData.act(); const z = zonesys.at(ray); if (z) zoomTo(z);`
   - keydown Escape в `zoom` → `unzoom()`; `canvas.addEventListener('wheel', (e) => { if (state === 'zoom' && e.deltaY > 0) unzoom(); }, { passive: true });`
5. Цикл: подпись альбома показывается и в `zoom`; покачивание `if (state === 'zoom') cam.pos.lerp(V(zone.posV.x + mouse.x * 0.09, zone.posV.y - mouse.y * 0.045, zone.posV.z), 0.05);`; `zonesys.frame();`.
6. `?debug`: `zoomTo: (id) => zoomTo(zonesys.byId(id)), unzoom, zonesys`.

## Задача 4: проверка
- `?debug&local`: `__room.zoomTo('photos')` (+ ручные шаги tween в скрытой панели) → снимок ракурса каждой зоны через `__shot` с камерой зоны.
- Наведение: луч из HOME в центр полки → `zonesys.at` = albums; в полароид → `pick` даёт полароид, лупа скрыта.
- Возврат: открыть ноутбук из `desk` → закрыть → `state === 'zoom'`, камера у стола.
- Выход: Esc, колесо, клик вне зоны, кнопка — все приводят в `room`.
- Консоль без ошибок, тесты `tests/*.mjs` зелёные, выкат.
