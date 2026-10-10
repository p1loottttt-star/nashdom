import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DATA } from './data.js';
import { openDesktop, load, save, daysLabel, whoSelect, myName, toast } from './desktop.js';
import { createDecor } from './decor.js';
import { createZones } from './zones.js';
import { badge as quizBadge } from './quiz.js';
import { badge as gamesBadge } from './games.js';
import { ITEM } from './catalog.js';
import { createCats } from './cats.js';
import { prepareCatGeometry } from './catmesh.js';
import { listAlbums, createAlbum, openAlbum } from './albums.js';
import { createPad, paperImage, PAPER } from './pad.js';
import * as sfx from './sound.js';
import { onRadio } from './lofi.js';
import { startEmoji } from './emoji.js';
import { inject as analytics } from '@vercel/analytics';
import * as store from './store.js';
import { createTuner, TIERS, prRange } from './gfx.js';
import { P, toon, toonify, outlineOf, Batch, G as Geo, halos, blobs, createPost, canvasTex as ccTex, blob, heartPath, TOON, OUTLINE } from './toon.js';
import { buildDesk, ITEMS as FURN } from './furniture.js';
import { createPlacer } from './placer.js';
import { getRoom, hasRoom, onRoom, saveRoom, myThings } from './myroom.js';
import { paintWall, paintFloor, WALLS } from './roomstyle.js';
import { askRoomSetup } from './roomsetup.js';
import { fetchWeather, fakeWeather, effects, cityHour, roomHour, label as wxLabel } from './weather.js';

// рукописный шрифт нужен до того, как рисуем записки, корешки и экран
await Promise.all([document.fonts.load('700 48px Caveat', 'привет'), document.fonts.load('500 48px Caveat', 'привет')]).catch(() => {});
performance.mark('lr:start');
await store.initStore(); // облако Supabase (вход, свой дом пары) или, если его нет, этот браузер
// заставка на время сборки и прогрева: комната появляется сразу плавной, без кадров-рывков компиляции
performance.mark('lr:store');
startEmoji(); // эмодзи интерфейса рисуются картинками в фоне (окна ноутбука открывались на 60–150 мс дольше)
const veil = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'veil' }));
setTimeout(() => { quizBadge(); gamesBadge(); }, 2500); // кто-то позвал пройти тест — сказать при входе (после экрана загрузки)

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = Math.random;
const body = document.body;
const LOW = matchMedia('(pointer: coarse)').matches; // телефоны: самая лёгкая ступень
const clamp = (k, a = 0, b = 1) => Math.min(b, Math.max(a, k));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---------- рендер: мультяшный стиль (toon.js) ----------
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // тун: тень — чёткое пятно, мягкость не нужна
renderer.shadowMap.autoUpdate = false; // карту теней обновляем сами раз в кадр
renderer.toneMapping = THREE.NoToneMapping; // цвета задаёт палитра, без HDR
const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = new THREE.Color(P.wall);

const camera = new THREE.PerspectiveCamera(45, 1, 0.03, 40);
const HOME = { pos: V(0, 1.5, 1.1), look: V(0, 1.12, -1.5) };
const cam = { pos: HOME.pos.clone(), look: HOME.look.clone() };
scene.add(camera);
const post = createPost(renderer); // сцена в MSAA-цель → виньетка и вывод одним проходом

// качество подстраивается на ходу (gfx.js): сначала разрешение, потом ступени; в обе стороны.
// Раньше одна медленная минута навсегда опускала сайт до pixel ratio 1 без сглаживания — отсюда были «пиксели».
const { max: PR_MAX, min: PR_MIN } = prRange(devicePixelRatio, LOW);
const gfx0 = load('gfx3', null); // где остановились в прошлый раз (gfx3: ступени без потери сглаживания; старые gfx2 могли застрять на pr 0.85 без MSAA)
const tuner = createTuner({ min: PR_MIN, max: PR_MAX, tier: LOW ? 2 : clamp(gfx0?.tier ?? 0, 0, 2) | 0, pr: gfx0?.pr ?? PR_MAX });
let tier = tuner.tier, pr = tuner.pr;
try { for (const k of ['lr:tier', 'lr:gfx', 'lr:gfx2']) localStorage.removeItem(k); } catch {}
function applyTier() {
  const T = TIERS[tier];
  if (sun.shadow.mapSize.x !== T.shadow) { sun.shadow.mapSize.set(T.shadow, T.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  sized = ''; // пересчитать размеры (и MSAA)
}

// ---------- помощники ----------
// материалы — мультяшные (toon.js); физические свойства (шероховатость, металл, блеск) в этом стиле не нужны
const TOON_KEYS = new Set(['map', 'alphaMap', 'emissive', 'emissiveMap', 'emissiveIntensity', 'transparent', 'opacity', 'side', 'alphaTest', 'depthWrite', 'vertexColors', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits']);
const M = (color, o = {}) => toon({ color, ...Object.fromEntries(Object.entries(o).filter(([k]) => TOON_KEYS.has(k))) });
const fabric = M;
const rbox = (w, h, d, r = 0.015) => new RoundedBoxGeometry(w, h, d, 3, r);
function add(geo, mat, x, y, z, parent = scene) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function canvasTex(w, h, draw, repeat, color = true) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function speckle(x, w, h, n, rgb, a = 0.06) {
  for (let i = 0; i < n; i++) { x.fillStyle = `rgba(${rgb},${rnd() * a})`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
}
function woodGrain(x, x0, y0, w, h, n, rgb = '60,30,15') {
  for (let i = 0; i < n; i++) {
    const y = y0 + rnd() * h, amp = 1 + rnd() * 4, f = 0.003 + rnd() * 0.01, ph = rnd() * 6;
    x.strokeStyle = `rgba(${rgb},${0.04 + rnd() * 0.12})`; x.lineWidth = 0.6 + rnd() * 1.6;
    x.beginPath();
    for (let px = x0; px <= x0 + w + 8; px += 8) { const yy = y + Math.sin(px * f + ph) * amp; px === x0 ? x.moveTo(px, yy) : x.lineTo(px, yy); }
    x.stroke();
  }
}
const softDot = canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});
const glowMat = (rgb, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb).multiplyScalar(k) });
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000; };

// ---------- свет (силы и цвета задаёт время суток, см. applyTime) ----------
// тун без окружения: основу даёт яркая полусфера (тёплый верх, сиреневый низ) и мягкий заполняющий спереди
const hemi = new THREE.HemisphereLight('#fff2e2', '#cdb2e6', 1.75);
scene.add(hemi);
const lampLight = new THREE.PointLight('#ffb466', 0.3, 2.4, 2); // без тени: точечная тень = 6 проходов сцены
scene.add(lampLight);
const fill = new THREE.DirectionalLight('#ffeedd', 1.0);
fill.position.set(1.6, 3.2, 3.2); fill.target.position.set(0, 0.8, -1.6);
scene.add(fill, fill.target);
// солнце днём, луна ночью — светит только через окно (стены и потолок отбрасывают тень)
const sun = new THREE.DirectionalLight('#fff', 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 0.5, far: 18 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
sun.target.position.set(-0.4, 0.8, -1.3);
scene.add(sun, sun.target);
// свет «из-за плеча», чтобы развёрнутую записку было видно
const noteLight = new THREE.PointLight('#fff1e0', 0, 0, 2);
noteLight.position.set(-0.25, 0.3, 0.15);
camera.add(noteLight);

// ---------- комната ----------
const TOP = 0.775; // поверхность стола
const WX = -1.55; // центр окна
const HOLE = { x0: WX - 0.45, x1: WX + 0.45, y0: 1.25, y1: 2.25 }; // проём окна в задней стене
const B = new Batch(scene); // неподвижная обстановка: один меш с цветами вершин + одна оболочка обводки (мало вызовов)
const uT = { value: 0 }, uLamp = { value: 1 }, uLights = { value: 1 }; // время для мерцания; яркость ореолов лампы и гирлянды

const floorTex = canvasTex(1024, 1024, () => {}, [3, 3]); // рисует paintFloor (roomstyle.js) по комнате человека
const floorMat = toon({ map: floorTex });
add(new THREE.PlaneGeometry(8, 8), floorMat, 0, 0, 0).rotation.x = -Math.PI / 2;

// стены: краска или обои — рисует paintWall (roomstyle.js)
const plasterTex = canvasTex(512, 512, () => {}, [8, 3]);
const wainTex = canvasTex(256, 256, () => {}, [16, 2]);
const upperM = toon({ map: plasterTex, shadowSide: THREE.DoubleSide });
const lowerM = toon({ map: wainTex });
// верх стены собирается из прямоугольников вокруг проёма (вырез в ShapeGeometry не пропускал солнце в карте теней)
function wallPiece(x0, x1, y0, y1) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + 4) / 8, (p.getY(i) - 0.95) / 3.05);
  return g;
}
function upperWall(hole) {
  if (!hole) return [wallPiece(-4, 4, 0.95, 4)];
  return [wallPiece(-4, hole.x0, 0.95, 4), wallPiece(hole.x1, 4, 0.95, 4), wallPiece(hole.x0, hole.x1, 0.95, hole.y0), wallPiece(hole.x0, hole.x1, hole.y1, 4)];
}
// боковые стены и потолок не выходят за заднюю стену — иначе загородят солнце снаружи
for (const [x, z, ry, hole] of [[0, -2, 0, HOLE], [-3, 2, Math.PI / 2], [3, 2, -Math.PI / 2]]) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  for (const piece of upperWall(hole)) add(piece, upperM, 0, 0, 0, g);
  add(new THREE.PlaneGeometry(8, 0.95), lowerM, 0, 0.475, 0, g);
  B.group([x, 0, z], [0, ry, 0], () => {
    B.add(Geo.rbox(8, 0.05, 0.05, 0.015), P.cream, { p: [0, 0.96, 0.025], ow: 0.7 }); // поручень над панелью
    B.add(Geo.rbox(8, 0.11, 0.035, 0.012), P.cream, { p: [0, 0.055, 0.018], ow: 0.7 }); // плинтус
  });
}
add(new THREE.PlaneGeometry(6, 8), M('#f6dfcf'), 0, 2.8, 2).rotation.x = Math.PI / 2; // потолок: держит солнце снаружи
// выпуклые филёнки на нижней панели: цвет — светлее панели (applyRoom), поэтому отдельным мешем
const moldM = M('#d39d9c');
const molds = [];
for (let x = -2.7; x <= 2.75; x += 0.6) molds.push(Geo.rbox(0.46, 0.62, 0.016, 0.006).translate(x, 0.5, -1.982));
outlineOf(add(mergeGeometries(molds), moldM, 0, 0, 0), 0.45);

// коврик: концентрические полосы и сердечки
const rugTex = ccTex(512, 512, (x) => {
  for (const [r, c] of [[256, P.rose], [236, P.pinkL], [212, P.cream], [196, P.pink], [150, P.cream], [134, '#f6b9c7']]) { x.fillStyle = c; blob(x, 256, 256, r); }
  x.fillStyle = P.rose; for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; heartPath(x, 256 + Math.cos(a) * 173, 256 + Math.sin(a) * 173, 9); x.fill(); }
  heartPath(x, 256, 262, 48); x.fill();
});
B.addMesh(Geo.cyl(1.15, 1.15, 0.022, 64), toon({ map: rugTex }), { p: [0, 0.011, -0.35], ow: 0.9, cast: false }, P.rose);

const wood = M(P.wood); // полка и лоток
// сам стол — в applyRoom: у каждого свой (furniture.js)

