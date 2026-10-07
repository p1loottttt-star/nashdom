// Навигация котиков: сетка проходимости на каждом «уровне» (стол, пол, подоконник, кресло),
// A* по клеткам + выпрямление пути, прыжки между уровнями по заданным точкам.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CR = 0.05; // «радиус» кота: насколько препятствия раздуваются

const rect = (x0, x1, z0, z1) => (x, z) => x > x0 - CR && x < x1 + CR && z > z0 - CR && z < z1 + CR;
const circle = (cx, cz, r) => (x, z) => Math.hypot(x - cx, z - cz) < r + CR;

class Grid {
  constructor({ x0, x1, z0, z1, y, cell, blocked }) {
    Object.assign(this, { x0, x1, z0, z1, y, cell });
    this.w = Math.max(1, Math.round((x1 - x0) / cell) + 1);
    this.h = Math.max(1, Math.round((z1 - z0) / cell) + 1);
    this.stat = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const [x, z] = this.pos(i, j);
      this.stat[j * this.w + i] = blocked.some((b) => b(x, z)) ? 1 : 0;
    }
  }
  pos(i, j) { return [this.x0 + i * this.cell, this.z0 + j * this.cell]; }
  idx(x, z) {
    const i = Math.min(this.w - 1, Math.max(0, Math.round((x - this.x0) / this.cell)));
    const j = Math.min(this.h - 1, Math.max(0, Math.round((z - this.z0) / this.cell)));
    return [i, j];
  }
  free(i, j, dyn) {
    if (i < 0 || j < 0 || i >= this.w || j >= this.h || this.stat[j * this.w + i]) return false;
    if (!dyn.length) return true;
    const [x, z] = this.pos(i, j);
    return !dyn.some((b) => b(x, z));
  }
  // ближайшая свободная клетка к точке (спираль)
  nearestFree(x, z, dyn) {
    const [ci, cj] = this.idx(x, z);
    for (let r = 0; r < Math.max(this.w, this.h); r++) {
      let best = null, bd = Infinity;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !this.free(i, j, dyn)) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return best;
    }
    return null;
  }
  line(a, b, dyn) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.free(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), dyn)) return false;
    }
    return true;
  }
  path(from, to, dyn = []) {
    const s = this.nearestFree(from.x, from.z, dyn), g = this.nearestFree(to.x, to.z, dyn);
    if (!s || !g) return null;
    const W = this.w, key = (i, j) => j * W + i;
    const gs = new Float32Array(W * this.h).fill(Infinity), came = new Int32Array(W * this.h).fill(-1);
    const heap = [];
    const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
      return top;
    };
    const hcost = (i, j) => { const dx = Math.abs(i - g[0]), dz = Math.abs(j - g[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    gs[key(...s)] = 0; push(key(...s), hcost(...s));
    const gk = key(...g);
    while (heap.length) {
      const [, k] = pop();
      if (k === gk) break;
      const i = k % W, j = (k / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!this.free(ni, nj, dyn) || (di && dj && (!this.free(i + di, j, dyn) || !this.free(i, j + dj, dyn)))) continue;
        const nk = key(ni, nj), c = gs[k] + (di && dj ? 1.414 : 1);
        if (c < gs[nk]) { gs[nk] = c; came[nk] = k; push(nk, c + hcost(ni, nj)); }
      }
    }
    if (came[gk] < 0 && gk !== key(...s)) return null;
    const cells = [];
    for (let k = gk; k >= 0; k = came[k]) cells.unshift([k % W, (k / W) | 0]);
    // выпрямление: идём к самой дальней видимой клетке
    const out = [cells[0]];
    for (let a = 0; a < cells.length - 1;) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.line(cells[a], cells[b], dyn)) b--;
      out.push(cells[b]); a = b;
    }
    const pts = out.map(([i, j]) => { const [x, z] = this.pos(i, j); return V(x, this.y, z); });
    const last = pts[pts.length - 1];
    if (Math.hypot(last.x - to.x, last.z - to.z) < this.cell * 1.5) last.set(to.x, this.y, to.z);
    return pts;
  }
  length(pts) { let L = 0; for (let k = 1; k < pts.length; k++) L += pts[k].distanceTo(pts[k - 1]); return L; }
}

