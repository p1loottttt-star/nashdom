// Режим «расставить»: вещи из коробки и уже стоящие тащатся мышкой. Картины и полки — на любую стену,
// мелочи — на стол, полки, подоконник и пол, крупное — на пол. Колесо или Q/E — повернуть, бросить в коробку — убрать.
// Вещь на полке/столике запоминается относительно неё: подвинул полку — вещи едут вместе с ней.
import * as THREE from 'three';

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(Boolean)); return e; };
const STEP = Math.PI / 12;

export function createPlacer({ scene, camera, canvas, ITEMS, CAT, staticSurfaces, bounds, hole, onSave, onView, onExit }) {
  const inst = new Map(); // id → { id, item, group, place }
  let place = {}, things = [], editing = false, drag = null, hover = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const WALLS = [
    { name: 'back', plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -bounds.z0), n: new THREE.Vector3(0, 0, 1), ry: 0 },
    { name: 'left', plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), -bounds.x0), n: new THREE.Vector3(1, 0, 0), ry: Math.PI / 2 },
    { name: 'right', plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), bounds.x1), n: new THREE.Vector3(-1, 0, 0), ry: -Math.PI / 2 },
  ];

  // ---------- 3D ----------
  function make(id, item) {
    const def = ITEMS[item];
    if (!def) return null;
    const group = def.build();
    group.userData.inst = id;
    group.traverse((o) => { if (o.isMesh) o.userData.inst = id; });
    scene.add(group);
    const rec = { id, item, group, def, place: null };
    inst.set(id, rec);
    return rec;
  }
  function drop(rec) {
    scene.remove(rec.group); // геометрию не освобождаем: модели могут делить её между экземплярами
    inst.delete(rec.id);
  }
  // поставить группу по записи (у вещи на полке — относительно полки)
  function apply(rec) {
    const pl = place[rec.id];
    rec.place = pl;
    rec.group.visible = !!pl;
    if (!pl) return;
    const parent = pl.on && inst.get(pl.on);
    if (pl.on && (!parent || !place[pl.on])) { delete place[rec.id]; rec.group.visible = false; return; } // полку убрали — вещь в коробку
    const pos = new THREE.Vector3(...pl.p);
    if (parent) { parent.group.updateMatrixWorld(); pos.applyMatrix4(parent.group.matrixWorld); }
    rec.group.position.copy(pos);
    rec.group.rotation.set(0, (pl.ry || 0) + (parent ? parent.group.rotation.y : 0), 0);
  }
  function applyAll() {
    // сначала то, что стоит само, потом то, что на нём
    const recs = [...inst.values()].sort((a, b) => (place[a.id]?.on ? 1 : 0) - (place[b.id]?.on ? 1 : 0));
    recs.forEach(apply);
  }

  // things: [{id, item}] — всё, что есть у человека; p: { id: место }
  function sync(list, p) {
    things = list; place = { ...(p || {}) };
    const want = new Set(list.map((t) => t.id));
    for (const rec of [...inst.values()]) if (!want.has(rec.id)) drop(rec);
    for (const t of list) if (!inst.has(t.id)) make(t.id, t.item);
    applyAll();
    drawTray();
  }

  // ---------- куда упадёт вещь ----------
  const surfaces = () => {
    const out = [...staticSurfaces()];
    for (const rec of inst.values()) if (rec.group.visible && rec !== drag?.rec) rec.group.traverse((o) => { if (o.isMesh && o.userData.surface) out.push(o); });
    return out;
  };
  function aim(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function target(rec) {
    const def = rec.def, pt = new THREE.Vector3();
    if (def.mount === 'wall') {
      let best = null;
      for (const w of WALLS) {
        if (!ray.ray.intersectPlane(w.plane, pt)) continue;
        const d = pt.distanceTo(ray.ray.origin), half = def.r || 0.2, hh = (def.h || 0.4) / 2;
        const along = w.name === 'back' ? pt.x : pt.z, lo = w.name === 'back' ? bounds.x0 : bounds.z0, hi = w.name === 'back' ? bounds.x1 : bounds.z1;
        if (along < lo + half || along > hi - half || pt.y < 0.25 + hh || pt.y > bounds.y1 - hh) continue;
        if (w.name === 'back' && pt.x + half > hole.x0 && pt.x - half < hole.x1 && pt.y + hh > hole.y0 && pt.y - hh < hole.y1) continue; // не на окно
        if (!best || d < best.d) best = { d, p: pt.clone().addScaledVector(w.n, 0.012), ry: w.ry, wall: w.name };
      }
      return best && { p: best.p, ry: best.ry, wall: best.wall };
    }
    // на поверхность: стол, полки, подоконник, столики; иначе — пол
    if (def.mount === 'surface') {
      // целимся не в тонкую доску, а в место над ней, где будет стоять вещь: так полку легко «поймать»
      let best = null;
      for (const m of surfaces()) {
        m.updateWorldMatrix(true, false); // не ждём кадра: положение по всей цепочке родителей
        const b = new THREE.Box3().setFromObject(m), top = b.max.y;
        const vol = new THREE.Box3(new THREE.Vector3(b.min.x, top - 0.04, b.min.z), new THREE.Vector3(b.max.x, top + Math.max(0.22, def.h || 0.2), b.max.z));
        const hp = ray.ray.intersectBox(vol, new THREE.Vector3());
        if (!hp) continue;
        const d = hp.distanceTo(ray.ray.origin);
        if (!best || d < best.d) best = { d, m, b, hp };
      }
      if (best) {
        const { m, b } = best, top = b.max.y, r = Math.min(def.r || 0.05, 0.06);
        const onTop = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -top), new THREE.Vector3());
        const q = onTop && onTop.x >= b.min.x && onTop.x <= b.max.x && onTop.z >= b.min.z && onTop.z <= b.max.z ? onTop : best.hp;
        const p = new THREE.Vector3(
          THREE.MathUtils.clamp(q.x, Math.min(b.min.x + r, b.max.x), Math.max(b.max.x - r, b.min.x)), top,
          THREE.MathUtils.clamp(q.z, Math.min(b.min.z + r, b.max.z), Math.max(b.max.z - r, b.min.z)));
        let on = null;
        for (let o = m; o; o = o.parent) if (o.userData.inst && o.userData.inst !== rec.id && inst.get(o.userData.inst)?.group === o) { on = o.userData.inst; break; }
        return { p, on };
      }
    }
    if (!ray.ray.intersectPlane(floorPlane, pt)) return null;
    // точка пола за стеной — значит, смотрим на стену: вещь остаётся, где была
    const r = def.r || 0.15;
    if (pt.x < bounds.x0 || pt.x > bounds.x1 || pt.z < bounds.z0 || pt.z > bounds.z1) return null;
    pt.x = THREE.MathUtils.clamp(pt.x, bounds.x0 + r, bounds.x1 - r);
    pt.z = THREE.MathUtils.clamp(pt.z, bounds.z0 + r, bounds.z1 - r);
    return { p: pt };
  }

  // ---------- перетаскивание ----------
  function begin(rec, e, fromTray) {
    drag = { rec, from: place[rec.id] ? { ...place[rec.id] } : null, fromTray, ry: place[rec.id]?.ry || 0, last: null };
    rec.group.visible = true;
    // вещи, стоящие на этой — едут следом
    drag.kids = [...inst.values()].filter((k) => place[k.id]?.on === rec.id);
    document.body.classList.add('placing');
    move(e);
  }
  function move(e) {
    if (!drag) return;
    aim(e);
    const t = target(drag.rec), g = drag.rec.group;
    if (!t) return;
    drag.last = t;
    g.position.copy(t.p);
    g.rotation.set(0, t.ry ?? drag.ry, 0);
    for (const k of drag.kids) { const pl = place[k.id]; const pos = new THREE.Vector3(...pl.p); g.updateMatrixWorld(); k.group.position.copy(pos.applyMatrix4(g.matrixWorld)); k.group.rotation.y = (pl.ry || 0) + g.rotation.y; }
    trayEl.classList.toggle('drop', overTray(e));
  }
  function end(e) {
    if (!drag) return;
    const { rec, last } = drag;
    if (overTray(e) || !last) { // в коробку
      delete place[rec.id];
      for (const k of drag.kids) delete place[k.id];
    } else {
      const pl = { p: last.p.toArray().map((v) => +v.toFixed(3)), ry: last.ry ?? drag.ry };
      if (last.wall) pl.wall = last.wall;
      if (last.on && inst.has(last.on)) { // на полке — запоминаем относительно неё
        const parent = inst.get(last.on).group; parent.updateMatrixWorld();
        pl.on = last.on; pl.p = parent.worldToLocal(last.p.clone()).toArray().map((v) => +v.toFixed(3)); pl.ry = (pl.ry || 0) - parent.rotation.y;
      }
      place[rec.id] = pl;
    }
    drag = null;
    document.body.classList.remove('placing');
    trayEl.classList.remove('drop');
    applyAll(); drawTray();
    onSave({ ...place });
  }
  const rotate = (dir) => { if (!drag || drag.last?.wall) return; drag.ry += dir * STEP; drag.rec.group.rotation.y = drag.ry; };

  // ---------- события ----------
  const pickInst = (e) => {
    aim(e);
    const groups = [...inst.values()].filter((r) => r.group.visible).map((r) => r.group);
    for (const hit of ray.intersectObjects(groups, true)) {
      for (let o = hit.object; o; o = o.parent) if (o.userData.inst && inst.get(o.userData.inst)?.group === o) return inst.get(o.userData.inst);
    }
    return null;
  };
  const onDown = (e) => { if (!editing || e.button !== 0) return; const rec = pickInst(e); if (rec) { e.preventDefault(); begin(rec, e); } };
  const onMove = (e) => {
    if (!editing) return;
    if (drag) return move(e);
    if (e.target !== canvas) return;
    const rec = pickInst(e);
    if (rec !== hover) { hover?.group.scale.setScalar(1); hover = rec; hover?.group.scale.setScalar(1.06); }
    canvas.style.cursor = rec ? 'grab' : '';
  };
  const onUp = (e) => end(e);
  const onWheel = (e) => { if (editing && drag) { e.preventDefault(); rotate(Math.sign(e.deltaY)); } };
  const onKey = (e) => {
    if (!editing) return;
    if (e.key === 'q' || e.key === 'й') rotate(-1);
    if (e.key === 'e' || e.key === 'у') rotate(1);
    if (e.key === 'Escape') { if (drag) { if (drag.from) place[drag.rec.id] = drag.from; else delete place[drag.rec.id]; drag = null; document.body.classList.remove('placing'); applyAll(); } else exit(); }
  };
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKey);

  // ---------- коробка ----------
  const list = h('div', { className: 'tray-list' });
  const trayEl = h('div', { className: 'tray', hidden: true },
    h('div', { className: 'tray-head' },
      h('b', { textContent: 'Расставляем' }),
      h('span', { className: 'tray-hint', textContent: 'тащи вещь мышкой · колесо или Q/E — повернуть · брось сюда — убрать в коробку' }),
      h('span', { className: 'grow' }),
      h('button', { type: 'button', textContent: '◀', title: 'посмотреть левее', onclick: () => onView(-1) }),
      h('button', { type: 'button', textContent: '▶', title: 'посмотреть правее', onclick: () => onView(1) }),
      h('button', { type: 'button', className: 'done', textContent: 'готово', onclick: () => exit() })),
    list);
  document.body.append(trayEl);
  const overTray = (e) => { const r = trayEl.getBoundingClientRect(); return !trayEl.hidden && e.clientY >= r.top && e.clientX >= r.left && e.clientX <= r.right; };
  function drawTray() {
    const free = things.filter((t) => !place[t.id] && ITEMS[t.item]);
    list.replaceChildren(...free.map((t) => h('button', { type: 'button', className: 'tray-item', title: 'тащи в комнату', onpointerdown: (e) => { e.preventDefault(); const rec = inst.get(t.id) || make(t.id, t.item); if (rec) begin(rec, e, true); } },
      h('i', { textContent: CAT[t.item]?.emoji || '📦' }), h('span', { textContent: CAT[t.item]?.title || t.item }))));
    if (!free.length) list.append(h('p', { className: 'tray-empty', textContent: things.length ? 'всё расставлено ♥ вещи можно двигать прямо в комнате' : 'коробка пуста — загляни в магазин в ноутбуке' }));
  }
  function exit() { editing = false; trayEl.hidden = true; hover?.group.scale.setScalar(1); hover = null; canvas.style.cursor = ''; onExit?.(); }

  return {
    sync,
    get editing() { return editing; },
    edit() { editing = true; trayEl.hidden = false; drawTray(); },
    exit,
    boxCount: () => things.filter((t) => !place[t.id] && ITEMS[t.item]).length,
    update(dt, t) { for (const rec of inst.values()) if (rec.group.visible) rec.group.traverse((o) => o.userData.update?.(dt, t)); },
    // для котов: что стоит на полу и на столе
    obstacles(level, deskTop) {
      const out = [];
      for (const rec of inst.values()) {
        if (!rec.group.visible || !place[rec.id] || place[rec.id].wall) continue;
        const p = rec.group.position, onFloor = p.y < 0.05, onDesk = Math.abs(p.y - deskTop) < 0.03;
        if ((level === 'floor' && onFloor) || (level === 'desk' && onDesk)) out.push({ x: p.x, z: p.z, r: (rec.def.r || 0.1) + 0.02 });
      }
      return out;
    },
  };
}