// ---------- окно ----------
const win = new THREE.Group(); win.position.set(WX, 1.75, -1.985); scene.add(win);
{
  const W = HOLE, wcx = WX, wcy = (W.y0 + W.y1) / 2, ww = W.x1 - W.x0, wh = W.y1 - W.y0, BZ = -2, rev = 0.1;
  B.add(new THREE.BoxGeometry(0.02, wh, rev), P.jamb, { p: [W.x0 - 0.01, wcy, BZ - rev / 2], ow: 0 }); // откосы
  B.add(new THREE.BoxGeometry(0.02, wh, rev), P.jamb, { p: [W.x1 + 0.01, wcy, BZ - rev / 2], ow: 0 });
  B.add(new THREE.BoxGeometry(ww + 0.04, 0.02, rev), P.jamb, { p: [wcx, W.y1 + 0.01, BZ - rev / 2], ow: 0 });
  const fz = -1.965, fb = 0.06; // рама чуть впереди стены: за ней стекло, капли, дождь и небо
  B.add(Geo.rbox(fb, wh + 0.04, 0.05, 0.012), P.white, { p: [W.x0 + fb / 2 - 0.02, wcy, fz], ow: 0.7 });
  B.add(Geo.rbox(fb, wh + 0.04, 0.05, 0.012), P.white, { p: [W.x1 - fb / 2 + 0.02, wcy, fz], ow: 0.7 });
  B.add(Geo.rbox(ww + 0.04, fb, 0.05, 0.012), P.white, { p: [wcx, W.y1 - fb / 2 + 0.02, fz], ow: 0.7 });
  B.add(Geo.rbox(0.035, wh - 0.06, 0.04, 0.01), P.white, { p: [wcx, wcy, fz + 0.004], ow: 0.6 });
  B.add(Geo.rbox(ww - 0.06, 0.035, 0.04, 0.01), P.white, { p: [wcx, wcy + 0.05, fz + 0.004], ow: 0.6 });
  B.add(Geo.rbox(ww + 0.04, 0.05, 0.03, 0.01), P.cream, { p: [wcx, W.y0 - 0.1, BZ + 0.012], ow: 0.6 }); // планка под подоконником
  // блики на стекле
  const gl = [];
  for (const [ox, wdt] of [[-0.12, 0.07], [0.0, 0.03]]) {
    const g = new THREE.PlaneGeometry(wdt, wh * 0.5); g.applyMatrix4(B.mat4([wcx - ww * 0.22 + ox, wcy + 0.15, -1.969], [0, 0, -0.6])); gl.push(g);
    const g2 = g.clone(); g2.translate(ww * 0.5, -0.12, 0); gl.push(g2);
  }
  const glints = new THREE.Mesh(mergeGeometries(gl), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
  glints.userData.noAO = true; scene.add(glints);
}
const frameM = M(P.cream);
const sill = add(Geo.rbox(1.1, 0.04, 0.16, 0.014), frameM, 0, -0.56, 0.07, win); sill.userData.surface = true; // подоконник: на нём сидят коты
outlineOf(sill, 0.9);
const glass = add(new THREE.PlaneGeometry(0.9, 1.0), new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0.06 }), 0, 0, 0.014, win);
glass.userData.noAO = true; glass.castShadow = false;
glass.material.depthWrite = false; // иначе стекло закрывает снег и дождь за окном, если они рисуются после него
// небо снаружи, за проёмом
const skyCanvas = Object.assign(document.createElement('canvas'), { width: 512, height: 560 });
const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
const sky = add(new THREE.PlaneGeometry(1.3, 1.42), new THREE.MeshBasicMaterial({ map: skyTex }), WX, 1.75, -2.16);
sky.castShadow = sky.receiveShadow = false;
const orb = add(new THREE.CircleGeometry(0.045, 32), new THREE.MeshBasicMaterial({ color: '#fff' }), WX, 1.9, -2.155);
orb.castShadow = orb.receiveShadow = false;
const city = []; // дома и окна — один раз, чтобы не прыгали при перерисовке неба
for (let bx = -10; bx < 512; bx += 30 + rnd() * 40) {
  const bw = 30 + rnd() * 50, bh = 60 + rnd() * 160, lit = [];
  for (let wy = 560 - bh + 8; wy < 554; wy += 14) for (let wx = bx + 5; wx < bx + bw - 6; wx += 11) if (rnd() < 0.3) lit.push([wx, wy, rnd() < 0.7 ? '#ffd58a' : '#ffb0c4']);
  city.push({ bx, bw, bh, lit });
}
const stars = Array.from({ length: 160 }, () => [rnd() * 512, rnd() * 330, rnd() * 0.7 + 0.2]);
const clouds = Array.from({ length: 22 }, (_, i) => ({ x: rnd() * 700 - 100, y: 30 + rnd() * 260, r: 40 + rnd() * 70, k: rnd(), order: i }));
let flash = 0; // вспышка молнии 0…1
function drawSky(tp, s = 0) {
  const x = skyCanvas.getContext('2d'), w = 512, h = 560, day = tp.day;
  // тучи затягивают небо серым; туман — белёсой дымкой
  const oc = clamp(FX.clouds * 1.15 - 0.25) * 0.9 + FX.fog * 0.25 + FX.rain * 0.1 + FX.snow * 0.12; // снежное небо темнее — хлопья видно
  const top = tp.top.clone().lerp(new THREE.Color(day > 0.3 ? '#7f8995' : '#16181f'), oc * (0.4 + 0.6 * day + 0.4 * (1 - day)));
  const bot = tp.bottom.clone().lerp(new THREE.Color(day > 0.3 ? '#b9bec6' : '#262833'), oc);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#' + top.getHexString(THREE.SRGBColorSpace)); g.addColorStop(1, '#' + bot.getHexString(THREE.SRGBColorSpace));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const starA = tp.stars * (1 - clamp(FX.clouds * 1.4));
  if (starA > 0.01) for (const [sx, sy, a] of stars) { x.fillStyle = `rgba(255,255,240,${a * starA})`; x.fillRect(sx, sy, 1.5, 1.5); }
  // облака плывут по ветру; чем пасмурнее, тем их больше, они крупнее и серее
  const n = Math.round(3 + FX.clouds * 19), shade = Math.round(255 - 110 * clamp(FX.clouds * 1.2 - 0.2) - 60 * FX.rain);
  const cr = Math.round(shade * (0.35 + 0.65 * day)), cg2 = Math.round(shade * (0.36 + 0.64 * day)), cb = Math.round(shade * (0.42 + 0.58 * day));
  // мультяшные облака: пухлые кляксы, снизу сиреневая подложка
  const PUFF = [[0, 0, 1], [-1.1, 0.25, 0.7], [1.1, 0.2, 0.75], [-0.5, -0.45, 0.75], [0.55, -0.4, 0.8], [1.9, 0.35, 0.5], [-1.9, 0.4, 0.45]];
  for (const c of clouds) {
    if (c.order >= n) continue;
    const cx = ((c.x + s * (4 + 10 * FX.wind) * (0.5 + c.k)) % 800 + 800) % 800 - 150, k = (c.r / 70) * (1 + FX.clouds * 0.6) * 0.6;
    x.globalAlpha = Math.min(1, (0.55 + 0.45 * FX.clouds) * (0.5 + 0.5 * day + 0.3));
    x.fillStyle = `rgb(${Math.round(cr * 0.82)},${Math.round(cg2 * 0.78)},${Math.round(cb * 0.92)})`;
    for (const [a, b, r] of PUFF) blob(x, cx + a * 40 * k, c.y + b * 40 * k + 7 * k, r * 40 * k);
    x.fillStyle = `rgb(${cr},${cg2},${cb})`;
    for (const [a, b, r] of PUFF) blob(x, cx + a * 40 * k, c.y + b * 40 * k, r * 40 * k * 0.95);
  }
  x.globalAlpha = 1;
  const bcol = new THREE.Color('#1b1430').lerp(new THREE.Color('#8d9bb8'), day).lerp(new THREE.Color(day > 0.3 ? '#9aa2ad' : '#22232b'), oc * 0.5);
  // дома: скруглённые крыши и окна-«таблетки»; дальний ряд светлее
  const hex = '#' + bcol.getHexString(THREE.SRGBColorSpace), far = '#' + bcol.clone().lerp(top, 0.35).getHexString(THREE.SRGBColorSpace);
  city.forEach((b, i) => {
    x.fillStyle = i % 2 ? far : hex;
    x.beginPath(); x.roundRect(b.bx, h - b.bh, b.bw, b.bh + 10, [10, 10, 0, 0]); x.fill();
    x.globalAlpha = tp.city;
    for (const [wx, wy, c] of b.lit) { x.fillStyle = c; x.beginPath(); x.roundRect(wx, wy, 6, 8, 2); x.fill(); }
    x.globalAlpha = 1;
  });
  // туман и пелена дождя прячут дальние дома
  const haze = FX.fog * 0.65 + FX.rain * 0.22 + FX.snow * 0.08;
  if (haze > 0.01) { x.fillStyle = day > 0.3 ? `rgba(205,210,216,${haze})` : `rgba(40,42,52,${haze})`; x.fillRect(0, 0, w, h); }
  if (flash > 0.01) { x.fillStyle = `rgba(235,240,255,${flash * 0.85})`; x.fillRect(0, 0, w, h); }
  skyTex.needsUpdate = true;
}

// шторы: волнистая ткань собрана подхватами к краям (рисуется один раз — без колыхания)
{
  const W = HOLE, wcx = WX, ww = W.x1 - W.x0, rodY = W.y1 + 0.13, rodZ = -1.9;
  B.add(Geo.cyl(0.016, 0.016, ww + 0.62, 12).rotateZ(Math.PI / 2), P.woodD, { p: [wcx, rodY, rodZ], ow: 0.8 });
  for (const s of [-1, 1]) {
    B.add(Geo.sph(0.032, 14, 10), P.woodD, { p: [wcx + s * (ww / 2 + 0.33), rodY, rodZ], ow: 0.8 });
    B.add(Geo.cyl(0.008, 0.008, 0.1, 8).rotateX(Math.PI / 2), P.woodD, { p: [wcx + s * (ww / 2 + 0.2), rodY, -1.95], ow: 0.5 });
  }
  const curtain = (xa, xb, anchor) => {
    const wdt = xb - xa, H = rodY - 0.03 - 1.0, waves = 4.5, A = 0.028, th = 0.018, n = 54, pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push(new THREE.Vector2(u * wdt, A * Math.sin(u * waves * Math.PI * 2))); }
    for (let i = n; i >= 0; i--) { const u = i / n; pts.push(new THREE.Vector2(u * wdt, A * Math.sin(u * waves * Math.PI * 2) - th)); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: H, steps: 18, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(Math.PI / 2); g.translate(xa, rodY - 0.03, rodZ - 0.01);
    const p = g.attributes.position, tie = 0.55;
    for (let i = 0; i < p.count; i++) {
      const t = (rodY - 0.03 - p.getY(i)) / H;
      const k = t < tie ? THREE.MathUtils.smoothstep(t, 0, tie) : 1 - THREE.MathUtils.smoothstep(t, tie, 1.05) * 0.55;
      p.setX(i, anchor + (p.getX(i) - anchor) * (1 - 0.55 * k));
      p.setZ(i, rodZ - 0.01 + (p.getZ(i) - rodZ + 0.01) * (1 + k * 0.8) + k * 0.03);
    }
    B.add(Geo.smooth(g), P.pink, { ow: 1 });
    // подхват — лента, обхватывающая собранную ткань (сечение там ≈ 0.45·wdt × 0.13 м); «скруглённый прямоугольник», чтобы не резать складки
    const cx = anchor + (xb + xa - 2 * anchor) * 0.225, cy = rodY - 0.03 - H * tie, cz = rodZ - 0.0, hx = wdt * 0.245, hz = 0.078;
    const sp = (v) => Math.sign(v) * Math.abs(v) ** 0.45;
    const band = Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return new THREE.Vector3(cx + sp(Math.cos(a)) * hx, cy - 0.006 * Math.cos(a * 2), cz + sp(Math.sin(a)) * hz); });
    B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band, true), 64, 0.013, 8, true), P.rose, { ow: 0.8 });
  };
  curtain(W.x0 - 0.3, W.x0 + 0.2, W.x0 - 0.3);
  curtain(W.x1 - 0.2, W.x1 + 0.3, W.x1 + 0.3);
}
// свечи на подоконнике (левый край — справа место для котиков)
const flames = [], glowSpots = []; // ореолы: [x, y, z, цвет, размер, фаза] — лампочки, лампа, свечи
for (const [dx, hgt] of [[-0.4, 0.09], [-0.33, 0.06]]) {
  const y = 1.19 + 0.02 + hgt / 2, x = WX + dx;
  B.add(Geo.cyl(0.022, 0.024, hgt, 16), P.cream, { p: [x, y, -1.905], ow: 0.7 });
  const fl = add(Geo.sph(1, 10, 8), glowMat([1, 0.72, 0.32], 1.3), dx, y - 1.75 + hgt / 2 + 0.016, 0.08, win);
  fl.scale.set(0.007, 0.016, 0.007); fl.castShadow = fl.receiveShadow = false; fl.userData.noAO = true;
  flames.push(fl);
  glowSpots.push([x, y + hgt / 2 + 0.016, -1.89, '#ff9a40', 0.05, -1]);
}
const candleLight = new THREE.PointLight('#ff9a40', 0.25, 1.6, 2);
candleLight.position.set(WX - 0.37, 1.32, -1.86);
scene.add(candleLight);

// лучи из окна: призмы от каждой форточки вдоль направления света
const PANES = [[WX - 0.45, WX - 0.015, 1.25, 1.785], [WX + 0.015, WX + 0.45, 1.25, 1.785], [WX - 0.45, WX - 0.015, 1.815, 2.25], [WX + 0.015, WX + 0.45, 1.815, 2.25]];
const shaftGeo = new THREE.BufferGeometry();
const shaftMat = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color() }, strength: { value: 0 } },
  vertexShader: 'attribute vec2 uvw; varying vec2 vU; void main(){ vU = uvw; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 color; uniform float strength; varying vec2 vU;
    void main(){ float a = strength * pow(1.0 - vU.y, 1.7) * sin(vU.x * 3.14159) * smoothstep(0.0, 0.05, vU.y); gl_FragColor = vec4(color * a, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const shafts = new THREE.Mesh(shaftGeo, shaftMat);
shafts.userData.noAO = true; shafts.frustumCulled = false; scene.add(shafts);
const SUN_DUST = 260, sunDustGeo = new THREE.BufferGeometry(), sunDustSeed = Array.from({ length: SUN_DUST }, () => [Math.floor(rnd() * 4), rnd(), rnd(), rnd(), rnd() * 100]);
sunDustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SUN_DUST * 3), 3));
const sunDustMat = new THREE.PointsMaterial({ size: 0.006, map: softDot, color: new THREE.Color(1.6, 1.4, 1.1), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const sunDust = new THREE.Points(sunDustGeo, sunDustMat); sunDust.frustumCulled = false; scene.add(sunDust);
const sunDir = V(0.6, -0.6, 0.3).normalize();
let sunBase = 1, sunDustBase = 0, hemiBase = 0.26;
function buildShafts(d) {
  const pos = [], uvw = [], L = 4.2;
  for (const [x0, x1, y0, y1] of PANES) {
    const c = [V(x0, y0, -1.99), V(x1, y0, -1.99), V(x1, y1, -1.99), V(x0, y1, -1.99)];
    for (let e = 0; e < 4; e++) {
      const a = c[e], b = c[(e + 1) % 4], a2 = a.clone().addScaledVector(d, L), b2 = b.clone().addScaledVector(d, L);
      pos.push(...a.toArray(), ...b.toArray(), ...b2.toArray(), ...a.toArray(), ...b2.toArray(), ...a2.toArray());
      uvw.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
  }
  shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shaftGeo.setAttribute('uvw', new THREE.Float32BufferAttribute(uvw, 2));
}

// полка с альбомами
const albumShelf = add(Geo.rbox(0.95, 0.03, 0.2, 0.012), wood, 0.72, 1.5, -1.9); albumShelf.userData.surface = true;
outlineOf(albumShelf, 1);
for (const sx of [-1, 1]) { // кронштейны
  const bg = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.15, 0), new THREE.Vector2(0.15, 0.02), new THREE.Vector2(0.02, 0.15), new THREE.Vector2(0, 0.15)]), { depth: 0.025, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
  bg.rotateY(-Math.PI / 2).rotateZ(Math.PI);
  B.add(bg, P.cream, { p: [0.72 + sx * (0.95 / 2 - 0.12), 1.485, -1.996], ow: 0.7 });
}
const clickables = [];
const shelf = new THREE.Group(); scene.add(shelf);
let books = [], hoveredBook = null;
const bookLabel = document.getElementById('booklabel');
function spineTex(title, color, plus) {
  return canvasTex(256, 1024, (x, w, h) => {
    x.scale(2, 2); w /= 2; h /= 2;
    x.fillStyle = plus ? '#fbf3ec' : color; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 2500, '0,0,0', 0.08); speckle(x, w, h, 1500, '255,255,255', 0.08);
    const ink = plus ? '#c9a7a0' : lum(color) < 150 ? '#fff6ee' : '#3b2a35';
    x.fillStyle = plus ? '#c9a7a0' : '#e9c46a';
    if (!plus) for (const y of [30, 44, h - 48, h - 34]) x.fillRect(10, y, w - 20, 4);
    x.save(); x.translate(w / 2, h / 2); x.rotate(-Math.PI / 2);
    x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = 64; x.font = `700 ${size}px Caveat`;
    while (x.measureText(title).width > h - 120 && size > 30) { size -= 2; x.font = `700 ${size}px Caveat`; }
    x.fillText(title, 0, 4); x.restore();
  });
}
function makeBook(album, w, hgt, x) {
  const g = new THREE.Group(); g.position.set(x + w / 2, 1.515 + hgt / 2, -1.9);
  const plus = !album;
  const cover = plus ? new THREE.MeshStandardMaterial({ color: '#fbf3ec', transparent: true, opacity: 0.55 }) : M(album.color, { roughness: 0.7 });
  const pages = plus ? cover : M('#f6efe2', { roughness: 0.9 });
  const spine = new THREE.MeshStandardMaterial({ map: spineTex(plus ? '+' : album.title, album?.color, plus), roughness: 0.65, transparent: plus, opacity: plus ? 0.8 : 1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 0.15), [cover, cover, pages, pages, spine, cover]);
  mesh.castShadow = mesh.receiveShadow = !plus;
  g.add(mesh);
  g.userData = { book: album || 'new', title: plus ? 'новый альбом' : album.title, out: 0, act: () => openShelfAlbum(album) };
  shelf.add(g); books.push(g); clickables.push(g);
  return g;
}
async function buildShelf() {
  const albums = await listAlbums().catch(() => []);
  for (const b of books) clickables.splice(clickables.indexOf(b), 1);
  shelf.clear(); books = [];
  let x = 0.29;
  albums.slice(0, 13).forEach((a, i) => {
    const w = 0.042 + Math.min(0.026, a.pages.length * 0.003), hgt = 0.2 + ((i * 53) % 5) * 0.012;
    makeBook(a, w, hgt, x); x += w + 0.005;
  });
  if (x < 1.12) makeBook(null, 0.04, 0.19, x + 0.01);
}
buildShelf();
store.on('albums', () => { if (state === 'room') buildShelf(); });