// desk: { half, legs: [[x,z]], floorBlocks: [{x0,x1,z0,z1}] } — стол бывает разной ширины, с тумбами и полками
export function createNav({ TOP, SILL, deskObstacles = () => [], floorObstacles = () => [], desk = { half: 0.95, legs: [[-0.9, -1.15], [0.9, -1.15], [-0.9, -1.85], [0.9, -1.85]], floorBlocks: [] } }) {
  const hw = desk.half, edge = hw - 0.09; // край стола, откуда прыгают
  const FLOOR = 0.008; // поверх ковра
  const grids = {
    desk: new Grid({ x0: -(hw - 0.02), x1: hw - 0.02, z0: -1.92, z1: -1.12, y: TOP, cell: 0.02, blocked: [
      rect(-0.39, 0.23, -1.82, -1.37),   // ноутбук с крышкой
      circle(-0.72, -1.68, 0.095),        // лампа
      circle(0.75, -1.75, 0.08),          // растение
      circle(0.36, -1.16, 0.045),         // кружка
      rect(0.585, 0.855, -1.415, -1.085), // лоток
    ] }),
    floor: new Grid({ x0: -2.85, x1: 2.85, z0: -1.92, z1: 0.9, y: FLOOR, cell: 0.05, blocked: [
      ...desk.legs.map(([x, z]) => circle(x, z, 0.035)), // ножки стола
      ...desk.floorBlocks.map((b) => rect(b.x0, b.x1, b.z0, b.z1)), // тумбы и полки стола
      rect(-1.57, -1.23, -1.85, -1.55),   // когтеточка
      circle(-1.95, -0.75, 0.5),          // кресло-мешок
      circle(1.75, -1.55, 0.22),          // большое растение
      circle(1.5, -0.6, 0.18),            // корзинка
    ] }),
    sill: new Grid({ x0: -1.78, x1: -1.14, z0: -1.915, z1: -1.915, y: SILL, cell: 0.02, blocked: [] }),
    bag: new Grid({ x0: -1.84, x1: -1.84, z0: -0.68, z1: -0.68, y: 0.53, cell: 0.02, blocked: [] }),
  };
  // прыжки между уровнями: [уровень, точка] ↔ [уровень, точка]
  const LINKS = [
    ['desk', [-edge, -1.52], 'floor', [-hw - 0.15, -1.38]],
    ['desk', [edge, -1.52], 'floor', [hw + 0.17, -1.42]],
    ['desk', [-0.1, -1.17], 'floor', [-0.1, -0.8]],
    ['desk', [-edge, -1.62], 'sill', [-1.16, -1.915]],
    ['floor', [-1.4, -0.5], 'bag', [-1.84, -0.68]],
  ].flatMap(([la, a, lb, b]) => [{ from: la, a, to: lb, b }, { from: lb, a: b, to: la, b: a }]);

  const SPOTS = {
    deskA: { level: 'desk', p: [0.42, -1.66], face: -Math.PI / 2 },
    deskB: { level: 'desk', p: [0.6, -1.62], face: -Math.PI / 2 },
    deskL: { level: 'desk', p: [-0.55, -1.56], face: -Math.PI / 2 },
    sill1: { level: 'sill', p: [-1.3, -1.915], face: Math.PI },
    sill2: { level: 'sill', p: [-1.58, -1.915], face: 0 },
    rug: { level: 'floor', p: [0.05, -0.5], face: -1.2 },
    under: { level: 'floor', p: [0.0, -1.48], face: -Math.PI / 2 },
    post: { level: 'floor', p: [-1.4, -1.47], face: Math.PI / 2 },
    bag: { level: 'bag', p: [-1.84, -0.68], face: -0.6 },
    exit: { level: 'floor', p: [2.75, 0.4] },
  };
  const ADJ = { desk: ['floor', 'sill'], floor: ['desk', 'bag'], sill: ['desk'], bag: ['floor'] };

  const at = (level, [x, z]) => V(x, grids[level].y, z);
  const dynFor = (level, others, goal) => {
    const d = [];
    if (level === 'desk') for (const o of deskObstacles()) d.push(circle(o.x, o.z, o.r));
    if (level === 'floor') for (const o of floorObstacles()) d.push(circle(o.x, o.z, o.r)); // купленные вещи на полу
    for (const o of others) if (o.level === level && Math.hypot(o.x - goal.x, o.z - goal.z) > 0.3) d.push(circle(o.x, o.z, 0.1));
    return d;
  };

  // шаги до точки: [{type:'walk', pts}, {type:'jump', to, level}, ...]
  function plan(level, pos, target, others = []) {
    const goalLevel = target.level, goal = target.pos;
    // путь по уровням (их мало — BFS)
    const prev = { [level]: null }, q = [level];
    while (q.length) { const l = q.shift(); for (const n of ADJ[l]) if (!(n in prev)) { prev[n] = l; q.push(n); } }
    const chain = [];
    for (let l = goalLevel; l; l = prev[l]) chain.unshift(l);
    const steps = [];
    let cur = pos.clone();
    for (let k = 0; k < chain.length; k++) {
      const L = chain[k], g = grids[L];
      if (k === chain.length - 1) {
        const pts = g.path(cur, goal, dynFor(L, others, goal));
        if (pts) steps.push({ type: 'walk', pts });
        break;
      }
      // выбираем точку прыжка, до которой короче идти
      let best = null;
      for (const ln of LINKS.filter((x) => x.from === L && x.to === chain[k + 1])) {
        const a = at(L, ln.a), pts = g.path(cur, a, dynFor(L, others, a));
        if (pts && (!best || g.length(pts) < best.len)) best = { pts, len: g.length(pts), ln };
      }
      if (!best) return null;
      steps.push({ type: 'walk', pts: best.pts });
      const land = at(chain[k + 1], best.ln.b);
      steps.push({ type: 'jump', to: land, level: chain[k + 1] });
      cur = land;
    }
    return steps;
  }

  return {
    SPOTS,
    spot: (name) => ({ ...SPOTS[name], pos: at(SPOTS[name].level, SPOTS[name].p) }),
    plan,
    y: (level) => grids[level].y,
    // ближайшая свободная точка на уровне (для клубка и т.п.)
    snap(level, x, z) { const g = grids[level], c = g.nearestFree(x, z, []); return c ? V(...g.pos(c[0], c[1]).flatMap((v, i) => (i ? [g.y, v] : [v]))) : V(x, g.y, z); },
  };
}
