// Лаборатория стилей: одна композиция (layout.js), три разных конвейера рендера (cartoon.js / real.js / soft.js).
// Вариант = модуль с export async function build(ctx) → { render(dt, t), resize(w, h, pr), dispose? }.
// ctx: { THREE, renderer, scene, camera, L (layout.js) }. Вариант сам решает про свет, материалы, тени и пост-обработку.
// Для проверки из консоли (скрытая вкладка не крутит кадры): __lab.frame(), __lab.shot('name.jpg'), __lab.bench().
import * as THREE from 'three';
import * as L from './layout.js';

const v = new URLSearchParams(location.search).get('v') || 'cartoon';
document.querySelectorAll('#hud a').forEach((a) => a.classList.toggle('on', a.href.endsWith('v=' + v)));

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(L.CAMERA.fov, 1, 0.05, 40);
camera.position.set(...L.CAMERA.pos);
camera.lookAt(...L.CAMERA.look);

const mod = await import(`./${v}.js`);
const style = await mod.build({ THREE, renderer, scene, camera, L });

let pr = Math.min(devicePixelRatio, 1.5), W = 0, H = 0;
function resize(w = innerWidth, h = innerHeight, p = pr) {
  W = w; H = h;
  renderer.setPixelRatio(p);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  style.resize(w, h, p);
}
resize();
addEventListener('resize', () => resize());

let last = performance.now(), t0 = last;
const ms = document.getElementById('ms'), times = [];
function frame(now = performance.now()) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  style.render(dt, (now - t0) / 1000);
  times.push(dt); if (times.length > 60) times.shift();
}
renderer.setAnimationLoop((now) => {
  frame(now);
  if (times.length === 60 && (now | 0) % 30 === 0) ms.textContent = `${(times.slice().sort((a, b) => a - b)[30] * 1000).toFixed(1)} мс/кадр`;
});

// --- проверки ---
const gl = renderer.getContext(), px = new Uint8Array(4);
const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // ждём, пока видеокарта дорисует
window.__lab = {
  THREE, renderer, scene, camera, style, L,
  frame: (n = 1) => { for (let i = 0; i < n; i++) frame(last + 16.7); sync(); return 'ok'; },
  // кадр в файл через локальный приёмник (scratchpad/recv.mjs на :8199)
  async shot(name = v + '.jpg', w = 1920, h = 1200, p = 1) {
    resize(w, h, p);
    for (let i = 0; i < 3; i++) frame(last + 16.7);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.92);
    resize();
    return (await fetch('http://localhost:8199/?n=' + name, { method: 'POST', body: url })).text();
  },
  // среднее время кадра (мс) в Full HD при заданном pixel ratio, с ожиданием видеокарты
  bench(p = 1, n = 20) {
    resize(1920, 1080, p);
    for (let i = 0; i < 5; i++) frame(last + 16.7);
    sync();
    const a = performance.now();
    for (let i = 0; i < n; i++) { frame(last + 16.7); sync(); }
    const r = (performance.now() - a) / n;
    renderer.info.autoReset = false; renderer.info.reset(); frame(last + 16.7); const calls = renderer.info.render.calls, tris = renderer.info.render.triangles; renderer.info.autoReset = true;
    resize();
    return { ms: +r.toFixed(1), calls, tris };
  },
};