// полароиды на стене: нажал — выбрал фото, подпись пишется внизу карточки
const wall = [];
function placeholderTex(i) {
  return canvasTex(512, 512, (x, w, h) => {
    x.scale(2, 2); w /= 2; h /= 2;
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, ['#fde2d4', '#d9e8f5', '#e8ddf5', '#fbe7b5'][i]); g.addColorStop(1, '#f6c1d0');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(160,80,100,.55)'; x.font = '700 40px Caveat'; x.textAlign = 'center';
    x.fillText('+ фото', w / 2, h / 2 + 12);
  });
}
function captionTex(text) {
  return canvasTex(512, 96, (x, w, h) => {
    x.scale(2, 2); w /= 2; h /= 2;
    x.fillStyle = '#fffdf8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#4a3a44'; x.font = '700 32px Caveat'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText((text || '').slice(0, 22), w / 2, h / 2 + 2);
  });
}
function setWall(i) {
  const w = wall[i], d = store.get('wall', 'w' + i) || (DATA.photos[i] && { url: DATA.photos[i].src, caption: DATA.photos[i].caption });
  w.photo.material.map?.dispose(); w.cap.material.map?.dispose();
  w.cap.material.map = captionTex(d?.caption); w.cap.material.needsUpdate = true;
  if (!d?.url) { w.photo.material.map = placeholderTex(i); w.photo.material.needsUpdate = true; return; }
  new THREE.TextureLoader().setCrossOrigin('anonymous').load(store.media(d.url), (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    const a = t.image.width / t.image.height; // обрезка «по центру», как у настоящего полароида
    if (a > 1) { t.repeat.set(1 / a, 1); t.offset.set((1 - 1 / a) / 2, 0); } else { t.repeat.set(1, a); t.offset.set(0, (1 - a) / 2); }
    w.photo.material.map = t; w.photo.material.needsUpdate = true;
  });
}
[[-0.7, 1.62, 0.08], [-0.42, 1.52, -0.06], [-0.14, 1.66, 0.05], [0.16, 1.86, -0.04]].forEach(([x, y, r], i) => {
  const g = new THREE.Group(); g.position.set(x, y, -1.99); g.rotation.z = r; scene.add(g);
  outlineOf(add(Geo.rbox(0.2, 0.24, 0.006, 0.0028, 1), M(P.white), 0, 0, 0, g), 0.6);
  const photo = add(new THREE.PlaneGeometry(0.17, 0.17), M('#fff'), 0, 0.02, 0.0035, g);
  const cap = add(new THREE.PlaneGeometry(0.17, 0.032), M('#fff'), 0, -0.087, 0.0035, g);
  add(new THREE.PlaneGeometry(0.08, 0.03), M([P.mint, P.pinkL, P.butter, P.lav][i]), 0, 0.12, 0.0045, g).rotation.z = 0.15 * (i % 2 ? 1 : -1); // скотч
  g.userData.act = () => openWallPhoto(i);
  clickables.push(g);
  wall.push({ g, photo, cap });
  setWall(i);
});
store.on('wall', (id) => { const i = +id.slice(1); if (wall[i]) setWall(i); });

// гирлянда: провисающие дуги с лампочками; свечение — ореолы (дешевле bloom)
{
  const hooks = 7, gz = -1.97, gy = 2.32, x0 = -2.9, x1 = 2.9, cols = ['#ffd38c', '#ffa9c0', '#fff0c2', '#a9f0d6', '#ffd38c', '#c9b8ff'];
  const bulbs = [];
  let bi = 0;
  for (let h = 0; h < hooks; h++) {
    const xa = x0 + ((x1 - x0) * h) / hooks, xb = x0 + ((x1 - x0) * (h + 1)) / hooks, pts = [];
    const swag = (u) => new THREE.Vector3(xa + (xb - xa) * u, gy - 0.17 * (1 - (2 * u - 1) ** 2), gz);
    for (let i = 0; i <= 12; i++) pts.push(swag(i / 12));
    B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.0035, 4), '#557048', { ow: 0 });
    B.add(Geo.sph(0.012, 8, 6), P.woodD, { p: [xa, gy, gz], ow: 0.5 });
    for (const u of [0.15, 0.38, 0.62, 0.85]) {
      const q = swag(u), c = cols[bi % cols.length];
      B.add(Geo.cyl(0.007, 0.007, 0.016, 8), '#557048', { p: [q.x, q.y - 0.008, q.z], ow: 0 });
      const g = new THREE.CapsuleGeometry(0.011, 0.016, 3, 8).translate(q.x, q.y - 0.03, q.z);
      g.deleteAttribute('uv'); g.deleteAttribute('normal');
      const n = g.attributes.position.count, cc = new Float32Array(n * 3), cl = new THREE.Color(c);
      for (let k = 0; k < n; k++) cl.toArray(cc, k * 3);
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.setAttribute('ph', new THREE.BufferAttribute(new Float32Array(n).fill(bi * 1.7), 1));
      bulbs.push(g);
      glowSpots.push([q.x, q.y - 0.03, q.z + 0.02, c, 0.085, bi * 1.7]);
      bi++;
    }
  }
  const bm = new THREE.MeshBasicMaterial({ vertexColors: true });
  bm.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uT; sh.uniforms.uK = uLights;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ph; uniform float uT, uK;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb *= mix(0.55, 0.85 + 0.15 * sin(uT * 1.6 + ph), uK);');
  };
  const bulbMesh = new THREE.Mesh(mergeGeometries(bulbs), bm); bulbMesh.userData.noAO = true; scene.add(bulbMesh);
}

// кресло-мешок с подушкой-сердцем
B.add(Geo.sph(1, 40, 28), '#d79bb8', { p: [-1.95, 0.26, -0.75], s: [0.5, 0.3, 0.5], ow: 1.1 });
const heart = add(Geo.heart(0.1, 0.03), M(P.rose), -2.12, 0.62, -0.98);
heart.scale.setScalar(1.5); heart.rotation.set(-0.25, 0.75, 0.1);
outlineOf(heart, 1);
heart.userData.act = () => { sfx.pop(); floatAt(heart, '♥'); };
clickables.push(heart);

// большое растение справа (монстера): широкие листья на изогнутых черешках
{
  let seed = 5; const rr = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); };
  B.group([1.75, 0, -1.55], [0, 0, 0], () => {
    B.add(Geo.lathe([[0, 0], [0.15, 0], [0.18, 0.03], [0.2, 0.34], [0, 0.34]], 32), P.cream, { ow: 1.1 });
    B.add(new THREE.TorusGeometry(0.205, 0.025, 10, 32).rotateX(Math.PI / 2), P.terra, { p: [0, 0.345, 0], ow: 1 });
    B.add(Geo.cyl(0.165, 0.165, 0.01, 24), '#7a4b32', { p: [0, 0.33, 0], ow: 0 });
    B.add(new THREE.TorusGeometry(0.19, 0.012, 8, 32).rotateX(Math.PI / 2), P.terra, { p: [0, 0.12, 0], ow: 0 });
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39 + rr(-0.2, 0.2), h = rr(0.3, 0.9), out = rr(0.16, 0.38);
      const tip = new THREE.Vector3(Math.cos(a) * out, 0.33 + h, Math.sin(a) * out);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(a) * 0.03, 0.33, Math.sin(a) * 0.03), new THREE.Vector3(tip.x * 0.55, 0.33 + h * 0.75, tip.z * 0.55), tip);
      B.add(new THREE.TubeGeometry(curve, 10, 0.008, 6), P.leafD, { ow: 0.5 });
      const len = rr(0.28, 0.4), droop = 0.32, o = { p: [tip.x, tip.y, tip.z], r: [rr(-1.25, -0.7), -a + Math.PI / 2 + Math.PI, 0, 'YXZ'] };
      B.add(Geo.leaf(len, len * 0.8, 0.22, droop), [P.leaf, P.leafL, '#5fae55'][i % 3], { ...o, ow: 0.9 });
    }
  });
}
// корзинка для красоты
B.add(Geo.lathe([[0, 0], [0.14, 0], [0.17, 0.26], [0.155, 0.26], [0.128, 0.015], [0, 0.015]], 28), '#d9a86b', { p: [1.5, 0, -0.6], ow: 1 });
B.add(new THREE.TorusGeometry(0.165, 0.014, 8, 32).rotateX(Math.PI / 2), '#c48f55', { p: [1.5, 0.26, -0.6], ow: 0.7 });
for (let k = 0; k < 3; k++) B.add(new THREE.TorusGeometry(0.15 + k * 0.007, 0.006, 6, 32).rotateX(Math.PI / 2), '#c48f55', { p: [1.5, 0.07 + k * 0.07, -0.6], ow: 0 });

// ---------- на столе ----------
// лампа
const lamp = new THREE.Group(); lamp.position.set(-0.72, TOP, -1.68); scene.add(lamp);
B.group([-0.72, TOP, -1.68], [0, 0, 0], () => {
  B.add(Geo.lathe([[0, 0], [0.09, 0], [0.095, 0.012], [0.085, 0.03], [0.03, 0.045], [0, 0.046]], 28), P.butter, { ow: 1 });
  B.add(Geo.cyl(0.013, 0.013, 0.3, 12), P.butter, { p: [0, 0.19, 0], ow: 0.8 });
  B.add(Geo.sph(0.022, 14, 10), P.butter, { p: [0, 0.05, 0], ow: 0.6 });
  B.add(new THREE.TorusGeometry(0.146, 0.008, 6, 40).rotateX(Math.PI / 2), P.rose, { p: [0, 0.333, 0], ow: 0.6 });
  B.add(Geo.cyl(0.032, 0.032, 0.012, 16), P.butter, { p: [0, 0.505, 0], ow: 0.7 });
});
// абажур светится сам: вечером сильнее (applyTime)
const shadeM = toon({ color: '#ffe7b0', emissive: new THREE.Color('#ffb35c'), emissiveIntensity: 0.22, side: THREE.DoubleSide });
B.group([-0.72, TOP, -1.68], [0, 0, 0], () => B.addMesh(Geo.lathe([[0.15, 0.33], [0.14, 0.34], [0.06, 0.48], [0.03, 0.5], [0.025, 0.49], [0.052, 0.472], [0.13, 0.338], [0.142, 0.328]], 32), shadeM, { ow: 1.1, cast: false }, '#e9a85a'));
const bulbM = glowMat([1, 0.9, 0.7], 1);
add(Geo.sph(0.03, 16, 12), bulbM, 0, 0.36, 0, lamp).castShadow = false;
lampLight.position.set(-0.72, TOP + 0.32, -1.68);
glowSpots.push([-0.72, TOP + 0.34, -1.58, '#ffb560', 0.15, -1]);
const beamTex = canvasTex(4, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, null, false);
const beamM = new THREE.MeshBasicMaterial({ color: '#ffcf8a', alphaMap: beamTex, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const beam = add(new THREE.CylinderGeometry(0.13, 0.36, 0.32, 48, 1, true), beamM, 0, 0.16, 0, lamp);
beam.castShadow = beam.receiveShadow = false; beam.userData.noAO = true;
const DUST = 120, dustGeo = new THREE.BufferGeometry(), dustSeed = [];
{
  const a = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) { const r = Math.sqrt(rnd()) * 0.32, t = rnd() * 6.3; a.set([Math.cos(t) * r, rnd() * 0.42, Math.sin(t) * r], i * 3); dustSeed.push(rnd() * 100); }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(a, 3));
}
const dustM = new THREE.PointsMaterial({ size: 0.006, map: softDot, color: new THREE.Color(1, 0.85, 0.6), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
lamp.add(new THREE.Points(dustGeo, dustM));

// маленькое растение (пилея: круглые листья на тонких черешках)
{
  let seed = 3; const rr = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); };
  B.group([0.75, TOP, -1.75], [0, 0, 0], () => {
    B.add(Geo.lathe([[0, 0], [0.055, 0], [0.068, 0.09], [0.076, 0.095], [0.076, 0.115], [0.064, 0.115], [0, 0.105]], 24), P.terra, { ow: 1 });
    B.add(Geo.cyl(0.064, 0.064, 0.005, 20), '#7a4b32', { p: [0, 0.108, 0], ow: 0 });
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + rr(-0.3, 0.3), h = rr(0.14, 0.24), out = rr(0.04, 0.11);
      const tip = new THREE.Vector3(Math.cos(a) * out, 0.11 + h, Math.sin(a) * out);
      B.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(tip.x * 0.2, 0.11 + h * 0.8, tip.z * 0.2), tip), 8, 0.0035, 5), P.leafD, { ow: 0 });
      const r = rr(0.035, 0.05);
      B.add(Geo.cyl(r, r * 0.95, 0.008, 18).translate(0, 0, r * 0.7), [P.leaf, P.leafL, P.leafD][i % 3], { p: [tip.x, tip.y, tip.z], r: [rr(0.35, 0.8), -a + Math.PI / 2, 0, 'YXZ'], ow: 0.7 });
    }
  });
}

// кружка с паром
const MUG = V(0.36, TOP, -1.16);
B.group([MUG.x, TOP, MUG.z], [0, -0.45, 0], () => {
  B.add(Geo.lathe([[0, 0], [0.046, 0], [0.052, 0.008], [0.052, 0.1], [0.045, 0.1], [0.044, 0.094], [0.044, 0.012], [0, 0.012]], 28), P.pink, { ow: 1 });
  B.add(new THREE.TorusGeometry(0.029, 0.01, 8, 16, Math.PI).rotateZ(-Math.PI / 2), P.pink, { p: [0.052, 0.052, 0], ow: 0.8 });
  B.add(Geo.cyl(0.044, 0.044, 0.004, 24), '#8d5a3b', { p: [0, 0.084, 0], ow: 0 });
  B.add(Geo.heart(0.022, 0.004), P.white, { p: [Math.sin(0.45) * 0.051, 0.05, Math.cos(0.45) * 0.051], r: [0, 0.45, 0], ow: 0.5 });
});
const steam = (() => {
  const gs = [];
  for (let k = 0; k < 2; k++) {
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 6 + k * 2.5) * 0.012 * (0.4 + t) + (k - 0.5) * 0.036, t * (0.11 + k * 0.03), Math.cos(t * 5 + k * 2) * 0.008)); }
    gs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0045 - k * 0.001, 6));
  }
  const m = new THREE.Mesh(mergeGeometries(gs), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, depthWrite: false }));
  m.position.set(MUG.x, TOP + 0.11, MUG.z); m.userData.noAO = true; scene.add(m);
  return m;
})();

