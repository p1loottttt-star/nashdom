// Неоткрытые подарки: коробки у получателя, подпрыгивают и открываются с конфетти (сами вещи ставит placer.js из furniture.js).
// Мультяшный стиль: бумага — крупный рисунок без шума, лента и бант пухлые; тун и обводку даёт toonify в room.js.
import { P, canvasTex, blob, heartPath } from './toon.js';

export function createDecor({ THREE, scene, clickables, TOP, M, rbox, add, floatAt }) {
  const PI = Math.PI, rnd = Math.random;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const CAM = V(0, 1.5, 1.1); // домашняя камера: к ней разворачиваем коробки
  const faceCam = (x, z) => Math.atan2(CAM.x - x, CAM.z - z);
  const backOut = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
  const backIn = (k) => 2.70158 * k ** 3 - 1.70158 * k ** 2;
  function grp(x, y, z, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; return g; }
  function anchor(g, x, y, z) { const a = new THREE.Object3D(); a.position.set(x, y, z); g.add(a); g.userData.anchor = a; }

  // ---------- подарочные коробки ----------
  // места: стол перед ноутбуком, пол справа и слева от стола, пол у большого растения
  const SPOTS = [
    { x: -0.14, y: TOP, z: -1.26, s: 0.15 },
    { x: 1.3, y: 0, z: -1.25, s: 0.22 },
    { x: -1.25, y: 0, z: -1.3, s: 0.22 },
    { x: 1.55, y: 0, z: -1.05, s: 0.2 },
  ];
  const PAPER = { balloon: [P.pinkL, P.rose], choco: [P.plum, P.butter], flowers: [P.sageL, P.rose], teddy: [P.sky, P.cream], ring: [P.cream, P.butter], _: [P.pink, P.cream] };
  const hash = (s) => [...String(s)].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  // рисунок бумаги: 0 — горошек, 1 — полоски, 2 — сердечки; крупно, чтобы не мерцало издалека
  const paperTex = (base, kind) => canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.6)';
    if (kind === 0) { for (let y = 20; y < h; y += 52) for (let xx = ((y / 52) % 2) * 26 + 13; xx < w; xx += 52) blob(x, xx, y, 9); }
    else if (kind === 1) { x.save(); x.translate(w / 2, h / 2); x.rotate(PI / 4); for (let i = -w; i < w; i += 48) x.fillRect(i, -w, 18, 2 * w); x.restore(); }
    else { for (let y = 30; y < h + 20; y += 64) for (let xx = ((y / 64) % 2) * 32 + 16; xx < w + 20; xx += 64) { heartPath(x, xx, y, 13); x.fill(); } }
  });
  function makeBox(box, spot) {
    const s = SPOTS[spot].s, h = s * 0.8, lh = s * 0.22, [paper, rib] = PAPER[box.item] || PAPER._;
    const { x, y, z } = SPOTS[spot];
    const root = grp(x, y, z, faceCam(x, z) + (rnd() - 0.5) * 0.5);
    const pivot = new THREE.Group(); root.add(pivot);
    const paperM = M('#ffffff', { map: paperTex(paper, hash(box.id) % 3) }), ribM = M(rib);
    add(rbox(s, h, s, s * 0.08), paperM, 0, h / 2, 0, pivot);
    add(rbox(s * 1.02, h * 0.98, s * 0.18, s * 0.03), ribM, 0, h / 2, 0, pivot);
    add(rbox(s * 0.18, h * 0.98, s * 1.02, s * 0.03), ribM, 0, h / 2, 0, pivot);
    const lid = new THREE.Group(); lid.position.y = h; pivot.add(lid);
    add(rbox(s * 1.08, lh, s * 1.08, s * 0.07), paperM, 0, lh * 0.35, 0, lid);
    add(rbox(s * 1.1, lh * 1.04, s * 0.18, s * 0.03), ribM, 0, lh * 0.37, 0, lid);
    add(rbox(s * 0.18, lh * 1.04, s * 1.1, s * 0.03), ribM, 0, lh * 0.37, 0, lid);
    // бант: две пухлые петли, узелок, хвостики
    const bow = new THREE.Group(); bow.position.y = lh * 0.88; lid.add(bow);
    const loop = new THREE.TorusGeometry(s * 0.12, s * 0.045, 10, 24);
    for (const k of [-1, 1]) {
      const l = add(loop, ribM, k * s * 0.11, s * 0.08, 0, bow); l.rotation.z = k * 0.55; l.scale.z = 0.6;
      add(rbox(s * 0.08, s * 0.016, s * 0.26, s * 0.008), ribM, k * s * 0.05, 0.003, s * 0.13, bow).rotation.y = -k * 0.4;
    }
    add(new THREE.SphereGeometry(s * 0.065, 14, 10), ribM, 0, s * 0.035, 0, bow).scale.y = 0.8;
    root.userData = { ...root.userData, box, spot, s, pivot, lid, bow, ph: rnd() * 4, act: () => openBox(root) };
    anchor(root, 0, h + s * 0.3, 0);
    return root;
  }
  function openBox(o) {
    const u = o.userData;
    if (u.opening) return;
    u.opening = true; opened.add(u.box.id);
    const i = clickables.indexOf(o); if (i >= 0) clickables.splice(i, 1);
    const { pivot, lid, s } = u, ly = lid.position.y;
    pivot.position.y = 0;
    tween(0.22, (k) => { const q = Math.sin(k * PI); pivot.scale.set(1 + q * 0.08, 1 - q * 0.14, 1 + q * 0.08); }, () => {
      pivot.scale.setScalar(1);
      burst(o, s); floatAt?.(u.anchor, '♥');
      tween(0.5, (k) => { lid.position.y = ly + backOut(k) * s * 1.2; lid.rotation.set(-k * 1.3, 0, k * 0.7); });
      tween(0.6, (k) => pivot.scale.setScalar(Math.max(0.001, 1 - backIn(k))), () => {
        drop(o); gifts.delete(u.box.id);
        Promise.resolve().then(() => u.onOpen?.(u.box)); // ошибка в обработчике не ломает кадр
      });
    });
  }
  // конфетти из коробки
  const bursts = [];
  function burst(o, s) {
    const p = o.getWorldPosition(V()); p.y += s;
    const geo = new THREE.PlaneGeometry(0.018, 0.012), k = s / 0.2;
    const mats = [P.rose, P.pink, P.butter, P.mint, P.lav].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    const parts = Array.from({ length: 24 }, (_, i) => {
      const m = new THREE.Mesh(geo, mats[i % mats.length]);
      m.position.copy(p); m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      m.userData.v = V((rnd() - 0.5) * 1.4 * k, (1.1 + rnd() * 1.2) * k, (rnd() - 0.5) * 1.4 * k);
      m.userData.w = V(rnd() * 12, rnd() * 12, rnd() * 12);
      scene.add(m); return m;
    });
    bursts.push({ t: 0, parts, geo, mats, floor: o.position.y + 0.003 });
  }

  // ---------- общее ----------
  const tweens = [];
  const tween = (dur, fn, done) => tweens.push({ t: 0, dur, fn, done });
  const gifts = new Map(), opened = new Set();
  function drop(o) {
    scene.remove(o);
    const i = clickables.indexOf(o); if (i >= 0) clickables.splice(i, 1);
    o.traverse((m) => {
      m.geometry?.dispose();
      if (m.userData.isOutline) return; // материал обводки общий (toon.js)
      for (const mt of [].concat(m.material || [])) { mt.map?.dispose(); mt.dispose(); }
    });
  }
  function popIn(o) {
    o.userData.busy = true; o.scale.setScalar(0.001);
    tween(0.55, (k) => o.scale.setScalar(Math.max(0.001, backOut(k))), () => { o.scale.setScalar(1); o.userData.busy = false; });
  }

  return {
    // boxes — неоткрытые подарки этому зрителю
    show(boxes = [], onOpen) {
      const live = boxes.filter((b) => b && !opened.has(b.id));
      const keep = new Set(live.map((b) => b.id));
      for (const [id, o] of gifts) if (!keep.has(id) && !o.userData.opening) { drop(o); gifts.delete(id); }
      for (const b of live) {
        const have = gifts.get(b.id);
        if (have) { have.userData.box = b; have.userData.onOpen = onOpen; continue; }
        const used = new Set([...gifts.values()].map((o) => o.userData.spot));
        const spot = SPOTS.findIndex((_, i) => !used.has(i));
        if (spot < 0) break; // ponytail: больше 4 коробок не показываем, остальные появятся после открытия
        const o = makeBox(b, spot);
        o.userData.onOpen = onOpen;
        scene.add(o); gifts.set(b.id, o); clickables.push(o); popIn(o);
      }
    },

    update(dt, t) {
      dt = Math.min(dt, 0.1);
      for (let i = tweens.length - 1; i >= 0; i--) {
        const w = tweens[i]; w.t += dt;
        const k = Math.min(1, w.t / w.dur);
        w.fn(k);
        if (k >= 1) { tweens.splice(i, 1); w.done?.(); }
      }
      // коробки подпрыгивают раз в несколько секунд, бант шевелится
      for (const o of gifts.values()) {
        const u = o.userData;
        if (u.opening) continue;
        const c = (t + u.ph) % 4, hop = c < 0.45 ? Math.sin((c / 0.45) * PI) : 0;
        u.pivot.position.y = hop * u.s * 0.22;
        u.pivot.scale.set(1 - hop * 0.03, 1 + hop * 0.06, 1 - hop * 0.03);
        u.bow.rotation.z = Math.sin(t * 2.4 + u.ph) * 0.07 + hop * 0.2 * Math.sin(t * 22);
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.t += dt;
        for (const m of b.parts) {
          const { v, w } = m.userData;
          v.y -= 4.5 * dt;
          m.position.addScaledVector(v, dt);
          if (m.position.y < b.floor) { m.position.y = b.floor; v.set(0, 0, 0); w.set(0, 0, 0); }
          m.rotation.x += w.x * dt; m.rotation.y += w.y * dt; m.rotation.z += w.z * dt;
        }
        const fade = 1 - Math.min(1, b.t / 1.4) ** 3;
        for (const mt of b.mats) mt.opacity = fade;
        if (b.t > 1.4) { for (const m of b.parts) scene.remove(m); b.geo.dispose(); for (const mt of b.mats) mt.dispose(); bursts.splice(i, 1); }
      }
    },
  };
}
