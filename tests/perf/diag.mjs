// Диагностика кадра на этой машине: вызовы отрисовки, время видеокарты по частям, рост числа шейдеров, цена луча мыши.
// Запуск: `npm run dev`, потом `node tests/perf/diag.mjs`. Ничего не меняет в коде сайта — только измеряет из консоли (?debug).
import { chromium } from 'playwright-core';

const ctx = await chromium.launchPersistentContext(new URL('./.profile', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), {
  channel: 'chrome', headless: false, viewport: null,
  args: ['--window-size=1920,1080', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8125/?debug&local');
await page.waitForFunction(() => window.__room, null, { timeout: 60000 });
await page.waitForTimeout(4000);

const out = await page.evaluate(async () => {
  const R = window.__room, r = R.renderer, gl = r.getContext(), scene = R.scene, THREE = R.THREE;
  const res = {};
  const wait = (ms) => new Promise((x) => setTimeout(x, ms));
  // 1. что рисуется
  res.info = { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length, geometries: r.info.memory.geometries, textures: r.info.memory.textures, tier: R.tier, pr: R.pr, size: [r.domElement.width, r.domElement.height] };
  let meshes = 0, hulls = 0, pts = 0, lights = 0, shadowCasters = 0, tri = 0;
  scene.traverse((o) => { if (o.isMesh) { meshes++; if (o.castShadow) shadowCasters++; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position?.count || 0) / 3; } if (o.isPoints) pts++; if (o.isLight) lights++; if (o.userData.outline || o.name === 'outline') hulls++; });
  res.scene = { meshes, shadowCasters, pts, lights, triTotal: Math.round(tri) };
  // 2. рост шейдеров и материалов за 3 с простоя
  const p0 = r.info.programs.length, ver = new Map();
  scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) ver.set(m, m.version); });
  await wait(3000);
  let bumped = 0, newMats = 0;
  scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) { if (!ver.has(m)) newMats++; else if (m.version !== ver.get(m)) bumped++; } });
  res.churn3s = { programsBefore: p0, programsAfter: r.info.programs.length, materialsVersionBumped: bumped, newMaterials: newMats };
  // 3. время видеокарты одного кадра (EXT_disjoint_timer_query_webgl2), разбор по частям
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  res.gpuTimer = !!ext;
  const gpuFrame = async (label, n = 20) => {
    const times = [];
    for (let i = 0; i < n; i++) {
      await new Promise((x) => requestAnimationFrame(x));
      if (!ext) continue;
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      R.post.render(scene, R.camera);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      await new Promise((x) => { const poll = () => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? x() : setTimeout(poll, 2)); poll(); });
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    times.sort((a, b) => a - b);
    return { label, gpuMs: +(times[times.length >> 1] || 0).toFixed(2) };
  };
  // CPU-время одного render (без ожидания видеокарты)
  const cpuRender = (n = 30) => { const t = performance.now(); for (let i = 0; i < n; i++) R.post.render(scene, R.camera); gl.finish(); return +((performance.now() - t) / n).toFixed(2); };
  res.frame = [];
  r.shadowMap.needsUpdate = true;
  res.frame.push({ ...(await gpuFrame('всё (с тенью)')), cpuMsWithFinish: cpuRender() });
  const auto = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
  res.frame.push({ ...(await gpuFrame('без пересчёта тени')), cpuMsWithFinish: cpuRender() });
  r.shadowMap.autoUpdate = auto;
  // обводки (оболочки) отдельно: временно скрыть
  const hid = []; scene.traverse((o) => { if (o.isMesh && o.material?.side === THREE.BackSide && o.visible) { o.visible = false; hid.push(o); } });
  res.frame.push({ ...(await gpuFrame(`без обводок (${hid.length} оболочек)`)), cpuMsWithFinish: cpuRender() });
  hid.forEach((o) => (o.visible = true));
  res.callsNow = r.info.render.calls;
  // 4. цена луча мыши по объектам (как pick: все дети сцены, рекурсивно)
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0.1, -0.1), R.camera);
  const t0 = performance.now(); for (let i = 0; i < 10; i++) ray.intersectObjects(scene.children, true); res.rayAllMs = +((performance.now() - t0) / 10).toFixed(2);
  const cost = [];
  scene.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isLine)) return; const t = performance.now(); for (let i = 0; i < 5; i++) ray.intersectObject(o, false); const ms = (performance.now() - t) / 5; if (ms > 0.05) cost.push([+ms.toFixed(2), o.type, o.name || o.parent?.name || '', o.material?.side === THREE.BackSide ? 'обводка' : '', (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 | 0]); });
  res.rayTop = cost.sort((a, b) => b[0] - a[0]).slice(0, 12);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await ctx.close();