// лоток для прочитанных записок
const TRAY = { x: 0.72, z: -1.25, w: 0.27, d: 0.33, rot: 0.08 };
B.group([TRAY.x, TOP, TRAY.z], [0, TRAY.rot, 0], () => {
  B.add(Geo.rbox(TRAY.w, 0.012, TRAY.d, 0.005), P.lav, { p: [0, 0.006, 0], ow: 0.8 });
  for (const [w, d, x, z] of [[TRAY.w, 0.014, 0, TRAY.d / 2 - 0.007], [TRAY.w, 0.014, 0, -TRAY.d / 2 + 0.007], [0.014, TRAY.d, TRAY.w / 2 - 0.007, 0], [0.014, TRAY.d, -TRAY.w / 2 + 0.007, 0]]) B.add(Geo.rbox(w, 0.04, d, 0.006), P.lav, { p: [x, 0.02, z], ow: 0.8 });
});

// ноутбук: части — настоящие меши в группе laptop (на неё завязаны клик и полёт камеры к экрану)
const laptop = new THREE.Group(); laptop.position.set(-0.08, TOP, -1.58); scene.add(laptop);
const shellM = M('#e9dfee'), plumM = M(P.plum);
outlineOf(add(Geo.rbox(0.62, 0.02, 0.42, 0.008), shellM, 0, 0.01, 0, laptop), 0.8);
add(Geo.rbox(0.56, 0.003, 0.2, 0.0015), plumM, 0, 0.0205, -0.05, laptop);
{
  const keys = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) keys.push(new THREE.BoxGeometry(0.031, 0.004, 0.031).translate(-0.247 + c * 0.038, 0.023, -0.13 + r * 0.038));
  add(mergeGeometries(keys), M('#f5eef8'), 0, 0, 0, laptop);
}
add(Geo.rbox(0.18, 0.002, 0.1, 0.001), M('#d8cbe0'), 0, 0.0205, 0.13, laptop);
const lid = new THREE.Group(); lid.position.set(0, 0.02, -0.205); lid.rotation.x = -0.22; laptop.add(lid);
outlineOf(add(Geo.rbox(0.62, 0.4, 0.014, 0.008), shellM, 0, 0.2, 0, lid), 0.8);
add(Geo.rbox(0.6, 0.38, 0.002, 0.001), plumM, 0, 0.2, 0.0068, lid);
const screenTex = canvasTex(2048, 1280, (x, w, h) => {
  x.scale(2, 2); w /= 2; h /= 2; // экран вблизи: вдвое чётче
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fbd3dd'); g.addColorStop(1, '#f2a5bc');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.35)';
  for (const [cx, cy, k] of [[130, 520, 1.3], [880, 130, 1], [900, 540, 0.8]]) { blob(x, cx, cy, 50 * k); blob(x, cx + 50 * k, cy + 10 * k, 40 * k); blob(x, cx - 48 * k, cy + 12 * k, 34 * k); }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,255,255,.85)'; x.font = '700 30px Nunito, sans-serif'; x.fillText('♥ Наш дом', w / 2, 70);
  x.fillStyle = '#b13f66'; x.font = '700 120px Caveat'; x.fillText(daysLabel(), w / 2, h / 2 - 10);
  x.fillStyle = '#7a3a55'; x.font = '700 50px Caveat'; x.fillText('нажми, чтобы войти', w / 2, h / 2 + 85);
  x.fillStyle = '#e05d84'; heartPath(x, w / 2, h - 90, 30); x.fill();
});
const screen = add(new THREE.PlaneGeometry(0.58, 0.36), new THREE.MeshBasicMaterial({ map: screenTex }), 0, 0.205, 0.0086, lid);
screen.castShadow = false;
const glow = new THREE.PointLight('#ffc8dc', 0.15, 1.4, 2);
glow.position.set(-0.08, TOP + 0.25, -1.2);
scene.add(glow);
laptop.userData.act = () => goScreen();
clickables.push(laptop);

// мягкие пятна-тени под предметами (как в Animal Crossing) и ореолы ламп — одной сеткой каждое
scene.add(blobs([
  [-0.72, TOP + 0.001, -1.68, 0.13, 0.11, 0.6], [-0.08, TOP + 0.001, -1.58, 0.36, 0.25, 0.45], [MUG.x, TOP + 0.001, MUG.z, 0.075, 0.07, 0.6],
  [0.75, TOP + 0.001, -1.75, 0.1, 0.09, 0.6], [TRAY.x, TOP + 0.001, TRAY.z, 0.17, 0.2, 0.45],
  [1.75, 0.002, -1.55, 0.32, 0.32, 0.65], [-1.95, 0.002, -0.75, 0.55, 0.55, 0.55], [1.5, 0.002, -0.6, 0.22, 0.22, 0.6],
]));
const glowMesh = halos(glowSpots, uT, uLights); scene.add(glowMesh);
B.finish();

// котики
// неоткрытый подарок — коробка у получателя; открытый — вещь в его коробке «расставить»
const decor = createDecor({ THREE, scene, clickables, TOP, M, rbox, add, floatAt });
function syncDecor() {
  const rows = store.ledger(), me = store.me().id;
  const boxes = rows.filter((r) => r.reason === 'gift' && !r.opened && r.to_user === me).map((r) => ({ id: String(r.id), item: r.item, from: store.nameOf(r.user_id), note: r.note, row: r.id }));
  decor.show(boxes, (b) => {
    const it = ITEM[b.item];
    sfx.pop();
    toast(`${b.from} дарит тебе: ${it?.emoji || '🎁'} ${it?.title || 'подарок'}${b.note ? ` — «${b.note}»` : ''} · поставь его куда хочешь: «расставить»`, 7000);
    store.openGift(b.row).catch(console.warn);
  });
}
syncDecor();
store.onLedger(syncDecor);
store.onPeople(syncDecor);
let placer = null; // режим «расставить», создаётся ниже
toonify(scene); renderer.compileAsync(scene, camera).catch(() => {}); performance.mark('lr:kick', { detail: renderer.info.programs.length }); // комната готова — драйвер компилирует её шейдеры параллельно со сборкой остального
await prepareCatGeometry(); // готовое тело кота — из кеша браузера (собирать заново ~1,5 с)
const catsys = createCats({ scene, camera, TOP, floatAt,
  deskObstacles: () => [...papers.filter((p) => p.slot && !p.read).map((p) => ({ x: p.slot.x, z: p.slot.z, r: 0.045 })), ...(placer?.obstacles('desk', TOP) || [])],
  floorObstacles: () => placer?.obstacles('floor', TOP) || [] });
clickables.push(...catsys.clickables);

// ---------- время суток ----------
// час, небо верх, небо низ, цвет света (солнце/луна), сила, высота°, азимут°, лампа, огни города, звёзды, лучи, рассеянный свет
const KEYS = [
  [0, '#0e1236', '#3d2a58', '#9fb4ff', 0.55, 40, 40, 1, 1, 1, 0.14, 0.24],
  [5, '#141a45', '#5a3a66', '#9fb4ff', 0.5, 35, 40, 1, 1, 1, 0.12, 0.24],
  [6.5, '#5d74b8', '#ffb08a', '#ffa45c', 3.2, 12, 62, 0.7, 0.5, 0.25, 0.75, 0.34],
  [8.5, '#6aa4e6', '#d6e9f7', '#ffe6c2', 5.5, 26, 55, 0, 0, 0, 0.6, 0.42],
  [12.5, '#5c9be6', '#cfe5f8', '#fff3dc', 6.5, 38, 50, 0, 0, 0, 0.5, 0.46],
  [16, '#6aa0dc', '#e8e2d0', '#ffdcaa', 6, 28, 42, 0, 0, 0, 0.6, 0.44],
  [18.5, '#5a64b0', '#ff9465', '#ff8a45', 4.5, 14, 30, 0.7, 0.4, 0, 0.85, 0.4],
  [20, '#272c66', '#a25878', '#ff7a5a', 0.5, 6, 30, 1, 0.9, 0.5, 0.2, 0.28],
  [21.5, '#0e1236', '#3d2a58', '#9fb4ff', 0.55, 40, 40, 1, 1, 1, 0.14, 0.24],
  [24, '#0e1236', '#3d2a58', '#9fb4ff', 0.55, 40, 40, 1, 1, 1, 0.14, 0.24],
];
const FIXED_HOUR = new URLSearchParams(location.search).get('hour'); // ?hour=13 — посмотреть день
// погода и время — по городу из профиля (Open-Meteo); без города — часы устройства и лёгкая облачность
let WTH = fakeWeather(), FX = effects(WTH);
const hourNow = () => (FIXED_HOUR !== null ? parseFloat(FIXED_HOUR) : WTH && !WTH.fake ? roomHour(cityHour(WTH), WTH) : ((d) => d.getHours() + d.getMinutes() / 60)(new Date()));
function timeParams(h) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = (h - a[0]) / (b[0] - a[0]);
  const c = (j) => new THREE.Color(a[j]).lerp(new THREE.Color(b[j]), k);
  const n = (j) => a[j] + (b[j] - a[j]) * k;
  return { h, top: c(1), bottom: c(2), light: c(3), power: n(4), elev: n(5), az: n(6), lamp: n(7), city: n(8), stars: n(9), rays: n(10), amb: n(11), day: clamp((n(4) - 0.6) / 4.5) };
}
let TP = timeParams(hourNow());
function applyTime() {
  const tp = (TP = timeParams(hourNow()));
  const el = THREE.MathUtils.degToRad(tp.elev), az = THREE.MathUtils.degToRad(tp.az);
  sunDir.set(Math.sin(az) * Math.cos(el), -Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  sun.position.copy(sun.target.position).addScaledVector(sunDir, -9);
  sun.color.copy(tp.light); sunBase = tp.power * 0.32; // шкала тун-стиля; с учётом облаков — каждый кадр (sunShade)
  buildShafts(sunDir);
  shaftMat.uniforms.color.value.copy(tp.light).multiplyScalar(0.32);
  shaftMat.uniforms.strength.value = tp.rays; // умножается на sunShade в кадре
  sunDustBase = Math.min(1, tp.rays * 1.4) * (0.35 + tp.day * 0.65); // × sunShade в кадре
  sunDustMat.color.copy(tp.light).multiplyScalar(1.6);
  drawSky(tp, performance.now() / 1000);
  // солнце/луна в окне: днём идёт слева направо, высота от высоты солнца
  const dayK = clamp((tp.h - 6) / 14);
  const isSun = tp.day > 0.05 || (tp.h > 6 && tp.h < 20.5);
  orb.position.set(WX + (isSun ? (dayK - 0.5) * 0.7 : 0.25), 1.4 + Math.min(tp.elev, 42) / 42 * 0.65, -2.155);
  orb.material.color.copy(isSun ? new THREE.Color(1, 0.92, 0.75).multiplyScalar(7) : new THREE.Color(1, 0.96, 0.85).multiplyScalar(5));
  orb.scale.setScalar(isSun ? 1.1 : 0.8);
  orb.visible = FX.clouds < 0.9 && FX.fog < 0.5; // за тучами солнца и луны не видно
  // тун держится на полусфере: днём тёплая и яркая, ночью синевато-сиреневая; тени ночью холоднее
  hemi.color.set('#9a96e0').lerp(new THREE.Color('#fff2e2'), tp.day);
  hemi.groundColor.set('#4a3a6a').lerp(new THREE.Color('#cdb2e6'), tp.day);
  fill.color.set('#9fa6ff').lerp(new THREE.Color('#ffeedd'), tp.day);
  fill.intensity = 0.35 + 0.65 * tp.day;
  TOON.uTint.value.set(0.55 + 0.23 * tp.day, 0.5 + 0.18 * tp.day, 0.86 + 0.1 * tp.day);
  TOON.uRim.value.set(0.3, 0.26, 0.18).multiplyScalar(0.4 + 0.6 * tp.day);
  post.uniforms.uVig.value.setRGB(0.58 + 0.22 * tp.day, 0.46 + 0.22 * tp.day, 0.72 + 0.1 * tp.day);
  // пасмурный день: в комнате темнее и прохладнее, лампа включается сама — как дома в дождь
  const gloom = clamp(FX.clouds * 1.25 - 0.35) * tp.day + FX.fog * 0.3 * tp.day;
  hemiBase = (0.8 + 0.95 * tp.day) * (1 + 0.15 * FX.clouds * tp.day) * (1 - 0.22 * gloom); // в пасмурный день света «отовсюду» больше, но всё серее
  hemi.color.lerp(new THREE.Color('#dfe6f2'), gloom * 0.6);
  const L = Math.min(1, Math.max(tp.lamp, gloom * 0.75 + FX.rain * 0.25 * tp.day));
  lampLight.intensity = 0.25 + 0.75 * L;
  shadeM.emissiveIntensity = 0.22 + 0.55 * L;
  bulbM.color.setRGB(1, 0.9, 0.7).multiplyScalar(0.75 + 0.25 * L);
  uLights.value = 0.35 + 0.65 * L; // ореолы лампы, свечей и гирлянды днём еле видны
  beamM.opacity = 0.09 * L; dustM.opacity = 0.85 * L;
  beam.visible = L > 0.02; // прозрачное с нулевой видимостью всё равно стоит пикселей
  flames.forEach((f) => (f.visible = L > 0.3));
}
applyTime();
setInterval(applyTime, 30000);

// ---------- погода за окном: дождь, снег, капли на стекле, молнии, облака закрывают солнце ----------
const OUT = { x0: WX - 0.62, x1: WX + 0.62, y0: 1.1, y1: 2.4, z0: -2.15, z1: -2.03 }; // воздух за окном (стена прячет края)
function rainTexture(lean) {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), x = c.getContext('2d');
  x.lineCap = 'round';
  for (let k = 0; k < 70; k++) {
    const px = rnd() * 256, py = rnd() * 256, len = 14 + rnd() * 26;
    x.strokeStyle = `rgba(225,232,245,${0.25 + rnd() * 0.45})`; x.lineWidth = 0.8 + rnd() * 1.2;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { x.beginPath(); x.moveTo(px + dx, py + dy); x.lineTo(px + dx + lean * len, py + dy + len); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rainLayers = [[-2.13, 1.0, 1.1], [-2.06, 1.6, 0.7]].map(([z, speed, rep]) => {
  const m = new THREE.MeshBasicMaterial({ map: rainTexture(0.15), transparent: true, opacity: 0, depthWrite: false });
  m.map.repeat.set(rep * 1.3, rep * 1.3);
  const mesh = add(new THREE.PlaneGeometry(1.3, 1.4), m, WX, 1.75, z);
  mesh.castShadow = mesh.receiveShadow = false; mesh.userData.noAO = true; mesh.userData.speed = speed;
  return mesh;
});
let rainLean = 0.15;
const SNOW = 260, snowGeo = new THREE.BufferGeometry(), snowSeed = Array.from({ length: SNOW }, () => [rnd(), rnd(), rnd(), rnd() * 100, 0.6 + rnd() * 0.8]);
snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW * 3), 3));
const snowMat = new THREE.PointsMaterial({ size: 0.032, map: softDot, color: '#ffffff', transparent: true, opacity: 1, depthWrite: false });
const snowPts = new THREE.Points(snowGeo, snowMat); snowPts.frustumCulled = false; snowPts.userData.noAO = true; scene.add(snowPts);
// капли на стекле: холст поверх стекла, часть капель медленно сползает
const dropCanvas = Object.assign(document.createElement('canvas'), { width: 256, height: 284 });
const dropTex = new THREE.CanvasTexture(dropCanvas); dropTex.colorSpace = THREE.SRGBColorSpace;
const drops = add(new THREE.PlaneGeometry(0.9, 1.0), new THREE.MeshBasicMaterial({ map: dropTex, transparent: true, depthWrite: false, opacity: 0 }), 0, 0, 0.018, win);
drops.castShadow = drops.receiveShadow = false; drops.userData.noAO = true;
const beads = Array.from({ length: 90 }, () => ({ x: rnd() * 256, y: rnd() * 284, r: 1 + rnd() * 2.6, v: rnd() < 0.12 ? 8 + rnd() * 30 : 0 }));
function drawDrops(dt) {
  const x = dropCanvas.getContext('2d');
  x.clearRect(0, 0, 256, 284);
  for (const b of beads) {
    if (b.v) {
      b.y += b.v * dt;
      if (b.y > 290) { b.y = -5; b.x = rnd() * 256; }
      x.fillStyle = 'rgba(220,230,245,.18)'; x.fillRect(b.x - 0.6, b.y - 18, 1.2, 18);
    }
    const g = x.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(200,212,230,.35)'); g.addColorStop(1, 'rgba(60,70,90,.45)');
    x.fillStyle = g; x.beginPath(); x.arc(b.x, b.y, b.r, 0, 7); x.fill();
  }
  dropTex.needsUpdate = true;
}
// облака то закрывают солнце, то открывают: лучи плавно гаснут и разгораются
function sunShade(s) {
  const c = FX.clouds;
  if (c >= 0.92) return 0.04;
  const t = 0.5 + 0.3 * Math.sin(s * 0.037) + 0.2 * Math.sin(s * 0.091 + 1.7);
  return Math.max(0.04, THREE.MathUtils.smoothstep(t, c - 0.15, c + 0.15)) * (1 - 0.7 * FX.fog);
}
let skyAt = 0, dropAt = 0, boltAt = 4;
const COOL = new THREE.Color('#c4d4ff');
function weatherFrame(dt, s) {
  const shade = sunShade(s);
  // молния бьёт через окно холодным светом — и лучи на миг вспыхивают
  sun.intensity = sunBase * shade + flash * 3;
  sun.color.copy(TP.light).lerp(COOL, Math.min(1, flash * 1.5));
  shaftMat.uniforms.strength.value = TP.rays * shade;
  sunDustMat.opacity = sunDustBase * shade; sunDust.visible = sunDustMat.opacity > 0.01;
  // молния: двойная вспышка, гром через пару секунд
  if (FX.storm && s > boltAt) {
    flash = 1; boltAt = s + 6 + rnd() * 14;
    setTimeout(() => { flash = Math.max(flash, 0.8); }, 140);
    setTimeout(() => sfx.thunder(0.5 + rnd() * 0.5), 600 + rnd() * 2200);
  }
  flash = Math.max(0, flash - dt * 2.6);
  hemi.intensity = hemiBase + flash * 1.2;
  post.uniforms.uFlash.value = flash * 0.35;
  if (s - skyAt > 0.12 || flash > 0) { skyAt = s; drawSky(TP, s); } // облака плывут
  // дождь: два слоя косых штрихов, ближний быстрее; наклон — по ветру
  const lean = 0.08 + FX.wind * 0.5;
  if (FX.rain > 0 && Math.abs(lean - rainLean) > 0.05) { rainLean = lean; for (const l of rainLayers) { l.material.map.dispose(); l.material.map = rainTexture(lean); l.material.map.repeat.set(1.4, 1.4); } }
  for (const l of rainLayers) {
    l.material.opacity = damp(l.material.opacity, FX.rain * (0.55 + 0.35 * TP.day) + flash * 0.3 * FX.rain, 1, dt);
    l.visible = l.material.opacity > 0.01;
    if (l.visible) { l.material.map.offset.y += dt * l.userData.speed * (1 + FX.rain); l.material.map.offset.x -= dt * l.userData.speed * rainLean * 0.6; }
  }
  // снег: медленно, с покачиванием
  const nS = Math.round(SNOW * FX.snow);
  snowPts.visible = nS > 0;
  if (nS) {
    const p = snowGeo.attributes.position, span = OUT.y1 - OUT.y0;
    for (let i = 0; i < nS; i++) {
      const [a, b, c, k, sp] = snowSeed[i];
      p.setXYZ(i, OUT.x0 + a * (OUT.x1 - OUT.x0) + Math.sin(s * 0.8 + k) * 0.03, OUT.y1 - ((b + s * 0.07 * sp) % 1) * span, OUT.z0 + c * (OUT.z1 - OUT.z0));
    }
    snowGeo.setDrawRange(0, nS); p.needsUpdate = true;
    snowMat.color.setScalar(0.55 + 0.45 * TP.day);
  }
  // капли на стекле — когда дождь
  drops.material.opacity = damp(drops.material.opacity, FX.rain > 0 ? 0.55 + FX.rain * 0.4 : 0, 0.5, dt); drops.visible = drops.material.opacity > 0.01;
  if (drops.material.opacity > 0.02 && s - dropAt > 0.08) { drawDrops(Math.min(0.08, s - dropAt)); dropAt = s; }
}

