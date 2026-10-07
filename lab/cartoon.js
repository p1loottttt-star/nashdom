// Мультяшный стиль: тун-шейдинг (2 полосы + тёплые сиреневые тени), обводка «вывернутой оболочкой»,
// пухлая процедурная геометрия, рисованные канвас-текстуры, ореолы-спрайты на лампочках, MSAA.
// Вся статика слита в один меш с цветами вершин + одна общая оболочка обводки → мало draw calls.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const P = {
  wall: '#fbe9d6', jamb: '#f1d2c2', cream: '#fff4e2', white: '#fffaf1',
  sage: '#a3c49b', sageL: '#b9d6ae', sageD: '#86ab80',
  wood: '#e3a462', woodD: '#c98549', woodL: '#efbd80',
  pink: '#f39db3', pinkL: '#f9c8d3', rose: '#e0708f', coral: '#f28c6f',
  lav: '#bba8e0', lavD: '#9a86c6', butter: '#f7d277', mint: '#9fdac6', sky: '#8fc6ec',
  terra: '#e08660', leaf: '#6db35e', leafD: '#529a4c', leafL: '#86c770',
  ink: '#4a2c2a', plum: '#5d4566', paper: '#fff8ea',
};

async function loadFonts() {
  if (!document.querySelector('link[data-cartoon-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.cartoonFonts = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Nunito:wght@800&display=block';
    document.head.appendChild(l);
    await new Promise((r) => { l.onload = l.onerror = r; });
  }
  await Promise.race([
    Promise.all([document.fonts.load('700 64px Caveat', 'вместе 740 дней мы'), document.fonts.load('800 64px Nunito', '0123456789:')]),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {});
}

export async function build({ THREE, renderer, scene, camera, L }) {
  await loadFonts();
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const col = (h) => new THREE.Color(h);
  let seed = 11;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  // ---------- рисованные текстуры ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); draw(x, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const blob = (x, cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  const heartPath = (x, cx, cy, s) => {
    x.beginPath(); x.moveTo(cx, cy + s * 0.35);
    x.bezierCurveTo(cx - s * 1.1, cy - s * 0.35, cx - s * 0.45, cy - s * 1.05, cx, cy - s * 0.45);
    x.bezierCurveTo(cx + s * 0.45, cy - s * 1.05, cx + s * 1.1, cy - s * 0.35, cx, cy + s * 0.35);
  };

  // обои: 512px = 1 м, мягкие полосы и мелкие цветочки
  const wallTex = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = P.wall; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f7e0ca'; for (let i = 0; i < 8; i++) x.fillRect(i * 64 + 8, 0, 30, h);
    for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
      const cx = gx * 128 + (gy % 2) * 64 + 40, cy = gy * 128 + 40;
      x.fillStyle = (gx + gy) % 2 ? '#f3c7c3' : '#c9dcbc'; for (let k = 0; k < 4; k++) blob(x, cx + Math.cos(k * 1.57) * 5, cy + Math.sin(k * 1.57) * 5, 4.5);
      x.fillStyle = '#f7dca8'; blob(x, cx, cy, 3);
    }
  }, true);

  // пол: доски вдоль глубины, 1024px = 1.6 м
  const floorTex = canvasTex(1024, 1024, (x, w, h) => {
    const tones = ['#dca46b', '#d79f63', '#e1aa70', '#d9a166'];
    const pw = w / 10;
    for (let i = 0; i < 10; i++) {
      let y = -rr(0, 400);
      while (y < h) {
        const len = rr(380, 700);
        x.fillStyle = tones[(i * 3 + Math.floor(y)) & 3]; x.fillRect(i * pw, y, pw, len);
        x.strokeStyle = 'rgba(150,90,45,.28)'; x.lineWidth = 2;
        for (let k = 0; k < 3; k++) { const gx = i * pw + rr(14, pw - 14); x.beginPath(); x.moveTo(gx, y + 20); x.bezierCurveTo(gx + rr(-8, 8), y + len * 0.3, gx + rr(-8, 8), y + len * 0.7, gx, y + len - 20); x.stroke(); }
        x.strokeStyle = 'rgba(255,230,190,.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(i * pw + 8, y + 12); x.lineTo(i * pw + 8, y + len * 0.6); x.stroke();
        x.fillStyle = '#9b6337'; x.fillRect(i * pw, y + len - 3, pw, 4);
        y += len;
      }
      x.fillStyle = '#9b6337'; x.fillRect(i * pw - 2, 0, 4, h);
    }
  }, true);

  // столешница: светлый мёд с мягкой текстурой волокон
  const deskTex = canvasTex(1024, 512, (x, w, h) => {
    x.fillStyle = P.wood; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const y0 = rr(0, h); x.strokeStyle = rnd() < 0.5 ? 'rgba(170,100,45,.22)' : 'rgba(255,225,180,.35)'; x.lineWidth = rr(2, 4);
      x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(w * 0.3, y0 + rr(-20, 20), w * 0.6, y0 + rr(-20, 20), w, y0 + rr(-10, 10)); x.stroke();
    }
    x.fillStyle = 'rgba(170,100,45,.2)'; x.beginPath(); x.ellipse(w * 0.83, h * 0.3, 18, 9, 0, 0, Math.PI * 2); x.fill();
  });

  // коврик: концентрические полосы и сердечки
  const rugTex = canvasTex(512, 512, (x, w, h) => {
    const rings = [[256, P.rose], [236, P.pinkL], [212, P.cream], [196, P.pink], [150, P.cream], [134, '#f6b9c7']];
    for (const [r, c] of rings) { x.fillStyle = c; blob(x, 256, 256, r); }
    x.fillStyle = P.rose; for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; heartPath(x, 256 + Math.cos(a) * 173, 256 + Math.sin(a) * 173, 9); x.fill(); }
    x.fillStyle = P.rose; heartPath(x, 256, 262, 48); x.fill();
  });

  // экран блокировки ноутбука
  const screenTex = canvasTex(640, 405, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fbd3dd'); g.addColorStop(1, '#f2a5bc');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.35)';
    for (const [cx, cy, s] of [[90, 330, 1], [540, 80, 0.8], [560, 340, 0.6]]) { blob(x, cx, cy, 40 * s); blob(x, cx + 40 * s, cy + 8 * s, 32 * s); blob(x, cx - 38 * s, cy + 10 * s, 28 * s); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fff'; x.font = '800 92px Nunito, system-ui, sans-serif'; x.fillText('16:40', w / 2, 112);
    x.fillStyle = '#b13f66'; x.font = '700 92px Caveat, cursive'; x.fillText('вместе 740 дней', w / 2, 236);
    x.fillStyle = '#e05d84'; heartPath(x, w / 2, 318, 26); x.fill();
    x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.roundRect(w / 2 - 70, 372, 140, 10, 5); x.fill();
  });

  // полароиды
  const scenes = [
    (x, s) => { const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#f7a26b'); g.addColorStop(0.55, '#fbd0a0'); g.addColorStop(0.56, '#5aa2c8'); g.addColorStop(1, '#3f7fb0'); x.fillStyle = g; x.fillRect(0, 0, s, s); x.fillStyle = '#fff1b8'; x.beginPath(); x.arc(s / 2, s * 0.55, 40, Math.PI, 0); x.fill(); x.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 4; i++) x.fillRect(s * 0.3 + i * 12, s * 0.62 + i * 14, s * 0.4 - i * 24, 4); },
    (x, s) => { x.fillStyle = '#ffd6df'; x.fillRect(0, 0, s, s); x.fillStyle = '#ef6f8f'; heartPath(x, s / 2, s * 0.6, 90); x.fill(); x.fillStyle = 'rgba(255,255,255,.6)'; blob(x, s * 0.38, s * 0.4, 12); },
    (x, s) => { x.fillStyle = '#9fd3f2'; x.fillRect(0, 0, s, s); x.fillStyle = '#8a9cc9'; x.beginPath(); x.moveTo(0, s); x.lineTo(s * 0.35, s * 0.35); x.lineTo(s * 0.7, s); x.fill(); x.fillStyle = '#7086b8'; x.beginPath(); x.moveTo(s * 0.35, s); x.lineTo(s * 0.72, s * 0.45); x.lineTo(s * 1.1, s); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(s * 0.35, s * 0.35); x.lineTo(s * 0.27, s * 0.47); x.lineTo(s * 0.43, s * 0.47); x.fill(); x.fillStyle = '#7cc46d'; x.fillRect(0, s * 0.88, s, s * 0.12); },
    (x, s) => { x.fillStyle = '#2e3a78'; x.fillRect(0, 0, s, s); x.fillStyle = '#fff3c4'; blob(x, s * 0.68, s * 0.3, 34); x.fillStyle = '#2e3a78'; blob(x, s * 0.6, s * 0.26, 30); x.fillStyle = '#fff'; for (let i = 0; i < 22; i++) blob(x, rr(10, s - 10), rr(10, s * 0.8), rr(1.5, 3.5)); x.fillStyle = '#4b5a9a'; x.fillRect(0, s * 0.85, s, s); },
  ];
  const caps = ['море', 'люблю', 'горы', 'мы ♥'];
  const photoTex = scenes.map((draw, i) => canvasTex(256, 305, (x, w, h) => {
    x.fillStyle = P.white; x.fillRect(0, 0, w, h);
    x.save(); x.translate(16, 16); x.beginPath(); x.rect(0, 0, 224, 224); x.clip(); draw(x, 224); x.restore();
    x.fillStyle = '#7a4a63'; x.font = '700 42px Caveat, cursive'; x.textAlign = 'center'; x.fillText(caps[i], w / 2, 284);
  }));

  // вид из окна
  const skyTex = canvasTex(1024, 888, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h * 0.62); g.addColorStop(0, '#62afe8'); g.addColorStop(0.6, '#a9dbf6'); g.addColorStop(1, '#fde6cc');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const sg = x.createRadialGradient(250, 210, 10, 250, 210, 170); sg.addColorStop(0, 'rgba(255,250,220,1)'); sg.addColorStop(0.25, 'rgba(255,245,200,.9)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = sg; x.fillRect(0, 0, w, h);
    const cloud = (cx, cy, s) => {
      const pts = [[0, 0, 1], [-1.1, 0.25, 0.7], [1.1, 0.2, 0.75], [-0.5, -0.45, 0.75], [0.55, -0.4, 0.8], [1.9, 0.35, 0.5], [-1.9, 0.4, 0.45]];
      x.fillStyle = '#dcd3f0'; for (const [a, b, r] of pts) blob(x, cx + a * 40 * s, cy + b * 40 * s + 8 * s, r * 40 * s);
      x.fillStyle = '#fffdf8'; for (const [a, b, r] of pts) blob(x, cx + a * 40 * s, cy + b * 40 * s, r * 40 * s * 0.96);
    };
    cloud(520, 300, 1.2); cloud(760, 400, 0.8); cloud(330, 440, 0.7); cloud(880, 230, 0.6);
    x.fillStyle = '#b4dca0'; x.beginPath(); x.moveTo(0, 560); x.bezierCurveTo(200, 500, 380, 520, 520, 555); x.bezierCurveTo(680, 590, 820, 500, 1024, 530); x.lineTo(1024, h); x.lineTo(0, h); x.fill();
    x.fillStyle = '#8cc77b'; x.beginPath(); x.moveTo(0, 620); x.bezierCurveTo(250, 580, 450, 600, 640, 625); x.bezierCurveTo(800, 645, 900, 600, 1024, 610); x.lineTo(1024, h); x.lineTo(0, h); x.fill();
    for (const [tx, ty, s] of [[420, 600, 1], [480, 612, 0.75], [700, 628, 1.15], [880, 598, 0.85]]) {
      x.fillStyle = '#8a5a3c'; x.fillRect(tx - 5 * s, ty - 10 * s, 10 * s, 40 * s);
      x.fillStyle = '#4f9a4f'; blob(x, tx, ty - 30 * s, 34 * s); x.fillStyle = '#62ad5c'; blob(x, tx - 8 * s, ty - 38 * s, 24 * s);
    }
    x.fillStyle = '#76b768'; x.fillRect(0, 700, w, h);
  });

  // ---------- построение геометрии ----------
  const N32 = 32, gd = new Uint8Array(N32);
  for (let i = 0; i < N32; i++) { const d = ((i + 0.5) / N32) * 2 - 1; gd[i] = d < 0.03 ? 0 : d < 0.42 ? 150 : 255; }
  const grad = new THREE.DataTexture(gd, N32, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;

  const U = { uTint: { value: new THREE.Vector3(0.78, 0.68, 0.96) }, uRim: { value: new THREE.Vector3(0.3, 0.26, 0.18) } };
  function patch(s) {
    Object.assign(s.uniforms, U);
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
  const toon = (o = {}) => { const m = new THREE.MeshToonMaterial({ gradientMap: grad, ...o }); m.onBeforeCompile = patch; return m; };

  const M = new THREE.Matrix4(), stack = [], tmp = new THREE.Object3D();
  const mat4 = (p = [0, 0, 0], r = [0, 0, 0], s = 1) => {
    tmp.position.set(...p); tmp.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ');
    if (typeof s === 'number') tmp.scale.setScalar(s); else tmp.scale.set(...s);
    tmp.updateMatrix(); return tmp.matrix.clone();
  };
  const group = (p, r, fn) => { stack.push(M.clone()); M.multiply(mat4(p, r)); fn(); M.copy(stack.pop()); };
  const bake = (g, o) => g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(M, mat4(o.p, o.r, o.s)));

  const solids = [], hulls = [], tmpC = new THREE.Color(), inkC = col(P.ink);
  function hullOf(g, c, ow) {
    if (g.index) g = g.toNonIndexed();
    let h = new THREE.BufferGeometry(); h.setAttribute('position', g.attributes.position.clone());
    h = mergeVertices(h, 1e-4); h.computeVertexNormals();
    const n = h.attributes.position.count, oc = new Float32Array(n * 3), w = new Float32Array(n).fill(ow);
    tmpC.copy(c).multiplyScalar(0.3).lerp(inkC, 0.6);
    for (let i = 0; i < n; i++) tmpC.toArray(oc, i * 3);
    h.setAttribute('ocol', new THREE.BufferAttribute(oc, 3)); h.setAttribute('ow', new THREE.BufferAttribute(w, 1));
    hulls.push(h);
  }
  // o: { p, r, s, ow (толщина обводки, 0 = без) }
  function add(g, color, o = {}) {
    if (g.index) g = g.toNonIndexed();
    bake(g, o);
    const c = col(color), n = g.attributes.position.count, ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(ca, i * 3);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    solids.push(out);
    if ((o.ow ?? 1) > 0) hullOf(g, c, o.ow ?? 1);
    return out;
  }
  function addMesh(g, material, o = {}, color = '#888') {
    bake(g, o);
    const m = new THREE.Mesh(g, material);
    m.castShadow = o.cast ?? true; m.receiveShadow = true; scene.add(m);
    if ((o.ow ?? 1) > 0) hullOf(g, col(color), o.ow ?? 1);
    return m;
  }
  const smooth = (g) => { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4); g.computeVertexNormals(); return g; };
  const rbox = (w, h, d, r = 0.012, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
  const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([a, b]) => V2(a, b)), seg);
  const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
  function leafGeo(len, wd, fold = 0.35, droop = 0.25) {
    const s = new THREE.Shape(); s.moveTo(0, 0);
    s.bezierCurveTo(wd * 0.62, len * 0.08, wd * 0.62, len * 0.72, 0, len);
    s.bezierCurveTo(-wd * 0.62, len * 0.72, -wd * 0.62, len * 0.08, 0, 0);
    const t = Math.max(0.003, len * 0.02);
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.8, bevelSize: t * 0.7, bevelSegments: 2, curveSegments: 8 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) - t / 2 + Math.abs(x) * fold - (y / len) ** 2 * len * droop); }
    return smooth(g);
  }
  function heartGeo(s, d) {
    const h = new THREE.Shape(); h.moveTo(0, -s * 0.35);
    h.bezierCurveTo(-s * 1.1, s * 0.35, -s * 0.45, s * 1.05, 0, s * 0.45);
    h.bezierCurveTo(s * 0.45, s * 1.05, s * 1.1, s * 0.35, 0, -s * 0.35);
    return new THREE.ExtrudeGeometry(h, { depth: d, bevelEnabled: true, bevelThickness: d * 0.5, bevelSize: d * 0.5, bevelSegments: 2, curveSegments: 8 });
  }

  const { ROOM, WINDOW: W, DESK, ITEMS: I } = L;
  const BZ = ROOM.back, TOP = DESK.top;

  // --- комната: стены + потолок одним мешем, UV в метрах ---
  const wallShape = new THREE.Shape([V2(-3, 0), V2(3, 0), V2(3, ROOM.h), V2(-3, ROOM.h)]);
  wallShape.holes.push(new THREE.Path([V2(W.x0, W.y0), V2(W.x1, W.y0), V2(W.x1, W.y1), V2(W.x0, W.y1)]));
  const backG = new THREE.ShapeGeometry(wallShape); backG.translate(0, 0, BZ);
  const planeUV = (g, f) => { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) { const [a, b] = f(p.getX(i), p.getY(i), p.getZ(i)); uv.setXY(i, a, b); } return g; };
  const sideL = new THREE.PlaneGeometry(ROOM.d, ROOM.h).rotateY(Math.PI / 2).translate(-3, ROOM.h / 2, 0.2);
  const sideR = new THREE.PlaneGeometry(ROOM.d, ROOM.h).rotateY(-Math.PI / 2).translate(3, ROOM.h / 2, 0.2);
  const ceil = new THREE.PlaneGeometry(6, ROOM.d).rotateX(Math.PI / 2).translate(0, ROOM.h, 0.2);
  [sideL, sideR].forEach((g) => planeUV(g, (x, y, z) => [z, y])); planeUV(ceil, (x, y, z) => [x, z]);
  const walls = new THREE.Mesh(mergeGeometries([backG, sideL, sideR, ceil]), toon({ map: wallTex, shadowSide: THREE.DoubleSide }));
  walls.castShadow = walls.receiveShadow = true; scene.add(walls);

  const floorG = new THREE.PlaneGeometry(6, ROOM.d).rotateX(-Math.PI / 2).translate(0, 0, 0.2);
  planeUV(floorG, (x, y, z) => [x / 1.6, -z / 1.6]);
  const floor = new THREE.Mesh(floorG, toon({ map: floorTex })); floor.receiveShadow = true; scene.add(floor);

  // --- нижняя панель стены ---
  const WZ = BZ + 0.004, WH = L.WAINSCOT;
  add(rbox(6, WH, 0.02, 0.006), P.sage, { p: [0, WH / 2, WZ + 0.01], ow: 0.5 });
  add(rbox(6.02, 0.05, 0.05, 0.015), P.cream, { p: [0, WH + 0.01, WZ + 0.025], ow: 0.7 });
  add(rbox(6.02, 0.11, 0.035, 0.012), P.cream, { p: [0, 0.055, WZ + 0.018], ow: 0.7 });
  for (let x = -2.7; x <= 2.71; x += 0.6) add(rbox(0.46, 0.62, 0.016, 0.006), P.sageL, { p: [x, 0.5, WZ + 0.026], ow: 0.45 });

  // --- окно: откосы, рама, подоконник, вид наружу ---
  const wcx = (W.x0 + W.x1) / 2, wcy = (W.y0 + W.y1) / 2, ww = W.x1 - W.x0, wh = W.y1 - W.y0, rev = 0.1;
  add(new THREE.BoxGeometry(0.02, wh, rev), P.jamb, { p: [W.x0 - 0.01, wcy, BZ - rev / 2], ow: 0 });
  add(new THREE.BoxGeometry(0.02, wh, rev), P.jamb, { p: [W.x1 + 0.01, wcy, BZ - rev / 2], ow: 0 });
  add(new THREE.BoxGeometry(ww + 0.04, 0.02, rev), P.jamb, { p: [wcx, W.y1 + 0.01, BZ - rev / 2], ow: 0 });
  add(new THREE.BoxGeometry(ww + 0.04, 0.02, rev), P.jamb, { p: [wcx, W.y0 - 0.01, BZ - rev / 2], ow: 0 });
  const fz = BZ - 0.065, fb = 0.06;
  add(rbox(fb, wh, 0.06, 0.012), P.white, { p: [W.x0 + fb / 2, wcy, fz], ow: 0.7 });
  add(rbox(fb, wh, 0.06, 0.012), P.white, { p: [W.x1 - fb / 2, wcy, fz], ow: 0.7 });
  add(rbox(ww, fb, 0.06, 0.012), P.white, { p: [wcx, W.y1 - fb / 2, fz], ow: 0.7 });
  add(rbox(ww, fb, 0.06, 0.012), P.white, { p: [wcx, W.y0 + fb / 2, fz], ow: 0.7 });
  add(rbox(0.04, wh - 0.1, 0.045, 0.01), P.white, { p: [wcx, wcy, fz], ow: 0.6 });
  add(rbox(ww - 0.1, 0.04, 0.045, 0.01), P.white, { p: [wcx, wcy + 0.08, fz], ow: 0.6 });
  add(rbox(ww + 0.16, 0.045, 0.12, 0.016), P.cream, { p: [wcx, W.y0 - 0.02, BZ + 0.02], ow: 0.9 });
  add(rbox(ww + 0.04, 0.05, 0.03, 0.01), P.cream, { p: [wcx, W.y0 - 0.065, BZ + 0.012], ow: 0.6 });
  // кактус на подоконнике
  group([wcx + 0.28, W.y0, BZ + 0.04], [0, 0, 0], () => {
    add(lathe([[0, 0], [0.035, 0], [0.042, 0.05], [0.048, 0.055], [0.048, 0.065], [0.04, 0.065], [0, 0.06]], 16), P.terra, { ow: 0.8 });
    add(new THREE.CapsuleGeometry(0.026, 0.05, 4, 10), P.leaf, { p: [0, 0.1, 0], ow: 0.8 });
    add(new THREE.CapsuleGeometry(0.013, 0.02, 3, 8), P.leafL, { p: [0.032, 0.105, 0], r: [0, 0, -0.9], ow: 0.7 });
    add(sph(0.012, 8, 6), P.pink, { p: [0, 0.155, 0], ow: 0.6 });
  });
  const skyW = 3, skyH = 2.6;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(skyW, skyH), new THREE.MeshBasicMaterial({ map: skyTex }));
  sky.position.set(-2.1, 0.6 + skyH / 2, BZ - 1.2); scene.add(sky);
  // блики на стекле
  const glintG = [];
  for (const [ox, wdt] of [[-0.12, 0.07], [0.0, 0.03]]) {
    const g = new THREE.PlaneGeometry(wdt, wh * 0.55); g.applyMatrix4(mat4([wcx - ww * 0.22 + ox, wcy + 0.15, fz - 0.005], [0, 0, -0.6])); glintG.push(g);
    const g2 = g.clone(); g2.translate(ww * 0.5, -0.12, 0); glintG.push(g2);
  }
  scene.add(new THREE.Mesh(mergeGeometries(glintG), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false })));

  // --- карниз и шторы ---
  const rodY = W.y1 + 0.13, rodZ = BZ + 0.1;
  add(cyl(0.016, 0.016, ww + 0.62, 12).rotateZ(Math.PI / 2), P.woodD, { p: [wcx, rodY, rodZ], ow: 0.8 });
  for (const s of [-1, 1]) {
    add(sph(0.032, 14, 10), P.woodD, { p: [wcx + s * (ww / 2 + 0.33), rodY, rodZ], ow: 0.8 });
    add(cyl(0.008, 0.008, 0.1, 8).rotateX(Math.PI / 2), P.woodD, { p: [wcx + s * (ww / 2 + 0.2), rodY, BZ + 0.05], ow: 0.5 });
  }
  function curtain(xa, xb, anchor) {
    const wdt = xb - xa, H = rodY - 0.03 - 1.0, waves = 4.5, A = 0.028, th = 0.018, n = 54, pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push(V2(u * wdt, A * Math.sin(u * waves * Math.PI * 2))); }
    for (let i = n; i >= 0; i--) { const u = i / n; pts.push(V2(u * wdt, A * Math.sin(u * waves * Math.PI * 2) - th)); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: H, steps: 18, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(Math.PI / 2); g.translate(xa, rodY - 0.03, rodZ - 0.01);
    const p = g.attributes.position, tie = 0.55;
    for (let i = 0; i < p.count; i++) {
      const t = (rodY - 0.03 - p.getY(i)) / H;
      const k = t < tie ? THREE.MathUtils.smoothstep(t, 0, tie) : 1 - THREE.MathUtils.smoothstep(t, tie, 1.05) * 0.55;
      const sc = 1 - 0.55 * k;
      p.setX(i, anchor + (p.getX(i) - anchor) * sc);
      p.setZ(i, rodZ - 0.01 + (p.getZ(i) - rodZ + 0.01) * (1 + k * 0.8) + k * 0.03);
    }
    add(smooth(g), P.pink, { ow: 1 });
    const cx = anchor + (xb + xa - 2 * anchor) * 0.225;
    add(rbox(wdt * 0.5, 0.04, 0.09, 0.015), P.rose, { p: [cx, rodY - 0.03 - H * tie, rodZ + 0.02], ow: 0.8 });
  }
  curtain(W.x0 - 0.3, W.x0 + 0.2, W.x0 - 0.3);
  curtain(W.x1 - 0.2, W.x1 + 0.3, W.x1 + 0.3);

  // --- стол ---
  const dz = DESK.z, dtH = 0.07;
  addMesh(rbox(DESK.w, dtH, DESK.d, 0.03, 3), toon({ map: deskTex }), { p: [DESK.x, TOP - dtH / 2, dz], ow: 1.1 }, P.wood);
  add(rbox(DESK.w - 0.16, 0.09, DESK.d - 0.12, 0.02), P.woodD, { p: [DESK.x, TOP - dtH - 0.045, dz], ow: 0.9 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = DESK.x + sx * (DESK.w / 2 - 0.1), lz = dz + sz * (DESK.d / 2 - 0.09), lh = TOP - dtH;
    add(cyl(0.036, 0.026, lh, 16), P.woodD, { p: [lx, lh / 2, lz], ow: 1 });
    add(cyl(0.03, 0.03, 0.02, 14), P.woodL, { p: [lx, 0.01, lz], ow: 0.6 });
  }
  add(rbox(0.52, 0.075, 0.02, 0.01), P.woodL, { p: [DESK.x + 0.48, TOP - dtH - 0.045, dz + DESK.d / 2 - 0.05], ow: 0.7 });
  add(sph(0.016, 12, 8), P.cream, { p: [DESK.x + 0.48, TOP - dtH - 0.045, dz + DESK.d / 2 - 0.035], ow: 0.6 });
  add(rbox(0.56, 0.006, 0.36, 0.003), P.sage, { p: [I.laptop.x, TOP + 0.003, I.laptop.z + 0.01], ow: 0.5 });

  // --- ноутбук ---
  const lb = TOP + 0.006, lt = I.laptop;
  group([lt.x, lb, lt.z], [0, 0, 0], () => {
    add(rbox(lt.w, 0.018, lt.d, 0.007), '#e9dfee', { p: [0, 0.009, 0], ow: 0.8 });
    add(rbox(lt.w - 0.04, 0.003, 0.11, 0.0015), P.plum, { p: [0, 0.018, -0.035], ow: 0 });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) add(new THREE.BoxGeometry(0.019, 0.003, 0.019), '#f5eef8', { p: [-0.1265 + c * 0.023, 0.0205, -0.0805 + r * 0.023], ow: 0 });
    add(rbox(0.1, 0.002, 0.06, 0.001), '#d8cbe0', { p: [0, 0.018, 0.068], ow: 0 });
    group([0, 0.018, -lt.d / 2 + 0.004], [lt.lidAngle, 0, 0], () => {
      add(rbox(lt.w, 0.235, 0.012, 0.007), '#e9dfee', { p: [0, 0.1175, -0.006], ow: 0.8 });
      add(rbox(lt.w - 0.012, 0.223, 0.002, 0.001), P.plum, { p: [0, 0.1175, 0.0005], ow: 0 });
      addMesh(new THREE.PlaneGeometry(0.31, 0.196), new THREE.MeshBasicMaterial({ map: screenTex }), { p: [0, 0.12, 0.002], ow: 0, cast: false });
    });
  });

  // --- настольная лампа ---
  const lp = I.lamp, bulbPos = new THREE.Vector3(lp.x, TOP + 0.36, lp.z);
  group([lp.x, TOP, lp.z], [0, 0, 0], () => {
    add(lathe([[0, 0], [0.09, 0], [0.095, 0.012], [0.085, 0.03], [0.03, 0.045], [0, 0.046]], 28), P.butter, { ow: 1 });
    add(cyl(0.013, 0.013, 0.3, 12), P.butter, { p: [0, 0.19, 0], ow: 0.8 });
    add(sph(0.022, 14, 10), P.butter, { p: [0, 0.05, 0], ow: 0.6 });
    const sg = lathe([[0.15, 0.33], [0.14, 0.34], [0.06, 0.48], [0.03, 0.5], [0.025, 0.49], [0.052, 0.472], [0.13, 0.338], [0.142, 0.328]], 32);
    addMesh(sg, toon({ color: '#ffe7b0', emissive: new THREE.Color('#ffb35c'), emissiveIntensity: 0.22 }), { ow: 1.1, cast: false }, '#e9a85a');
    add(new THREE.TorusGeometry(0.146, 0.008, 6, 40).rotateX(Math.PI / 2), P.rose, { p: [0, 0.333, 0], ow: 0.6 });
    add(cyl(0.032, 0.032, 0.012, 16), P.butter, { p: [0, 0.505, 0], ow: 0.7 });
  });

  // --- растение в горшке на столе (пилея: круглые листья) ---
  const pl = I.plant;
  seed = 3;
  group([pl.x, TOP, pl.z], [0, 0, 0], () => {
    add(lathe([[0, 0], [0.055, 0], [0.068, 0.09], [0.076, 0.095], [0.076, 0.115], [0.064, 0.115], [0, 0.105]], 24), P.terra, { ow: 1 });
    add(cyl(0.064, 0.064, 0.005, 20), '#7a4b32', { p: [0, 0.108, 0], ow: 0 });
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + rr(-0.3, 0.3), h = rr(0.14, 0.24), out = rr(0.04, 0.11);
      const tip = new THREE.Vector3(Math.cos(a) * out, 0.11 + h, Math.sin(a) * out);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(tip.x * 0.2, 0.11 + h * 0.8, tip.z * 0.2), tip);
      add(new THREE.TubeGeometry(curve, 8, 0.0035, 5), P.leafD, { ow: 0 });
      const r = rr(0.035, 0.05);
      add(cyl(r, r * 0.95, 0.008, 18).translate(0, 0, r * 0.7), [P.leaf, P.leafL, P.leafD][i % 3], { p: [tip.x, tip.y, tip.z], r: [rr(0.35, 0.8), -a + Math.PI / 2, 0, 'YXZ'], ow: 0.7 });
    }
  });

  // --- кружка ---
  group([I.mug.x, TOP, I.mug.z], [0, -0.45, 0], () => {
    add(lathe([[0, 0], [0.046, 0], [0.052, 0.008], [0.052, 0.1], [0.045, 0.1], [0.044, 0.094], [0.044, 0.012], [0, 0.012]], 28), P.pink, { ow: 1 });
    add(new THREE.TorusGeometry(0.029, 0.01, 8, 16, Math.PI).rotateZ(-Math.PI / 2), P.pink, { p: [0.052, 0.052, 0], ow: 0.8 });
    add(cyl(0.044, 0.044, 0.004, 24), '#8d5a3b', { p: [0, 0.084, 0], ow: 0 });
    add(heartGeo(0.022, 0.004), P.white, { p: [Math.sin(0.45) * 0.051, 0.05, Math.cos(0.45) * 0.051], r: [0, 0.45, 0], ow: 0.5 });
  });
  // пар над кружкой
  const steamG = [];
  for (let k = 0; k < 2; k++) {
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 6 + k * 2.5) * 0.012 * (0.4 + t) + (k - 0.5) * 0.036, t * (0.11 + k * 0.03), Math.cos(t * 5 + k * 2) * 0.008)); }
    steamG.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0045 - k * 0.001, 6));
  }
  const steam = new THREE.Mesh(mergeGeometries(steamG), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, depthWrite: false }));
  steam.position.set(I.mug.x, TOP + 0.11, I.mug.z); scene.add(steam);

  // --- лоток для записок + карандаш ---
  const tr = I.tray;
  group([tr.x, TOP, tr.z], [0, -0.12, 0], () => {
    add(rbox(tr.w, 0.012, tr.d, 0.005), P.lav, { p: [0, 0.006, 0], ow: 0.8 });
    add(rbox(tr.w, 0.04, 0.014, 0.006), P.lav, { p: [0, 0.02, tr.d / 2 - 0.007], ow: 0.8 });
    add(rbox(tr.w, 0.04, 0.014, 0.006), P.lav, { p: [0, 0.02, -tr.d / 2 + 0.007], ow: 0.8 });
    add(rbox(0.014, 0.04, tr.d, 0.006), P.lav, { p: [tr.w / 2 - 0.007, 0.02, 0], ow: 0.8 });
    add(rbox(0.014, 0.04, tr.d, 0.006), P.lav, { p: [-tr.w / 2 + 0.007, 0.02, 0], ow: 0.8 });
    add(new THREE.BoxGeometry(0.21, 0.004, 0.15), P.paper, { p: [0, 0.014, 0], r: [0, 0.05, 0], ow: 0.4 });
    add(new THREE.BoxGeometry(0.21, 0.004, 0.15), '#fff3d6', { p: [0.01, 0.018, 0.005], r: [0, -0.1, 0], ow: 0.4 });
    add(new THREE.BoxGeometry(0.075, 0.003, 0.075), P.butter, { p: [0.05, 0.022, 0.02], r: [0, 0.3, 0], ow: 0.4 });
  });
  group([I.notes[0][0] + 0.12, TOP + 0.009, I.notes[0][1] + 0.16], [0, 0.5, 0], () => {
    add(cyl(0.009, 0.009, 0.15, 6).rotateZ(Math.PI / 2), P.butter, { ow: 0.7 });
    add(cyl(0.009, 0.0, 0.03, 6).rotateZ(Math.PI / 2), P.woodL, { p: [0.09, 0, 0], ow: 0.7 });
    add(cyl(0.0095, 0.0095, 0.014, 10).rotateZ(Math.PI / 2), '#cfd3db', { p: [-0.082, 0, 0], ow: 0.6 });
    add(cyl(0.009, 0.009, 0.018, 10).rotateZ(Math.PI / 2), P.pink, { p: [-0.097, 0, 0], ow: 0.6 });
  });

  // --- скомканные записки ---
  seed = 21;
  I.notes.forEach(([nx, nz], i) => {
    const g = new THREE.IcosahedronGeometry(0.032, 1), p = g.attributes.position, vv = new THREE.Vector3(), cache = new Map();
    for (let k = 0; k < p.count; k++) {
      vv.fromBufferAttribute(p, k); const key = vv.toArray().map((v) => v.toFixed(4)).join();
      if (!cache.has(key)) cache.set(key, rr(0.78, 1.12));
      vv.multiplyScalar(cache.get(key)); p.setXYZ(k, vv.x, vv.y * 0.9, vv.z);
    }
    g.computeVertexNormals();
    add(g, [P.paper, P.pinkL, '#fde9a6'][i], { p: [nx, TOP + 0.027, nz], r: [rr(0, 3), rr(0, 3), 0], ow: 0.8 });
  });

  // --- полка с книгами ---
  const sh = I.shelf;
  add(rbox(sh.w, 0.035, sh.d, 0.012), P.wood, { p: [sh.x, sh.y - 0.0175, sh.z + 0.005], ow: 1 });
  for (const s of [-1, 1]) {
    const bs = new THREE.Shape([V2(0, 0), V2(0.15, 0), V2(0.15, 0.02), V2(0.02, 0.15), V2(0, 0.15)]);
    const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
    bg.rotateY(-Math.PI / 2).rotateZ(Math.PI);
    add(bg, P.cream, { p: [sh.x + s * (sh.w / 2 - 0.12), sh.y - 0.035, BZ + 0.004], ow: 0.7 });
  }
  const books = [[0.04, 0.24, P.rose], [0.05, 0.22, P.sageD], [0.035, 0.25, P.butter], [0.045, 0.21, P.lav], [0.04, 0.235, P.coral], [0.05, 0.2, P.sky]];
  let bx = sh.x - sh.w / 2 + 0.22;
  books.forEach(([bw, bh, c], i) => {
    const lean = i === 5 ? -0.32 : 0;
    const px = i === 5 ? bx + 0.06 : bx + bw / 2;
    group([px, sh.y, sh.z + 0.01], [0, 0, lean], () => {
      add(rbox(bw, bh, 0.16, 0.007), c, { p: [0, bh / 2, 0], ow: 0.9 });
      add(rbox(bw + 0.002, 0.012, 0.004, 0.002), P.cream, { p: [0, bh * 0.8, 0.08], ow: 0 });
      add(rbox(bw + 0.002, 0.012, 0.004, 0.002), P.cream, { p: [0, bh * 0.22, 0.08], ow: 0 });
    });
    bx += bw + 0.004;
  });
  group([sh.x + sh.w / 2 - 0.12, sh.y, sh.z + 0.02], [0, 0, 0], () => {
    add(lathe([[0, 0], [0.035, 0], [0.042, 0.06], [0, 0.06]], 16), P.mint, { ow: 0.8 });
    add(sph(0.04, 14, 10), P.leaf, { p: [0, 0.085, 0], s: [1, 0.85, 1], ow: 0.8 });
    add(sph(0.011, 8, 6), P.pink, { p: [0.01, 0.12, 0.01], ow: 0.5 });
  });

  // --- полароиды и скотч ---
  I.photos.forEach(([px, py, tilt], i) => {
    group([px, py, BZ + 0.006], [0, 0, tilt], () => {
      addMesh(rbox(0.13, 0.155, 0.004, 0.0018, 1), toon({ map: photoTex[i] }), { ow: 0.6, cast: false }, P.white);
      add(new THREE.BoxGeometry(0.05, 0.018, 0.0015), [P.mint, P.pinkL, P.butter, P.lav][i], { p: [0, 0.074, 0.003], r: [0, 0, 0.15 * (i % 2 ? 1 : -1)], ow: 0 });
    });
  });

  // --- гирлянда: провисающие дуги с лампочками; свечение = аддитивные ореолы (дешевле bloom) ---
  const gl = I.lights, bulbs = [], halos = [], hooks = 8, gz = BZ + 0.03;
  const bulbCols = ['#ffd38c', '#ffa9c0', '#fff0c2', '#a9f0d6', '#ffd38c', '#c9b8ff'];
  const bulbGeo = (g, c, ph) => {
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    const n = g.attributes.position.count, cc = new Float32Array(n * 3), cl = col(c);
    for (let k = 0; k < n; k++) cl.toArray(cc, k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.setAttribute('ph', new THREE.BufferAttribute(new Float32Array(n).fill(ph), 1));
    bulbs.push(g);
  };
  let bi = 0;
  for (let h = 0; h < hooks; h++) {
    const xa = gl.x0 + ((gl.x1 - gl.x0) * h) / hooks, xb = gl.x0 + ((gl.x1 - gl.x0) * (h + 1)) / hooks, pts = [];
    const swag = (u) => new THREE.Vector3(xa + (xb - xa) * u, gl.y - 0.48 * (1 - (2 * u - 1) ** 2), gz);
    for (let i = 0; i <= 12; i++) pts.push(swag(i / 12));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.0035, 4), '#557048', { ow: 0 });
    add(sph(0.012, 8, 6), P.woodD, { p: [xa, gl.y, gz], ow: 0.5 });
    for (const u of [0.12, 0.31, 0.5, 0.69, 0.88]) {
      const q = swag(u), c = bulbCols[bi % bulbCols.length];
      add(cyl(0.007, 0.007, 0.016, 8), '#557048', { p: [q.x, q.y - 0.008, q.z], ow: 0 });
      bulbGeo(new THREE.CapsuleGeometry(0.011, 0.016, 3, 8).translate(q.x, q.y - 0.03, q.z), c, bi * 1.7);
      halos.push([q.x, q.y - 0.03, q.z + 0.02, c, 0.085, bi * 1.7]);
      bi++;
    }
  }
  bulbGeo(sph(0.03, 12, 8).translate(bulbPos.x, bulbPos.y, bulbPos.z), '#fff1d0', -1);
  halos.push([bulbPos.x, bulbPos.y - 0.02, bulbPos.z + 0.1, '#ffb560', 0.2, -1]);
  const uT = { value: 0 };
  const bulbMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  bulbMat.onBeforeCompile = (s) => {
    s.uniforms.uT = uT;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float ph; uniform float uT;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nif (ph >= 0.0) vColor.rgb *= 0.85 + 0.15 * sin(uT * 1.6 + ph);');
  };
  scene.add(new THREE.Mesh(mergeGeometries(bulbs), bulbMat));
  {
    const n = halos.length, pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), hc = new Float32Array(n * 12), hs = new Float32Array(n * 4), ph = new Float32Array(n * 4), idx = [];
    halos.forEach(([x, y, z, c, s, p], i) => {
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
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT },
      vertexShader: `attribute vec2 corner; attribute vec3 hcol; attribute float hs, ph; uniform float uT; varying vec2 vC; varying vec3 vCol;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += corner * hs; vC = corner;
          vCol = hcol * (ph >= 0.0 ? 0.8 + 0.2 * sin(uT * 1.6 + ph) : 1.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec2 vC; varying vec3 vCol;
        void main() { float r = length(vC); float a = (1.0 - smoothstep(0.0, 1.0, r)); a = a * a * 0.55 + smoothstep(0.35, 0.0, r) * 0.25; gl_FragColor = vec4(vCol * a, 1.0); }`,
    }));
    m.frustumCulled = false; m.renderOrder = 10; scene.add(m);
  }

  // --- коврик ---
  addMesh(cyl(I.rug.r, I.rug.r, 0.022, 64), toon({ map: rugTex }), { p: [I.rug.x, 0.011, I.rug.z], ow: 0.9, cast: false }, P.rose);

  // --- когтеточка ---
  const sc = I.scratcher;
  group([sc.x, 0, sc.z], [0, 0.3, 0], () => {
    add(rbox(0.42, 0.055, 0.42, 0.02), P.lav, { p: [0, 0.0275, 0], ow: 1 });
    for (let i = 0; i < 11; i++) add(cyl(0.058, 0.058, 0.05, 16), i % 2 ? '#d9b98a' : '#c9a473', { p: [0, 0.08 + i * 0.05, 0], ow: i === 0 || i === 10 ? 0.9 : 0 });
    add(lathe([[0, 0], [0.17, 0], [0.19, 0.02], [0.19, 0.04], [0.17, 0.06], [0, 0.06]], 28), P.pink, { p: [0, 0.6, 0], ow: 1 });
    const str = new THREE.LineCurve3(new THREE.Vector3(0.15, 0.6, 0.06), new THREE.Vector3(0.17, 0.4, 0.07));
    add(new THREE.TubeGeometry(str, 2, 0.003, 4), P.rose, { ow: 0 });
    add(new THREE.IcosahedronGeometry(0.035, 1), P.coral, { p: [0.17, 0.38, 0.07], ow: 0.8 });
  });

  // --- большое растение в углу (монстера-ish) ---
  const bp = I.bigPlant;
  seed = 5;
  group([bp.x, 0, bp.z], [0, 0, 0], () => {
    add(lathe([[0, 0], [0.15, 0], [0.18, 0.03], [0.2, 0.34], [0, 0.34]], 32), P.cream, { ow: 1.1 });
    add(new THREE.TorusGeometry(0.205, 0.025, 10, 32).rotateX(Math.PI / 2), P.terra, { p: [0, 0.345, 0], ow: 1 });
    add(cyl(0.165, 0.165, 0.01, 24), '#7a4b32', { p: [0, 0.33, 0], ow: 0 });
    add(new THREE.TorusGeometry(0.19, 0.012, 8, 32).rotateX(Math.PI / 2), P.terra, { p: [0, 0.12, 0], ow: 0 });
    for (let i = 0; i < 15; i++) {
      const a = i * 2.39 + rr(-0.2, 0.2), h = rr(0.3, 0.95), out = rr(0.18, 0.42);
      const tip = new THREE.Vector3(Math.cos(a) * out, 0.33 + h, Math.sin(a) * out);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(a) * 0.03, 0.33, Math.sin(a) * 0.03), new THREE.Vector3(tip.x * 0.15, 0.33 + h * 0.85, tip.z * 0.15), tip);
      add(new THREE.TubeGeometry(curve, 10, 0.008, 6), P.leafD, { ow: 0.5 });
      const len = rr(0.3, 0.42), droop = 0.32, c = [P.leaf, P.leafL, '#5fae55'][i % 3];
      const o = { p: [tip.x, tip.y, tip.z], r: [rr(-1.25, -0.7), -a + Math.PI / 2 + Math.PI, 0, 'YXZ'] };
      add(leafGeo(len, len * 0.8, 0.22, droop), c, { ...o, ow: 0.9 });
      const rib = []; for (let k = 0; k <= 6; k++) { const y = (k / 6) * len * 0.92; rib.push(new THREE.Vector3(0, y, len * 0.03 - ((y / len) ** 2) * len * droop)); }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib), 8, 0.0035, 4), '#a8dc8c', { ...o, ow: 0 });
    }
  });

  // --- мягкие «пятна-тени» под предметами (как в Animal Crossing): одна сетка, один вызов ---
  {
    const blobTex = canvasTex(128, 128, (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.62, 'rgba(255,255,255,.9)'); g.addColorStop(0.85, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });
    const list = [
      [DESK.x, 0.002, dz, 1.15, 0.55, 0.75], [lp.x, TOP + 0.001, lp.z, 0.13, 0.11, 0.6], [lt.x, TOP + 0.007, lt.z, 0.22, 0.15, 0.5],
      [I.mug.x, TOP + 0.001, I.mug.z, 0.075, 0.07, 0.6], [pl.x, TOP + 0.001, pl.z, 0.1, 0.09, 0.6], [tr.x, TOP + 0.001, tr.z, 0.19, 0.14, 0.5],
      [I.scratcher.x, 0.002, I.scratcher.z, 0.33, 0.33, 0.6], [bp.x, 0.002, bp.z, 0.32, 0.32, 0.65],
      ...I.notes.map(([x, z]) => [x, TOP + 0.001, z, 0.045, 0.04, 0.55]),
    ];
    const gs = list.map(([x, y, z, rx, rz, a]) => {
      const g = new THREE.PlaneGeometry(rx * 2, rz * 2).rotateX(-Math.PI / 2).translate(x, y, z);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(4 * 3).fill(a), 3)); return g;
    });
    const blobs = new THREE.Mesh(mergeGeometries(gs), new THREE.MeshBasicMaterial({
      map: blobTex, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    blobs.material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'gl_FragColor = vec4(vec3(0.11, 0.05, 0.15), diffuseColor.a * vColor.r);');
    };
    blobs.renderOrder = 2; scene.add(blobs);
  }

  // --- солнечный луч из окна: полупрозрачная призма с затуханием ---
  {
    const sd = new THREE.Vector3(...L.SUN.dir).normalize(), len = 2.3, y0 = W.y0 + 0.12;
    const q = [[W.x0 + 0.06, y0], [W.x1 - 0.06, y0], [W.x1 - 0.06, W.y1 - 0.06], [W.x0 + 0.06, W.y1 - 0.06]];
    const pos = [], fade = [];
    for (const [x, y] of q) { pos.push(x, y, BZ); fade.push(1); }
    for (const [x, y] of q) { pos.push(x + sd.x * len, y + sd.y * len, BZ + sd.z * len); fade.push(0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
    g.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    const beam = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float fade; varying float vF; void main() { vF = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vF; void main() { gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * 0.085 * vF, 1.0); }',
    }));
    beam.renderOrder = 3; scene.add(beam);
  }

  // ---------- слияние: один меш тун + одна оболочка обводки ----------
  const solidMesh = new THREE.Mesh(mergeGeometries(solids), toon({ vertexColors: true }));
  solidMesh.castShadow = solidMesh.receiveShadow = true; scene.add(solidMesh);

  const outlineU = { uW: { value: 0.0045 }, uAspect: { value: 1.6 } };
  const outline = new THREE.Mesh(mergeGeometries(hulls), new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: outlineU,
    vertexShader: `attribute vec3 ocol; attribute float ow; uniform float uW, uAspect; varying vec3 vC;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec2 d = n.xy / max(length(n.xy), 0.35);
        clip.xy += d * ow * uW * vec2(1.0 / uAspect, 1.0) * clip.w;
        gl_Position = clip; vC = ocol;
      }`,
    fragmentShader: 'varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }',
  }));
  outline.renderOrder = 1; // после заливки: ранний z-тест отбрасывает скрытые пиксели оболочки
  scene.add(outline);

  // ---------- свет ----------
  scene.add(new THREE.HemisphereLight('#fff2e2', '#cdb2e6', 1.75));
  const fill = new THREE.DirectionalLight('#ffeedd', 1.0);
  fill.position.set(1.6, 3.2, 3.2); fill.target.position.set(0, 0.8, -1.6); scene.add(fill, fill.target);
  const sunDir = new THREE.Vector3(...L.SUN.dir).normalize();
  const sun = new THREE.DirectionalLight('#ffd49a', 2.0);
  sun.target.position.set(-0.4, 0.9, -1.0); sun.position.copy(sun.target.position).addScaledVector(sunDir, -6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3.6, right: 3.6, top: 3.6, bottom: -3.6, near: 1, far: 12 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const lampLight = new THREE.PointLight('#ffb466', 0.22, 2.2, 2);
  lampLight.position.copy(bulbPos).add(new THREE.Vector3(0, -0.04, 0)); scene.add(lampLight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  scene.background = col(P.wall);

  // ---------- пост: сцена в MSAA-цель (8 бит sRGB) → один проход: виньетка + вывод ----------
  // ponytail: без HDR/bloom-цепочки — она стоила ~25 мс на встройке; свечение дают ореолы-спрайты.
  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tScene; varying vec2 vUv;
      void main() { vec3 c = texture2D(tScene, vUv).rgb;
        float v = smoothstep(0.42, 1.0, length((vUv - 0.5) * vec2(1.3, 1.0)) * 1.25);
        c *= mix(vec3(1.0), vec3(0.8, 0.68, 0.82), v * 0.6);
        gl_FragColor = linearToOutputTexel(vec4(c, 1.0)); }`,
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  return {
    render(dt, t) {
      uT.value = t;
      steam.rotation.y = t * 0.5; steam.scale.y = 1 + Math.sin(t * 1.3) * 0.08;
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(postScene, postCam);
    },
    resize(w, h, pr) {
      const samples = pr >= 1.5 ? 2 : 4; // при pr 1.5 часть сглаживания даёт само разрешение
      if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
      rt.setSize(Math.round(w * pr), Math.round(h * pr));
      outlineU.uAspect.value = w / h;
    },
  };
}