// погода по городу из профиля: раз в 15 минут, с кешем в браузере
const wxPill = document.getElementById('wx');
function drawWxPill() {
  if (!wxPill) return;
  const city = store.me()?.city;
  if (WTH?.fake) { const [e, t] = wxLabel(WTH); wxPill.textContent = `${e} ${t}`; return; }
  if (!city?.name) { wxPill.textContent = '📍 твой город'; wxPill.title = 'укажи город в профиле — и за окном будет твоя погода'; return; }
  const [e, t] = wxLabel(WTH);
  wxPill.textContent = WTH ? `${e} ${WTH.temp > 0 ? '+' : ''}${WTH.temp}° · ${city.name}` : `📍 ${city.name}`;
  wxPill.title = WTH ? `${city.name}: ${t}` : 'погода не загрузилась';
}
let wxKey = '';
async function loadWeather() {
  if (fakeWeather()) return applyWeather();
  const city = store.me()?.city;
  wxKey = city?.lat != null ? `${city.lat},${city.lon}` : '';
  if (!wxKey) { WTH = null; FX = effects(null); return applyWeather(); }
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('lr:wx')); } catch {}
  if (cached?.key === wxKey && Date.now() - cached.w.at < 15 * 60e3) WTH = cached.w;
  else {
    try {
      WTH = await fetchWeather(city);
      try { localStorage.setItem('lr:wx', JSON.stringify({ key: wxKey, w: WTH })); } catch {}
    } catch (e) { console.warn('погода не загрузилась', e); }
  }
  FX = effects(WTH);
  applyWeather();
}
function applyWeather() { applyTime(); sfx.setRain(FX.rain); drawWxPill(); }
loadWeather();
setInterval(loadWeather, 15 * 60e3);
store.onPeople(() => {
  const c = store.me()?.city;
  if ((c?.lat != null ? `${c.lat},${c.lon}` : '') !== wxKey) loadWeather(); else drawWxPill();
});
if (wxPill) wxPill.onclick = () => { if (state === 'room') goScreen('profile'); };

// ---------- записки: 3D-бумага, которая комкается и разворачивается ----------
const W = 0.21, H = 0.28, SEG = 56, R = 0.042;
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function paperGeometry(seed) {
  const g = new THREE.PlaneGeometry(W, H, SEG, Math.round(SEG * H / W));
  const pos = g.attributes.position, n = pos.count;
  const sheet = new Float32Array(n * 3);
  const r = rand(seed), unit = () => V(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
  const creases = Array.from({ length: 8 }, () => { const a = r() * Math.PI; return { x: Math.cos(a), y: Math.sin(a), f: 6 + r() * 10, p: r() * 6.3 }; });
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    let z = 0; for (const k of creases) z += Math.abs(Math.sin((x / W * k.x + y / H * k.y) * k.f + k.p)) - 0.63;
    sheet.set([x, y, z * 0.0035], i * 3);
  }
  // комок: лист честно складывается по случайным линиям сгиба; из пяти попыток берём самую круглую
  const v = V(), c = V();
  const centre = (b) => { c.set(0, 0, 0); for (let i = 0; i < n; i++) { c.x += b[i * 3]; c.y += b[i * 3 + 1]; c.z += b[i * 3 + 2]; } return c.multiplyScalar(1 / n); };
  function fold() {
    const b = Float32Array.from(sheet);
    for (let k = 0; k < 6; k++) {
      centre(b).add(unit().multiplyScalar(0.012 * r()));
      const axis = unit(), normal = unit().cross(axis).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (r() < 0.5 ? -1 : 1) * (2.1 + r() * 0.7));
      // то же, что v.sub(c) → dot → applyQuaternion → add(c), только без вызовов на каждую из 4332 вершин (×30 на записку)
      const { x: qx, y: qy, z: qz, w: qw } = q, { x: nx, y: ny, z: nz } = normal, { x: cx, y: cy, z: cz } = c;
      for (let j = 0; j < n * 3; j += 3) {
        const vx = b[j] - cx, vy = b[j + 1] - cy, vz = b[j + 2] - cz;
        if (vx * nx + vy * ny + vz * nz <= 0) continue;
        const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
        b[j] = vx + qw * tx + qy * tz - qz * ty + cx;
        b[j + 1] = vy + qw * ty + qz * tx - qx * tz + cy;
        b[j + 2] = vz + qw * tz + qx * ty - qy * tx + cz;
      }
    }
    centre(b);
    const lens = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 3) { const dx = b[j] - c.x, dy = b[j + 1] - c.y, dz = b[j + 2] - c.z; lens[i] = Math.sqrt(dx * dx + dy * dy + dz * dz); }
    const sorted = Float32Array.from(lens).sort();
    return { b, c: c.clone(), p50: sorted[Math.floor(n * 0.5)], p90: sorted[Math.floor(n * 0.9)], max: sorted[n - 1] };
  }
  let best = null;
  for (let t = 0; t < 5; t++) {
    const f = fold(); f.score = f.p90 / f.p50 + 0.3 * (f.max / f.p90);
    if (!best || f.score < best.score) best = f;
  }
  const ball = best.b;
  for (let i = 0; i < n; i++) {
    v.fromArray(ball, i * 3).sub(best.c).multiplyScalar(R / best.p90);
    const len = v.length();
    // сжатие в ладони: всё тянется к шару, крупные сгибы остаются, мелкие края прячутся
    if (len > 1e-5) v.multiplyScalar((len + (R * 0.92 - len) * 0.5) / len);
    v.toArray(ball, i * 3);
  }
  return { g, ball, sheet };
}

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}

function noteTex(note) {
  let ctx;
  const tex = canvasTex(PAPER.w, PAPER.h, (x, w, h) => {
    ctx = x;
    x.drawImage(paperImage(), 0, 0, w, h); // бумага с крапом — одна на все записки (6000 точек на каждую стоили ~50 мс)
    x.fillStyle = '#2b3a67'; x.font = '700 58px Caveat';
    if (note.text) wrap(x, note.text, w - 170).slice(0, 12).forEach((l, i) => x.fillText(l, PAPER.textX, 162 + i * PAPER.step));
    x.font = '500 44px Caveat'; x.textAlign = 'right'; x.fillStyle = '#7a4a63';
    x.fillText(`— ${note.from}, ${new Date(note.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}  ♥`, w - 50, h - 50);
  });
  if (note.drawing) {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, PAPER.w, PAPER.h); tex.needsUpdate = true; };
    img.src = note.drawing;
  }
  return tex;
}

// записка отвечает лучу габаритом: комок и лист в коробку вписываются, а 8400 треугольников каждой записки стоили 1–3 мс на луч
const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _hit = new THREE.Vector3();
function boxRaycast(raycaster, out) {
  const g = this.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  _inv.copy(this.matrixWorld).invert(); _ray.copy(raycaster.ray).applyMatrix4(_inv);
  if (!_ray.intersectBox(g.boundingBox, _hit)) return;
  _hit.applyMatrix4(this.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(_hit);
  if (distance >= raycaster.near && distance <= raycaster.far) out.push({ distance, point: _hit.clone(), object: this });
}

class Paper {
  constructor(note, seed, key) {
    Object.assign(this, paperGeometry(seed));
    this.note = note; this.key = key;
    this.mesh = new THREE.Mesh(this.g, toon({ map: noteTex(note), side: THREE.DoubleSide }));
    this.mesh.userData.liveGeo = true; // лист комкается каждый кадр — обводка идёт по той же геометрии
    this.mesh.castShadow = true;
    this.mesh.userData.act = () => openNote(this);
    this.mesh.raycast = boxRaycast;
    this.setT(0);
    scene.add(this.mesh);
  }
  setT(t, flat = 1) { // 0 — комок, 1 — развёрнутый лист; flat < 1 — разглаженный в стопке
    // развёрнутый лист: «разглаженность» — просто масштаб по z (нормали поправит normalMatrix), геометрию не трогаем;
    // раньше пересчёт вершин и нормалей двух листов каждый кадр давал рывки при листании стопки
    if (t === 1) { if (this.t !== 1) this.morph(1); if (this.mesh) this.mesh.scale.z = flat; return; }
    if (this.mesh) this.mesh.scale.z = 1;
    this.morph(t);
  }
  morph(t) {
    this.t = t;
    const a = this.g.attributes.position.array, b = this.ball, s = this.sheet;
    for (let i = 0; i < a.length; i++) a[i] = b[i] + (s[i] - b[i]) * t;
    this.g.attributes.position.needsUpdate = true;
    // комок — плоские грани (острые сгибы), лист — гладкий, без сетки треугольников
    const m = this.mesh?.material, faceted = t < 0.6;
    if (m && m.flatShading !== faceted) { m.flatShading = faceted; m.needsUpdate = true; }
    if (!faceted) this.g.computeVertexNormals();
    this.g.computeBoundingSphere();
    this.g.boundingBox = null; // габарит для луча пересчитается при следующей проверке
  }
}

const SLOTS = [[-0.62, -1.2], [-0.46, -1.17], [-0.78, -1.24], [-0.32, -1.24], [-0.52, -1.32], [-0.7, -1.36]];
const papers = [];
const readKeys = new Set(store.all('read').map((r) => r.id));
let freeSlot = 0, stackCount = 0;
function slotFor(i) {
  if (i < SLOTS.length) return V(SLOTS[i][0], TOP + R * 0.85, SLOTS[i][1]);
  const r = rand(i * 977 + 13);
  return V(-0.85 + r() * 1.0, TOP + R * 0.85, -1.16 - r() * 0.18);
}
function stackPose(i) {
  const r = rand(i * 131 + 7);
  return {
    pos: V(TRAY.x + (r() - 0.5) * 0.02, TOP + 0.016 + i * 0.0042, TRAY.z + (r() - 0.5) * 0.02),
    rot: new THREE.Euler(-Math.PI / 2, 0, -TRAY.rot + (r() - 0.5) * 0.25),
  };
}
function addPaper(note, key, place = true) {
  const p = new Paper(note, (papers.length + 1) * 7919, key);
  papers.push(p);
  if (!place) return p;
  if (readKeys.has(key)) {
    p.read = true; p.stack = stackCount++;
    const sp = stackPose(p.stack); p.slot = sp.pos; p.rest = sp.rot; p.setT(1, 0.45);
  } else if (note.pos) { p.slot = V(...note.pos); p.rest = new THREE.Euler(...note.rot); }
  else { const i = freeSlot++; p.slot = slotFor(i); p.rest = new THREE.Euler(i * 1.7, i * 2.3, i * 0.9); }
  p.mesh.position.copy(p.slot);
  p.mesh.rotation.copy(p.rest);
  clickables.push(p.mesh);
  return p;
}
const trashed = new Set(store.all('trash').map((t) => t.id));
DATA.notes.forEach((n, i) => { if (!trashed.has('seed' + i)) addPaper(n, 'seed' + i); });
store.all('notes').filter((n) => n.id !== 'undefined' && n.date && !trashed.has(n.id)).sort((a, b) => a.date.localeCompare(b.date)).forEach((n) => addPaper(n, n.id));
// записка от партнёра появляется на столе сразу
store.on('notes', (id, n) => { if (n && !papers.some((p) => p.key === id)) { addPaper(n, id); sfx.pop(); } });

// ---------- анимации ----------
const tweens = new Set();
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const tween = (ms, fn) => new Promise((res) => tweens.add({ t0: performance.now(), ms, fn, res }));

let state = 'room', openPaper = null, paused = false;
const setBusy = (on) => body.classList.toggle('busy', on);

function frontOfCamera(height, width) {
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
  const dist = Math.max(height / (tan * 0.8), width / (tan * camera.aspect * 0.86));
  return camera.position.clone().addScaledVector(camera.getWorldDirection(V()), dist);
}

async function openNote(p) {
  state = 'busy'; setBusy(true);
  const p0 = p.mesh.position.clone(), q0 = p.mesh.quaternion.clone(), to = frontOfCamera(H, W), wasRead = p.read;
  setTimeout(() => (wasRead ? sfx.crumple(0.25) : sfx.unfold(1.1)), 250);
  await tween(1500, (k) => {
    const e = ease(k);
    p.mesh.position.lerpVectors(p0, to, e);
    p.mesh.position.y += Math.sin(e * Math.PI) * 0.12;
    p.mesh.quaternion.slerpQuaternions(q0, camera.quaternion, e);
    if (wasRead) p.setT(1, 0.45 + 0.55 * e); else p.setT(ease(clamp((k - 0.2) / 0.8)));
    noteLight.intensity = 0.9 * e;
  });
  state = 'note'; openPaper = p; trashBtn.hidden = false;
  tip(wasRead ? 'листай стрелками, нажми — положу обратно' : 'нажми ещё раз — положу в стопку прочитанных');
  showNoteNav();
}

// стопка прочитанных: листать ‹ › прямо в руках
const noteNav = document.getElementById('noteNav');
const readStack = () => papers.filter((q) => q.read).sort((a, b) => b.stack - a.stack); // сверху — последняя
function showNoteNav() {
  const list = readStack(), i = list.indexOf(openPaper);
  noteNav.hidden = !(openPaper?.read && list.length > 1);
  if (!noteNav.hidden) noteNav.querySelector('span').textContent = `${i + 1} / ${list.length}`;
}
async function flipNote(dir) {
  if (state !== 'note' || !openPaper?.read) return;
  const list = readStack(), cur = openPaper, next = list[(list.indexOf(cur) + dir + list.length) % list.length];
  if (!next || next === cur) return;
  state = 'busy'; noteNav.hidden = true; sfx.unfold(0.35);
  const to = frontOfCamera(H, W), side = V(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(dir * 0.35);
  const c0 = cur.mesh.position.clone(), cq = cur.mesh.quaternion.clone(), cq1 = new THREE.Quaternion().setFromEuler(cur.rest);
  const n0 = next.mesh.position.clone(), nq = next.mesh.quaternion.clone();
  await tween(700, (k) => {
    const e = ease(k);
    // текущий лист уезжает в сторону и ложится в лоток, следующий поднимается
    cur.mesh.position.lerpVectors(c0.clone().addScaledVector(side, -Math.sin(e * Math.PI) * 0.6), cur.slot, e);
    cur.mesh.quaternion.slerpQuaternions(cq, cq1, e); cur.setT(1, 1 - 0.55 * e);
    next.mesh.position.lerpVectors(n0, to, e); next.mesh.position.y += Math.sin(e * Math.PI) * 0.06;
    next.mesh.quaternion.slerpQuaternions(nq, camera.quaternion, e); next.setT(1, 0.45 + 0.55 * e);
  });
  openPaper = next; state = 'note'; showNoteNav();
}
noteNav.querySelector('.prev').onclick = () => flipNote(-1);
noteNav.querySelector('.next').onclick = () => flipNote(1);
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') flipNote(1); if (e.key === 'ArrowLeft') flipNote(-1); });

// прочитанная записка не комкается обратно, а ложится разглаженной в лоток
async function closeNote() {
  const p = openPaper; openPaper = null; state = 'busy'; noteNav.hidden = true; trashBtn.hidden = true;
  if (!p.read) {
    p.read = true; p.stack = stackCount++;
    readKeys.add(p.key); store.put('read', p.key, { at: Date.now() }).catch(console.warn);
    const sp = stackPose(p.stack); p.slot = sp.pos; p.rest = sp.rot;
  }
  sfx.unfold(0.4);
  const p0 = p.mesh.position.clone(), q0 = p.mesh.quaternion.clone(), q1 = new THREE.Quaternion().setFromEuler(p.rest);
  await tween(1200, (k) => {
    const e = ease(k);
    p.setT(1, 1 - 0.55 * e);
    noteLight.intensity = 0.9 * (1 - e);
    p.mesh.position.lerpVectors(p0, p.slot, e);
    p.mesh.position.y += Math.sin(e * Math.PI) * 0.08;
    p.mesh.quaternion.slerpQuaternions(q0, q1, e);
  });
  state = idle(); setBusy(false); tip();
}

async function goScreen(app) {
  state = 'busy'; setBusy(true);
  sfx.click();
  const c = screen.getWorldPosition(V());
  const n = V(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
  const to = c.clone().addScaledVector(n, Math.max(0.36 / tan, 0.58 / (tan * camera.aspect)) * 0.97);
  const p0 = cam.pos.clone(), l0 = cam.look.clone();
  await tween(1500, (k) => { const e = ease(k); cam.pos.lerpVectors(p0, to, e); cam.look.lerpVectors(l0, c, e); });
  sfx.chime();
  let closed = false; // закрыли быстрее 0,6 с — таймер паузы не должен заморозить обратный полёт
  openDesktop(app, async () => {
    closed = true;
    sfx.shutdown();
    paused = false;
    const p1 = cam.pos.clone(), l1 = cam.look.clone();
    const v = view(); // открыли со стола — туда и вернёмся
    await tween(1300, (k) => { const e = ease(k); cam.pos.lerpVectors(p1, v.pos, e); cam.look.lerpVectors(l1, v.look, e); });
    state = idle(); setBusy(false);
  });
  setTimeout(() => { if (state === 'busy' && !closed) paused = true; }, 600); // рабочий стол перекрыл сцену — не рисуем зря
}

async function openShelfAlbum(album) {
  state = 'busy'; setBusy(true); bookLabel.hidden = true;
  const a = album || (await createAlbum());
  let closed = false;
  openAlbum(a, {
    edit: !album,
    onClose: () => { closed = true; paused = false; state = idle(); setBusy(false); hoveredBook = null; buildShelf(); },
  });
  setTimeout(() => { if (state === 'busy' && !closed) paused = true; }, 450);
}

// ---------- бросок записки: оттянуть и отпустить; со стола не падает ----------
const G = -6;
const DESK = { x0: -0.95, x1: 0.95, z0: -1.9, z1: -1.1 };
const LAPTOP = { x0: -0.39, x1: 0.23, z0: -1.79, z1: -1.37 };
const TRAY_R = { x0: TRAY.x - TRAY.w / 2, x1: TRAY.x + TRAY.w / 2, z0: TRAY.z - TRAY.d / 2, z1: TRAY.z + TRAY.d / 2 };
const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const surfaceAt = (x, z) => (!inRect(DESK, x, z) ? 0 : inRect(LAPTOP, x, z) ? TOP + 0.02 : inRect(TRAY_R, x, z) ? TOP + 0.016 + stackCount * 0.0042 : TOP);
const OBST = [{ x: -0.72, z: -1.68, r: 0.1 }, { x: 0.75, z: -1.75, r: 0.09 }, { x: MUG.x, z: MUG.z, r: 0.05 }].map((o) => ({ ...o, y: TOP + R * 0.85 }));
const LIM = { x0: DESK.x0 + R, x1: DESK.x1 - R, z0: DESK.z0 + R, z1: DESK.z1 - R };

const dotGeo = new THREE.BufferGeometry();
dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: 0.028, map: softDot, color: '#ffe4ec', transparent: true, opacity: 0.95, depthWrite: false }));
dots.visible = false; dots.frustumCulled = false; scene.add(dots);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 40), new THREE.MeshBasicMaterial({ color: '#ff8fab', transparent: true, opacity: 0.85, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.userData.noAO = true; scene.add(ring);

// ---------- мусорка под столом: бросок записки; попал — +3 ♥, мимо — комок сам перепрыгивает в корзину ----------
const BIN = { x: 1.25, z: -1.45, r: 0.125, h: 0.3 }; // сбоку от стола: дуга к корзине не задевает столешницу
const bin = new THREE.Group(); bin.position.set(BIN.x, 0, BIN.z); scene.add(bin);
{
  const wicker = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#d6ad7f'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(110,70,40,.45)'; x.lineWidth = 3;
    for (let i = 0; i <= w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
    x.strokeStyle = 'rgba(110,70,40,.28)'; x.lineWidth = 2;
    for (let j = 6; j < h; j += 12) { x.beginPath(); x.moveTo(0, j); for (let i = 0; i <= w; i += 16) x.lineTo(i, j + ((i / 16) % 2 ? 3 : -3)); x.stroke(); }
  }, [3, 1]);
  const side = add(new THREE.CylinderGeometry(BIN.r, BIN.r * 0.8, BIN.h, 28, 1, true), M('#ffffff', { map: wicker, side: THREE.DoubleSide }), 0, BIN.h / 2, 0, bin);
  outlineOf(side, 0.6);
  add(new THREE.CircleGeometry(BIN.r * 0.8, 24), M('#b98a5e'), 0, 0.004, 0, bin).rotation.x = -Math.PI / 2;
  outlineOf(add(new THREE.TorusGeometry(BIN.r, 0.009, 8, 32), M('#b98a5e'), 0, BIN.h, 0, bin), 0.5).parent.rotation.x = Math.PI / 2;
}
const binTop = V(BIN.x, BIN.h, BIN.z);

let aim = null, fly = null;
const camBasis = () => ({ right: V(1, 0, 0).applyQuaternion(camera.quaternion), up: V(0, 1, 0).applyQuaternion(camera.quaternion), fwd: camera.getWorldDirection(V()) });
function holdPos() { const b = camBasis(); return camera.position.clone().addScaledVector(b.fwd, 0.5).addScaledVector(b.up, -0.13); }
function onDesk(x, z) { return V(clamp(x, LIM.x0 + 0.03, LIM.x1 - 0.03), 0, clamp(z, LIM.z0 + 0.03, LIM.z1 - 0.03)); }
function aimTarget(pull, side) {
  const t = onDesk(-side * 0.95, -1.15 - pull * 0.72);
  t.y = surfaceAt(t.x, t.z) + R * 0.85;
  return t;
}
const flightTime = (pull) => 0.55 + pull * 0.35;
const flightVel = (a, b, T) => V((b.x - a.x) / T, (b.y - a.y) / T - 0.5 * G * T, (b.z - a.z) / T);

async function throwNew(note) {
  state = 'busy'; setBusy(true);
  const p = addPaper(note, note.id, false);
  const from = frontOfCamera(H, W), hold = holdPos();
  p.mesh.position.copy(from); p.mesh.quaternion.copy(camera.quaternion); p.setT(1); noteLight.intensity = 0.9;
  await tween(700, () => {});
  sfx.crumple(0.9);
  await tween(1000, (k) => { const e = ease(k); p.setT(1 - e); p.mesh.position.lerpVectors(from, hold, e); noteLight.intensity = 0.9 - 0.4 * e; });
  aim = { p, hold, pull: 0, side: 0, drag: null };
  state = 'aim'; setBusy(false); body.classList.add('aim');
  tip('оттяни комок вниз и отпусти — бросок!');
}

// к мусорке: оттяжка — дальность (точно в корзину около 0,7), в сторону — отклонение; виден только начальный кусок дуги
function binTarget(pull, side) {
  const from = holdPos(), dir = V(BIN.x - from.x, 0, BIN.z - from.z), len = dir.length(); dir.normalize();
  const k = len * (0.35 + pull * 0.93), lat = V(-dir.z, 0, dir.x).multiplyScalar(side * 0.6);
  return V(from.x + dir.x * k + lat.x, BIN.h + R * 0.85, from.z + dir.z * k + lat.z); // дуга проходит через плоскость края корзины
}
function updateAim() {
  const { p, hold, pull, side } = aim, b = camBasis();
  p.mesh.position.copy(hold).addScaledVector(b.up, -pull * 0.05).addScaledVector(b.fwd, -pull * 0.06).addScaledVector(b.right, side * 0.04);
  const show = pull > 0.06;
  dots.visible = ring.visible = show;
  if (!show) return;
  const from = p.mesh.position, to = aim.bin ? binTarget(pull, side) : aimTarget(pull, side), T = flightTime(pull) + (aim.bin ? 0.25 : 0), v = flightVel(from, to, T);
  const a = dotGeo.attributes.position, shown = aim.bin ? 6 : 18; // к мусорке — только начало дуги: попадание не гарантировано
  for (let i = 0; i < 18; i++) {
    const t = (T * (Math.min(i, shown - 1) + 1)) / 19;
    a.setXYZ(i, from.x + v.x * t, from.y + v.y * t + 0.5 * G * t * t, from.z + v.z * t);
  }
  a.needsUpdate = true;
  ring.position.set(to.x, to.y - R * 0.85 + 0.004, to.z);
  ring.visible = !aim.bin;
}

function launch() {
  const { p, pull, side, bin: toBin } = aim; aim = null;
  dots.visible = ring.visible = false;
  body.classList.remove('aim', 'drag');
  if (toBin) { // рука дрожит сильнее, плюс сквозняк — каждый бросок немного свой
    const to = binTarget(pull, side), wind = (rnd() - 0.5) * 0.22;
    to.x += (rnd() - 0.5) * 0.16 + wind; to.z += (rnd() - 0.5) * 0.16;
    const v = flightVel(p.mesh.position, to, flightTime(pull) + 0.25).multiplyScalar(0.94 + rnd() * 0.12); // к мусорке — дуга выше, как бросок в кольцо
    fly = { p, v, spin: V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), w: 8 + rnd() * 6, t: 0, catHit: false, bin: true };
    state = 'fly'; setBusy(true); sfx.whoosh();
    tween(500, (k) => { noteLight.intensity = 0.5 * (1 - k); });
    return;
  }
  const base = aimTarget(pull, side);
  const to = onDesk(base.x + (rnd() - 0.5) * 0.2, base.z + (rnd() - 0.5) * 0.14); // рука дрогнула — место случайное
  to.y = surfaceAt(to.x, to.z) + R * 0.85;
  fly = { p, v: flightVel(p.mesh.position, to, flightTime(pull)), spin: V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), w: 8 + rnd() * 6, t: 0, catHit: false };
  state = 'fly'; setBusy(true);
  sfx.whoosh();
  tween(500, (k) => { noteLight.intensity = 0.5 * (1 - k); });
}

function collide(pos, v) {
  const others = papers.filter((q) => q !== fly.p && q.slot && !q.read).map((q) => ({ x: q.slot.x, z: q.slot.z, y: q.slot.y, r: R }));
  const cats = catsys.obstacles().map((o) => ({ ...o, y: TOP + R * 0.85 }));
  for (const o of [...OBST, ...cats, ...others]) {
    if (Math.abs(o.y - pos.y) > (o.cat ? 0.14 : 0.08)) continue;
    const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), min = o.r + R * 0.9;
    if (d >= min || d < 1e-5) continue;
    const nx = dx / d, nz = dz / d;
    pos.x = o.x + nx * min; pos.z = o.z + nz * min;
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) { v.x -= 1.6 * vn * nx; v.z -= 1.6 * vn * nz; if (vn < -0.15) sfx.tap(-vn); }
    if (o.cat && !fly.catHit) { fly.catHit = true; o.cat.react('мяу!'); }
  }
}

function stepFly(dt) {
  const f = fly, m = f.p.mesh, pos = m.position, v = f.v, r = R * 0.85, prevY = pos.y;
  f.t += dt;
  v.y += G * dt;
  pos.addScaledVector(v, dt);
  if (f.bin && binStep(f, pos, v, prevY)) return;
  // бортики стола: над столом и низко — отскок внутрь
  const over = pos.z < DESK.z1 && pos.y < TOP + 0.25 && (!f.bin || inRect(DESK, pos.x, pos.z));
  if (pos.z < LIM.z0) { pos.z = LIM.z0; v.z = Math.abs(v.z) * 0.4; }
  if (over && pos.x < LIM.x0) { pos.x = LIM.x0; v.x = Math.abs(v.x) * 0.4; }
  if (over && pos.x > LIM.x1) { pos.x = LIM.x1; v.x = -Math.abs(v.x) * 0.4; }
  if (over && pos.z > LIM.z1) { pos.z = LIM.z1; v.z = -Math.abs(v.z) * 0.4; }
  // крышка ноутбука
  if (pos.x > LAPTOP.x0 && pos.x < LAPTOP.x1 && pos.y > TOP && pos.y < TOP + 0.42 && pos.z < -1.74 && pos.z > -1.84 && v.z < 0) { pos.z = -1.74; v.z = -v.z * 0.3; sfx.tap(0.6); }
  const surf = surfaceAt(pos.x, pos.z);
  let grounded = false;
  if (pos.y - r <= surf && prevY - r >= surf - 0.025) {
    pos.y = surf + r;
    if (v.y < -0.5) { sfx.thud(-v.y / 4); v.y = -v.y * 0.32; v.x *= 0.75; v.z *= 0.75; f.w *= 0.6; } else { v.y = 0; grounded = true; }
  } else if (pos.y < r) { pos.y = r; v.y = 0; grounded = true; }
  collide(pos, v);
  if (grounded) {
    const k = Math.max(0, 1 - 3.2 * dt); v.x *= k; v.z *= k;
    const sp = Math.hypot(v.x, v.z);
    if (sp > 1e-3) m.rotateOnWorldAxis(V(v.z, 0, -v.x).normalize(), (sp * dt) / R);
    if (sp < 0.03) return settle();
  } else m.rotateOnWorldAxis(f.spin, f.w * dt);
  if (f.t > 6) settle();
}

// мусорка: край корзины отбивает (куда — как повезёт), внутри — попал; стены комнаты не выпускают
function binStep(f, pos, v, prevY) {
  if (pos.z < -1.95) { pos.z = -1.95; v.z = Math.abs(v.z) * 0.4; }
  if (pos.x > 1.45) { pos.x = 1.45; v.x = -Math.abs(v.x) * 0.4; }
  if (pos.x < -1.45) { pos.x = -1.45; v.x = Math.abs(v.x) * 0.4; }
  const dx = pos.x - BIN.x, dz = pos.z - BIN.z, d = Math.hypot(dx, dz), r = R * 0.85;
  if (prevY - r >= BIN.h && pos.y - r < BIN.h && v.y < 0) {
    if (d < BIN.r - r * 0.6) { binIn(f); return true; } // чисто в корзину
    if (d < BIN.r + r) { // о край: отскок наружу или внутрь
      sfx.tap(0.5); const n = d > 1e-4 ? [dx / d, dz / d] : [1, 0], inward = rnd() < 0.45;
      pos.y = BIN.h + r; v.y = Math.abs(v.y) * 0.45;
      const push = (inward ? -1 : 1) * (0.5 + rnd() * 0.6);
      v.x = v.x * 0.4 + n[0] * push; v.z = v.z * 0.4 + n[1] * push;
      return false;
    }
  }
  // боком в стенку корзины
  if (pos.y - r < BIN.h && d < BIN.r + r && d > BIN.r - r && prevY - r < BIN.h) {
    const n = [dx / d, dz / d]; pos.x = BIN.x + n[0] * (BIN.r + r); pos.z = BIN.z + n[1] * (BIN.r + r);
    const vn = v.x * n[0] + v.z * n[1]; if (vn < 0) { v.x -= 1.5 * vn * n[0]; v.z -= 1.5 * vn * n[1]; sfx.tap(-vn * 0.5); }
  }
  return false;
}
function binIn(f) {
  const p = f.p; fly = null; state = 'busy'; // полёт кончился, пока комок падает на дно
  sfx.thud(0.25);
  const m = p.mesh, p0 = m.position.clone();
  tween(350, (k) => { m.position.set(p0.x + (BIN.x - p0.x) * k, BIN.h * (1 - k) + 0.05 * k, p0.z + (BIN.z - p0.z) * k); }).then(() => toTrash(p, true));
}
// мимо: комок полежал и сам перепрыгнул в корзину (без баллов)
async function hopToBin(p) {
  state = 'busy'; await tween(450, () => {});
  const m = p.mesh, p0 = m.position.clone();
  sfx.whoosh();
  await tween(650, (k) => {
    const e = ease(k);
    m.position.set(p0.x + (BIN.x - p0.x) * e, p0.y + (0.05 - p0.y) * e + Math.sin(e * Math.PI) * (BIN.h + 0.25), p0.z + (BIN.z - p0.z) * e);
    m.rotateY(0.2);
  });
  toTrash(p, false);
}
function toTrash(p, hit) {
  scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose?.();
  papers.splice(papers.indexOf(p), 1);
  const ci = clickables.indexOf(p.mesh); if (ci >= 0) clickables.splice(ci, 1);
  store.put('trash', p.key, { at: Date.now() }).catch(console.warn);
  if (hit) { store.award('trash', p.key); floatAt(bin, '+3 ♥'); sfx.chime(); tip('в яблочко!'); }
  else { floatAt(bin, 'мимо'); tip('мимо — но записка всё равно в мусорке'); }
  setTimeout(() => tip(), 2200);
  state = idle(); setBusy(false);
}
// из открытой записки: комок в руку и прицел на мусорку
async function trashNote() {
  if (state !== 'note' || !openPaper) return;
  const p = openPaper; openPaper = null; state = 'busy'; noteNav.hidden = true; trashBtn.hidden = true;
  const ci = clickables.indexOf(p.mesh); if (ci >= 0) clickables.splice(ci, 1);
  // из приближения — камера заодно отъезжает домой: мусорку видно только оттуда
  const home = !!zone, c0 = cam.pos.clone(), l0 = cam.look.clone();
  if (home) { zone = null; zonesys.zoomed(false); }
  const from = p.mesh.position.clone();
  sfx.crumple(0.9); p.mesh.scale.z = 1;
  await tween(900, (k) => {
    const e = ease(k);
    if (home) { cam.pos.lerpVectors(c0, HOME.pos, e); cam.look.lerpVectors(l0, HOME.look, e); }
    p.setT(1 - e); p.mesh.position.lerpVectors(from, holdPos(), e); noteLight.intensity = 0.9 * (1 - e);
  });
  const hold = holdPos();
  aim = { p, hold, pull: 0, side: 0, drag: null, bin: true };
  state = 'aim'; setBusy(false); body.classList.add('aim');
  tip('оттяни комок вниз и прицелься в мусорку под столом — попадёшь: +3 ♥');
}
const trashBtn = document.getElementById('trashBtn');
trashBtn.onclick = (e) => { e.stopPropagation(); trashNote(); };

function settle() {
  const p = fly.p, wasBin = fly.bin; fly = null;
  if (wasBin) return hopToBin(p);
  p.slot = p.mesh.position.clone(); p.rest = p.mesh.rotation.clone();
  p.note.pos = p.slot.toArray(); p.note.rot = [p.rest.x, p.rest.y, p.rest.z];
  if (p.note.id) store.put('notes', p.note.id, p.note).catch(console.warn); // стартовые записки (seed) не сохраняем
  clickables.push(p.mesh);
  floatAt(p.mesh, '♥');
  state = 'room'; setBusy(false); tip();
}

// ---------- фото на стене ----------
const wallModal = document.getElementById('wallModal');
async function openWallPhoto(i) {
  state = 'busy'; setBusy(true);
  const d = store.get('wall', 'w' + i) || {};
  const img = wallModal.querySelector('img'), cap = wallModal.querySelector('[name=caption]'), file = wallModal.querySelector('[name=file]');
  const status = wallModal.querySelector('.status');
  let url = d.url || '';
  const show = () => { img.hidden = !url; img.src = store.media(url); wallModal.querySelector('.empty').hidden = !!url; };
  cap.value = d.caption || ''; status.textContent = ''; show();
  wallModal.hidden = false;
  const close = () => { wallModal.hidden = true; state = idle(); setBusy(false); };
  file.onchange = async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    status.textContent = 'загружаю…';
    try { url = await store.uploadPhoto(f, 1400); status.textContent = ''; show(); }
    catch (e) { status.textContent = 'не получилось загрузить'; console.warn(e); }
  };
  wallModal.querySelector('[data-a=save]').onclick = async () => {
    await store.put('wall', 'w' + i, { url, caption: cap.value.trim().slice(0, 40) }).catch(console.warn);
    setWall(i); close();
  };
  wallModal.querySelector('[data-a=remove]').onclick = async () => { await store.del('wall', 'w' + i).catch(console.warn); setWall(i); close(); };
  wallModal.querySelector('[data-a=close]').onclick = close;
}

// ---------- ввод ----------
const tipEl = document.getElementById('tip');
const TIP = tipEl.textContent;
function tip(text = TIP) { tipEl.textContent = text; }

function floatAt(obj, text) {
  const p = obj.getWorldPosition(V()).project(camera);
  if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
  const el = Object.assign(document.createElement('div'), { className: 'float', textContent: text });
  el.style.left = ((p.x + 1) / 2) * innerWidth - 10 + 'px';
  el.style.top = ((1 - p.y) / 2) * innerHeight - 30 + 'px';
  body.append(el);
  setTimeout(() => el.remove(), 1400);
}

// ---------- зоны приближения (zones.js): стена с фото, полка с альбомами, стол ----------
let zone = null; // текущая зона приближения
const idle = () => (zone ? 'zoom' : 'room'); // куда возвращаться после действия
const view = () => (zone ? { pos: zone.posV, look: zone.lookV } : HOME);
const zonesys = createZones({ camera, onZoom: (z) => zoomTo(z), onBack: () => unzoom(), list: [
  { id: 'photos', box: [[-0.86, 1.36, -2], [0.34, 2.02, -1.9]], anchor: [-0.27, 2.05, -1.97], pos: [-0.27, 1.72, -0.98], look: [-0.27, 1.71, -2] },
  { id: 'albums', box: [[0.35, 1.44, -2], [1.22, 1.82, -1.76]], anchor: [0.72, 1.86, -1.9], pos: [0.72, 1.66, -1.08], look: [0.72, 1.6, -1.95] },
  { id: 'desk', box: [[-0.96, 0.74, -1.95], [0.96, 1.1, -1.06]], anchor: [0.62, 0.95, -1.25], pos: [0, 1.48, -0.42], look: [0, 0.78, -1.5] },
] });
async function zoomTo(z) {
  if (!z || (state !== 'room' && state !== 'zoom')) return;
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

const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), mouse = { x: 0, y: 0 };
// что может поймать луч мыши: меши сцены без декора (стекло, блики, лучи, дождь), обводок и неба.
// Собирается раз в 32 кадра (вместе с toonify) — луч не считает пересечения с тем, что всё равно пропустит
let pickList = [];
function refreshPick() {
  pickList = [];
  scene.traverse((o) => { if (o.isMesh && !o.userData.isOutline && !o.userData.noAO && o !== sky && o !== orb) pickList.push(o); });
}
function pick(e) {
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  if (!pickList.length) refreshPick();
  // первое настоящее препятствие на луче: стол закрывает то, что под ним
  for (const hit of ray.intersectObjects(pickList, false)) {
    const o0 = hit.object;
    if (!o0.visible) continue;
    let hidden = false;
    for (let o = o0; o; o = o.parent) hidden ||= !o.visible;
    if (hidden) continue; // вещь в коробке (группа скрыта) лучу не мешает
    // кликабельное: своё из сцены или расставленная вещь с действием (радио)
    for (let o = o0; o; o = o.parent) if (o.userData.act && (clickables.includes(o) || o.userData.inst)) return o;
    return null;
  }
  return null;
}
const canvas = renderer.domElement;
let lastPick = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'aim') return;
  aim.drag = { x: e.clientX, y: e.clientY };
  sfx.crumple(0.2);
  canvas.setPointerCapture(e.pointerId);
  body.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5;
  if (state === 'aim') {
    if (!aim.drag) return;
    aim.pull = clamp((e.clientY - aim.drag.y) / (innerHeight * 0.32), 0, 1.15);
    aim.side = clamp((e.clientX - aim.drag.x) / (innerWidth * 0.3), -1, 1);
    return updateAim();
  }
  if (e.timeStamp - lastPick < 80) return;
  lastPick = e.timeStamp;
  const o = state === 'room' || state === 'zoom' ? pick(e) : null;
  hoveredBook = o?.userData.book ? o : null;
  body.classList.toggle('hover', state === 'note' || !!o);
  const z = state === 'room' && !o ? zonesys.at(ray) : null; // лупа — только над свободной частью зоны
  zonesys.hover(z); body.classList.toggle('zoomhover', !!z);
});
canvas.addEventListener('pointerleave', (e) => { hoveredBook = null; if (!e.relatedTarget?.closest?.('.zlens')) { zonesys.hover(null); body.classList.remove('zoomhover'); } });
canvas.addEventListener('wheel', (e) => { if (state === 'zoom' && e.deltaY > 0) unzoom(); }, { passive: true });
canvas.addEventListener('pointerup', () => {
  if (state !== 'aim' || !aim.drag) return;
  aim.drag = null; body.classList.remove('drag');
  if (aim.pull < 0.06) { aim.pull = aim.side = 0; return updateAim(); }
  launch();
});
canvas.addEventListener('click', (e) => {
  if (state === 'note') return closeNote();
  if (state !== 'room' && state !== 'zoom') return;
  const o = pick(e);
  if (o) return o.userData.act();
  if (state === 'zoom') { if (!zonesys.contains(zone, ray)) unzoom(); return; } // клик мимо зоны — назад
  zoomTo(zonesys.at(ray));
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && state === 'note') closeNote(); else if (e.key === 'Escape' && state === 'zoom') unzoom(); });

// написать записку: текст и/или рисунок карандашом
const modal = document.getElementById('modal'), form = document.getElementById('noteForm');
document.getElementById('fromSel').replaceWith(Object.assign(whoSelect(), { name: 'from' }));
const pad = createPad(form);
const muteBtn = document.getElementById('mute');
const muteIcon = () => { muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; };
muteIcon();
muteBtn.onclick = () => { sfx.toggleMute(); muteIcon(); };
document.getElementById('write').onclick = () => { if (state === 'room') { modal.hidden = false; pad.open(); } };
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
form.onsubmit = (e) => {
  e.preventDefault();
  const note = { id: store.uid(), from: form.from.value, date: new Date().toISOString(), text: form.text.value.trim() };
  const drawing = pad.image();
  if (drawing) note.drawing = drawing;
  if (!note.text && !drawing) return form.text.focus();
  store.put('notes', note.id, note).then(() => store.award('note', note.id)).catch(console.warn);
  form.reset(); pad.reset(); form.from.value = myName(); modal.hidden = true;
  throwNew(note);
};

// ---------- цикл ----------
let sized = '';
function resize() {
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  post.resize(innerWidth, innerHeight, pr, TIERS[tier].msaa);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 70 : 45;
  HOME.pos.set(0, 1.5, camera.aspect < 1 ? 1.25 : 1.1);
  camera.updateProjectionMatrix();
}
let warmUntil = Infinity; // до прогрева автоподстройка молчит (см. warmUp)
const checkSize = () => { const k = `${innerWidth}x${innerHeight}@${devicePixelRatio}`; if (k !== sized) { sized = k; resize(); warmUntil = performance.now() + 1000; } }; // смена монитора/масштаба не всегда шлёт resize
applyTier();
checkSize();

let last = performance.now(), slow = [], frameN = 0;
toonify(scene);
function tuneGfx(med, now) {
  if (!tuner.feed(med, now)) return;
  const tierWas = tier;
  tier = tuner.tier; pr = tuner.pr; sized = '';
  if (tier !== tierWas) { applyTier(); applyTime(); }
  save('gfx3', { tier, pr });
}
// ---------- своя комната: стены, пол, стол и расстановка вещей (у каждой половинки своя) ----------
let deskObj = null, deskKey = '', wallNow = '', floorNow = '', viewYaw = 0;
function applyRoom(r = getRoom()) {
  if (r.wall !== wallNow) {
    paintWall(plasterTex.image, wainTex.image, r.wall); plasterTex.needsUpdate = wainTex.needsUpdate = true; wallNow = r.wall;
    moldM.color.set(WALLS[r.wall]?.low || '#c4878a').lerp(new THREE.Color('#ffffff'), 0.22);
  }
  if (r.floor !== floorNow) {
    paintFloor(floorTex.image, r.floor); // блеск и рельеф в тун-стиле не нужны (clearcoat у тун-материала ломает шейдер)
    floorTex.needsUpdate = true; floorNow = r.floor;
  }
  const dk = String(r.desk || 'd_classic').replace(/^d_/, ''), key = `${dk}:${r.deskColor || 'oak'}`;
  if (key !== deskKey) {
    if (deskObj) { scene.remove(deskObj.group); deskObj.dispose?.(); }
    deskObj = buildDesk(dk, r.deskColor || 'oak');
    scene.add(deskObj.group);
    deskKey = key;
    // от ширины стола зависят бросок записок и дорожки котов
    DESK.x0 = -deskObj.half; DESK.x1 = deskObj.half;
    LIM.x0 = DESK.x0 + R; LIM.x1 = DESK.x1 - R;
    catsys.setDesk({ half: deskObj.half, legs: deskObj.legs, floorBlocks: deskObj.floorBlocks || [] });
  }
  placer.sync(myThings(), r.place);
  drawArrange();
}
placer = createPlacer({
  scene, camera, canvas: renderer.domElement, ITEMS: FURN, CAT: ITEM,
  staticSurfaces: () => [...(deskObj?.surfaces || []), sill, albumShelf],
  bounds: { x0: -2.97, x1: 2.97, z0: -1.99, z1: 2.4, y1: 2.75 },
  hole: { x0: HOLE.x0 - 0.12, x1: HOLE.x1 + 0.12, y0: HOLE.y0 - 0.15, y1: HOLE.y1 + 0.12 },
  onSave: (place) => saveRoom({ place }),
  onView: (dir) => { viewYaw = clamp(viewYaw + dir * 0.55, -1.1, 1.1); },
  onExit: () => {
    viewYaw = 0; body.classList.remove('editing'); drawArrange();
    const l0 = cam.look.clone();
    tween(700, (k) => cam.look.lerpVectors(l0, HOME.look, ease(k))).then(() => { state = 'room'; });
  },
});
// кнопка «расставить» и сколько вещей ждут в коробке
// посещения — Vercel Web Analytics (без cookies); локально не шлём
if (!/^(localhost|127\.)/.test(location.hostname)) analytics();
if (new URLSearchParams(location.search).has('debug')) console.info('Наш дом, версия', __VERSION__);
onRadio((name) => toast(name ? `📻 lofi · «${name}»` : '📻 радио выключено'));
const arrangeBtn = document.getElementById('arrange');
function drawArrange() { if (arrangeBtn) { const n = placer.boxCount(); arrangeBtn.textContent = n ? `🪄 расставить · 📦 ${n}` : '🪄 расставить'; } }
if (arrangeBtn) arrangeBtn.onclick = () => { if (state !== 'room') return; state = 'edit'; body.classList.add('editing'); placer.edit(); sfx.pop(); };
applyRoom();
onRoom(applyRoom);
store.onLedger(() => applyRoom());
if (!hasRoom()) askRoomSetup(); // первый раз: выбрать стены, пол и стол

const loop = (now) => {
  const raw = (now - last) / 1000, dt = Math.min(0.033, raw); last = now;
  if (!paused && raw < 0.25 && document.visibilityState === 'visible' && now > warmUntil) {
    slow.push(raw);
    if (slow.length >= 30) { const med = slow.sort((a, b) => a - b)[15]; slow = []; tuneGfx(med, now); }
  }
  for (const t of tweens) {
    const k = Math.min(1, (now - t.t0) / t.ms);
    t.fn(k);
    if (k === 1) { tweens.delete(t); t.res(); }
  }
  if (paused || !innerWidth || !innerHeight) return; // свёрнутое окно 0×0 — рисовать некуда
  checkSize();
  const s = now / 1000;
  if (state === 'room') cam.pos.lerp(V(HOME.pos.x + mouse.x * 0.3, HOME.pos.y - mouse.y * 0.15, HOME.pos.z), 0.05);
  if (state === 'zoom') cam.pos.lerp(V(zone.posV.x + mouse.x * 0.09, zone.posV.y - mouse.y * 0.045, zone.posV.z), 0.05);
  if (state === 'edit') {
    const dir = HOME.look.clone().sub(HOME.pos).applyAxisAngle(V(0, 1, 0), -viewYaw);
    cam.pos.lerp(V(HOME.pos.x, HOME.pos.y + 0.15, HOME.pos.z + 0.35), 0.06);
    cam.look.lerp(cam.pos.clone().add(dir), 0.06);
  }
  if (state === 'fly') { stepFly(dt / 2); if (fly) stepFly(dt / 2); }
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);

  catsys.update(dt, s);
  decor.update(dt, s);
  placer.update(dt, s);
  weatherFrame(dt, s);

  // альбомы выезжают при наведении
  for (const b of books) {
    b.userData.out = damp(b.userData.out, b === hoveredBook ? 1 : 0, 10, dt);
    b.position.z = -1.9 + 0.075 * b.userData.out;
  }
  if (hoveredBook && (state === 'room' || state === 'zoom')) {
    const p = hoveredBook.localToWorld(V(0, 0.12, 0.08)).project(camera);
    bookLabel.textContent = hoveredBook.userData.title;
    bookLabel.style.left = ((p.x + 1) / 2) * innerWidth + 'px';
    bookLabel.style.top = ((1 - p.y) / 2) * innerHeight + 'px';
    bookLabel.hidden = false;
  } else bookLabel.hidden = true;

  const gl = 0.45 + 0.55 * Math.max(TP.lamp, 0.35);
  const fl = 1 + Math.sin(s * 13) * 0.08 + Math.sin(s * 23.7) * 0.06;
  flames.forEach((f, i) => { f.scale.y = 0.016 * (fl + i * 0.05); });
  candleLight.intensity = 0.25 * fl * TP.lamp;
  const d = dustGeo.attributes.position;
  for (let i = 0; i < DUST; i++) {
    const k = dustSeed[i];
    let y = d.getY(i) + dt * 0.012;
    if (y > 0.42) y = 0;
    d.setXYZ(i, d.getX(i) + Math.sin(s * 0.4 + k) * dt * 0.006, y, d.getZ(i) + Math.cos(s * 0.33 + k) * dt * 0.006);
  }
  d.needsUpdate = true;
  if (sunDustMat.opacity > 0.01) {
    const a = sunDustGeo.attributes.position;
    sunDustSeed.forEach(([pi, u, v, t, k], i) => {
      const [x0, x1, y0, y1] = PANES[pi], tt = (t + s * 0.004) % 1;
      a.setXYZ(i,
        x0 + (x1 - x0) * u + sunDir.x * (0.15 + tt * 2.6) + Math.sin(s * 0.3 + k) * 0.02,
        y0 + (y1 - y0) * v + sunDir.y * (0.15 + tt * 2.6) + Math.sin(s * 0.23 + k * 2) * 0.02,
        -1.99 + sunDir.z * (0.15 + tt * 2.6));
    });
    a.needsUpdate = true;
  }
  steam.rotation.y = s * 0.5; steam.scale.y = 1 + Math.sin(s * 1.3) * 0.08;

  zonesys.frame();
  uT.value = s;
  if ((++frameN & 31) === 0) { toonify(scene); refreshPick(); } // новые вещи (стол, расстановка, подарки, записки, книги) — в тун с обводкой и в список для луча
  renderer.shadowMap.needsUpdate = frameN % TIERS[tier].shEvery === 0;
  post.render(scene, camera);
};
// ---------- прогрев: до первого кадра текстуры уходят в видеокарту, шейдеры компилируются параллельно ----------
// (three не пропускает неготовый шейдер, а ждёт его прямо в кадре — отсюда были рывки по 200 мс в первые секунды)
async function warmUp(root) {
  const seen = new Set(), tex = (v) => { if (v?.isTexture && !seen.has(v)) { seen.add(v); renderer.initTexture(v); } };
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) tex(v);
      for (const u of Object.values(m.uniforms || {})) tex(u?.value);
    }
  });
  performance.mark('lr:textures', { detail: seen.size });
  await renderer.compileAsync(root, camera, scene).catch(console.warn);
}
performance.mark('lr:built');
sfx.prepareAudio(); // звук создаётся здесь же, за заставкой (на первом клике было +100 мс)
performance.mark('lr:audio');
performance.mark('lr:prewarm', { detail: renderer.info.programs.length });
await warmUp(scene);
performance.mark('lr:compiled', { detail: renderer.info.programs.length });
renderer.shadowMap.needsUpdate = true; post.render(scene, camera); // тени и вывод тоже собираются здесь, за заставкой
warmUntil = performance.now() + 3000; // автоподстройка не слушает первые секунды: там кадры медленные не из-за видеокарты
renderer.setAnimationLoop(loop);
requestAnimationFrame(() => requestAnimationFrame(() => { performance.mark('lr:shown'); veil.classList.add('off'); setTimeout(() => veil.remove(), 600); }));

// ?debug — ручки для проверки (камера, коты, время)
if (new URLSearchParams(location.search).has('debug')) window.__room = { cam, camera, laptop, clickables, HOME, catsys, decor, papers, zonesys, step: (ms = 500, dt = 16) => { for (let t = performance.now(), e = t + ms; t < e; t += dt) loop(t); }, // скрытая панель: rAF стоит — шагаем вручную
  zoomTo: (id) => zoomTo(zonesys.byId(id)), unzoom, get state() { return state; }, applyTime, tick: (s = 5) => weatherFrame(0.016, s), scene, THREE, renderer, sun, post, get tier() { return tier; }, get pr() { return pr; }, get FX() { return FX; }, bolt: () => { flash = 1; sfx.thunder(0.8); }, set flash(v) { flash = v; } };
