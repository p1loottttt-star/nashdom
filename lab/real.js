// Реалистичный вариант: PBR-материалы (ambientCG / Poly Haven, CC0), солнце с мягкими тенями через окно,
// окружение = запечённый зонд самой комнаты (2 отскока поверх HDRI), MSAA 4x, GTAO в половинном разрешении по глубине основного прохода, лёгкий bloom, AgX.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const A = new URL('./assets/real/', import.meta.url).href;

export async function build({ THREE, renderer, scene, camera, L }) {
  const { ROOM, WINDOW: WIN, WAINSCOT, DESK, ITEMS: I, SUN } = L;
  const BACK = ROOM.back, FRONT = ROOM.back + ROOM.d, HX = ROOM.w / 2, H = ROOM.h;

  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 2.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const world = new THREE.Group();
  scene.add(world);

  // ---------- загрузка ----------
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tl = new THREE.TextureLoader();
  const tex = (file, srgb) => tl.loadAsync(A + file).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    return t;
  });
  const set = (name) => Promise.all([tex(`tex/${name}_col.jpg`, true), tex(`tex/${name}_nrm.jpg`), tex(`tex/${name}_rgh.jpg`)]);
  const gltf = new GLTFLoader();
  const [floorT, deskT, oakT, plasterT, fabricT, carpetT, viewT, hdr, photos, pachira, succulent] = await Promise.all([
    set('floor'), set('desk'), set('oak'), set('plaster'), set('fabric'), set('carpet'),
    tex('view.jpg', true),
    new RGBELoader().loadAsync(A + 'lythwood_room_1k.hdr'),
    Promise.all([1, 2, 3, 4].map((i) => tex(`photo${i}.jpg`, true))),
    gltf.loadAsync(A + 'pachira_aquatica_01/pachira_aquatica_01_1k.gltf'),
    gltf.loadAsync(A + 'potted_plant_04/potted_plant_04_1k.gltf'),
  ]);

  // ---------- помощники ----------
  // UV в метрах по доминирующей оси нормали (геометрия уже в мировых координатах или локальных — неважно, масштаб честный)
  function projUV(g, S = 1) {
    const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
      else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
      else { u = p.getX(i); v = p.getY(i); }
      uv[i * 2] = u / S; uv[i * 2 + 1] = v / S;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
  function pbr([map, normalMap, roughnessMap], o = {}) {
    const { ns = 1, Cls = THREE.MeshStandardMaterial, ...rest } = o;
    return new Cls({ map, normalMap, roughnessMap, normalScale: new THREE.Vector2(ns, ns), ...rest });
  }
  function add(geo, mat, parent = world, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const boxG = (w, h, d, x, y, z, r = 0) => (r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)).translate(x, y, z);
  const merge = (geos, S) => { const g = mergeGeometries(geos.map((q) => q.index ? q.toNonIndexed() : q)); return S ? projUV(g, S) : g; };
  let seed = 7;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // ---------- материалы ----------
  const M = {
    wall: pbr(plasterT, { color: '#ece9e3', ns: 0.15, roughness: 1 }),
    ceiling: pbr(plasterT, { color: '#f2f0ec', ns: 0.2, roughness: 1 }),
    floor: pbr(floorT, { color: '#f2e6da', roughness: 0.62 }),
    desk: pbr(oakT, { roughness: 0.6, color: '#f1e4d4', ns: 0.2 }),
    walnut: pbr(deskT, { roughness: 0.7, color: '#f0e2d2' }),
    wains: pbr(plasterT, { color: '#8d9a84', ns: 0.12, roughness: 0.62 }),
    trim: new THREE.MeshStandardMaterial({ color: '#f1ede5', roughness: 0.42 }),
    curtain: pbr(fabricT, { Cls: THREE.MeshPhysicalMaterial, color: '#f2e9dd', ns: 0.8, side: THREE.DoubleSide, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color('#fff4e6') }),
    rug: pbr(carpetT, { color: '#e9d3c3', ns: 1.2 }),
    metalDark: new THREE.MeshStandardMaterial({ color: '#2a2724', metalness: 0.9, roughness: 0.45 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c9a46a', metalness: 1, roughness: 0.32 }),
    alu: new THREE.MeshStandardMaterial({ color: '#cfd0d3', metalness: 1, roughness: 0.3 }),
    paper: new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.9 }),
  };
  for (const m of [M.wall, M.ceiling, M.wains]) { m.shadowSide = THREE.DoubleSide; m.map = null; } // крашеная стена: без пятен цвета, только фактура

  // ---------- оболочка комнаты ----------
  // пол
  add(projUV(new THREE.PlaneGeometry(ROOM.w, ROOM.d).rotateX(-Math.PI / 2).translate(0, 0, (BACK + FRONT) / 2), 1.7), M.floor);
  // задняя стена с проёмом
  const wallShape = new THREE.Shape().moveTo(-HX, 0).lineTo(HX, 0).lineTo(HX, H).lineTo(-HX, H).lineTo(-HX, 0);
  wallShape.holes.push(new THREE.Path().moveTo(WIN.x0, WIN.y0).lineTo(WIN.x0, WIN.y1).lineTo(WIN.x1, WIN.y1).lineTo(WIN.x1, WIN.y0).lineTo(WIN.x0, WIN.y0));
  const backG = new THREE.ShapeGeometry(wallShape).translate(0, 0, BACK);
  // откосы проёма (стена 20 см)
  const T = 0.2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0, wcx = (WIN.x0 + WIN.x1) / 2, wcy = (WIN.y0 + WIN.y1) / 2;
  const revG = [
    new THREE.PlaneGeometry(T, wh).rotateY(Math.PI / 2).translate(WIN.x0, wcy, BACK - T / 2),
    new THREE.PlaneGeometry(T, wh).rotateY(-Math.PI / 2).translate(WIN.x1, wcy, BACK - T / 2),
    new THREE.PlaneGeometry(ww, T).rotateX(Math.PI / 2).translate(wcx, WIN.y1, BACK - T / 2),
  ];
  add(merge([backG, ...revG,
    new THREE.PlaneGeometry(ROOM.d, H).rotateY(Math.PI / 2).translate(-HX, H / 2, (BACK + FRONT) / 2),
    new THREE.PlaneGeometry(ROOM.d, H).rotateY(-Math.PI / 2).translate(HX, H / 2, (BACK + FRONT) / 2),
    new THREE.PlaneGeometry(ROOM.w, H).rotateY(Math.PI).translate(0, H / 2, FRONT),
  ], 1.3), M.wall);
  add(projUV(new THREE.PlaneGeometry(ROOM.w, ROOM.d).rotateX(Math.PI / 2).translate(0, H, (BACK + FRONT) / 2), 1.5), M.ceiling);

  // стеновая панель (нижняя треть задней стены): щит, филёнки, поручень, плинтус
  {
    const z0 = BACK + 0.012, g = [boxG(ROOM.w, WAINSCOT, 0.024, 0, WAINSCOT / 2, BACK)];
    const n = 9, pw = (ROOM.w - 0.2) / n, mold = 0.014;
    for (let i = 0; i < n; i++) {
      const x0 = -HX + 0.1 + i * pw + 0.05, x1 = x0 + pw - 0.1, y0 = 0.17, y1 = WAINSCOT - 0.15;
      g.push(boxG(x1 - x0, mold, mold, (x0 + x1) / 2, y0, z0 + mold / 2), boxG(x1 - x0, mold, mold, (x0 + x1) / 2, y1, z0 + mold / 2),
        boxG(mold, y1 - y0, mold, x0, (y0 + y1) / 2, z0 + mold / 2), boxG(mold, y1 - y0, mold, x1, (y0 + y1) / 2, z0 + mold / 2));
    }
    g.push(boxG(ROOM.w, 0.035, 0.04, 0, WAINSCOT, BACK + 0.02, 0.008));
    add(merge(g, 1.3), M.wains);
    // плинтусы по трём стенам
    add(merge([
      boxG(ROOM.w, 0.09, 0.018, 0, 0.045, z0 + 0.009, 0.004),
      boxG(0.018, 0.09, ROOM.d, -HX + 0.009, 0.045, (BACK + FRONT) / 2, 0.004),
      boxG(0.018, 0.09, ROOM.d, HX - 0.009, 0.045, (BACK + FRONT) / 2, 0.004),
    ]), M.trim);
  }

  // окно: наличник, коробка, створки, подоконник
  {
    const g = [], c = 0.07, cz = BACK + 0.009;
    g.push(boxG(ww + 2 * c, c, 0.018, wcx, WIN.y1 + c / 2, cz, 0.004),
      boxG(c, wh + c, 0.018, WIN.x0 - c / 2, wcy + c / 2, cz, 0.004),
      boxG(c, wh + c, 0.018, WIN.x1 + c / 2, wcy + c / 2, cz, 0.004));
    // подоконник и фартук под ним
    g.push(boxG(ww + 0.16, 0.028, T + 0.06, wcx, WIN.y0 - 0.014, BACK - T / 2 + 0.03, 0.006),
      boxG(ww + 2 * c, 0.06, 0.016, wcx, WIN.y0 - 0.06, cz, 0.003));
    // коробка и две створки
    const fz = BACK - 0.13, f = 0.05, fd = 0.07;
    g.push(boxG(ww, f, fd, wcx, WIN.y1 - f / 2, fz), boxG(ww, f, fd, wcx, WIN.y0 + f / 2, fz),
      boxG(f, wh, fd, WIN.x0 + f / 2, wcy, fz), boxG(f, wh, fd, WIN.x1 - f / 2, wcy, fz));
    const s = 0.045, sw = (ww - 2 * f) / 2, sh = wh - 2 * f;
    for (const k of [0, 1]) {
      const x0 = WIN.x0 + f + k * sw, cx = x0 + sw / 2;
      g.push(boxG(sw, s, 0.055, cx, WIN.y1 - f - s / 2, fz + 0.01), boxG(sw, s, 0.055, cx, WIN.y0 + f + s / 2, fz + 0.01),
        boxG(s, sh, 0.055, x0 + s / 2, wcy, fz + 0.01), boxG(s, sh, 0.055, x0 + sw - s / 2, wcy, fz + 0.01));
    }
    add(merge(g), M.trim);
    // ручки
    add(merge([boxG(0.012, 0.11, 0.02, wcx - 0.03, wcy, fz + 0.05, 0.004), boxG(0.012, 0.11, 0.02, wcx + 0.03, wcy, fz + 0.05, 0.004)]), M.alu);
  }
  // вид за окном: кроп из autumn_park (тонмапленный JPG) на плоскости в 5 м за стеной
  {
    viewT.wrapS = viewT.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8.7, 6), new THREE.MeshBasicMaterial({ map: viewT, color: new THREE.Color(2.4, 2.35, 2.25) }));
    m.position.set(-3.6, 2.05, BACK - 5);
    world.add(m);
  }
  // шторы: две льняные панели в складку на штанге
  {
    const rodY = WIN.y1 + 0.2, cz = BACK + 0.08, hgt = rodY - 0.015;
    add(new THREE.CylinderGeometry(0.011, 0.011, ww + 1.1, 12).rotateZ(Math.PI / 2).translate(wcx, rodY + 0.02, cz), M.metalDark);
    for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.022, 12, 10).translate(wcx + sx * (ww / 2 + 0.56), rodY + 0.02, cz), M.metalDark);
    for (const [cx, w, ph] of [[WIN.x0 - 0.2, 0.52, 0.3], [WIN.x1 + 0.2, 0.52, 1.7]]) {
      const g = new THREE.PlaneGeometry(w, hgt, 72, 30), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), t = 0.5 - y / hgt; // 0 сверху → 1 снизу
        const amp = 0.026 + 0.014 * t;
        const z = amp * Math.sin(x * 41 + ph + 0.6 * Math.sin(x * 17 + ph)) + 0.012 * Math.sin(x * 97 + ph * 3 + y * 1.5) * (0.4 + t) + 0.004 * Math.sin(y * 9 + x * 30);
        p.setXYZ(i, x * (1 + 0.06 * t), y, z);
      }
      g.computeVertexNormals();
      g.translate(cx, rodY - hgt / 2, cz);
      projUV(g, 0.12);
      add(g, M.curtain);
    }
  }

  // ---------- стол ----------
  {
    const t = 0.032, y = DESK.top - t / 2;
    add(projUV(new RoundedBoxGeometry(DESK.w, t, DESK.d, 3, 0.008).translate(DESK.x, y, DESK.z), 0.5), M.desk);
    const lg = [], lh = DESK.top - t, ins = 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.02, 0.014, lh, 16).translate(DESK.x + sx * (DESK.w / 2 - ins), lh / 2, DESK.z + sz * (DESK.d / 2 - ins));
      lg.push(g);
    }
    const legs = merge(lg); lg.length = 0;
    const uv = legs.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.12, uv.getY(i) * 0.8);
    add(legs, M.desk);
    lg.push(boxG(DESK.w - 2 * ins, 0.07, 0.02, DESK.x, lh - 0.035, DESK.z - DESK.d / 2 + ins),
      boxG(DESK.w - 2 * ins, 0.07, 0.02, DESK.x, lh - 0.035, DESK.z + DESK.d / 2 - ins),
      boxG(0.02, 0.07, DESK.d - 2 * ins, DESK.x - DESK.w / 2 + ins, lh - 0.035, DESK.z),
      boxG(0.02, 0.07, DESK.d - 2 * ins, DESK.x + DESK.w / 2 - ins, lh - 0.035, DESK.z));
    add(merge(lg, 0.5), M.desk);
  }
  const TOP = DESK.top;

  // ---------- ноутбук ----------
  {
    const lp = I.laptop, g = new THREE.Group();
    g.position.set(lp.x, TOP, lp.z);
    world.add(g);
    const bt = 0.014;
    add(new RoundedBoxGeometry(lp.w, bt, lp.d, 3, 0.005).translate(0, bt / 2, 0), M.alu, g);
    // клавиатура (альфа-маска клавиш) и тачпад
    const kc = document.createElement('canvas'); kc.width = 1024; kc.height = 420;
    const kx = kc.getContext('2d');
    const rows = [14, 14, 13, 12, 11];
    kx.fillStyle = '#fff';
    rows.forEach((n, r) => {
      const kw = 1024 / 14.6, y = 8 + r * 82;
      const off = (14 - n) * kw / 2;
      for (let i = 0; i < n; i++) {
        const w = (r === 4 && i === 5) ? kw * 4 : kw;
        const x = off + i * kw + (r === 4 && i > 5 ? kw * 3 : 0);
        kx.beginPath(); kx.roundRect(x + 4, y, w - 8, 70, 8); kx.fill();
      }
    });
    const keysT = new THREE.CanvasTexture(kc); keysT.anisotropy = aniso;
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(lp.w * 0.86, lp.d * 0.42).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#1d1d20', roughness: 0.55, alphaMap: keysT, alphaTest: 0.5 }));
    keys.position.set(0, bt + 0.0006, -lp.d * 0.16); keys.receiveShadow = true; g.add(keys);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(lp.w * 0.38, lp.d * 0.3).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#c3c4c7', metalness: 0.6, roughness: 0.2 }));
    pad.position.set(0, bt + 0.0004, lp.d * 0.27); pad.receiveShadow = true; g.add(pad);
    // крышка на шарнире у задней кромки
    const lid = new THREE.Group();
    lid.position.set(0, bt, -lp.d / 2 + 0.004);
    lid.rotation.x = lp.lidAngle;
    g.add(lid);
    const lh = lp.d - 0.01, lt = 0.006;
    add(new RoundedBoxGeometry(lp.w, lh, lt, 3, 0.0025).translate(0, lh / 2, -lt / 2), M.alu, lid);
    const bez = new THREE.Mesh(new THREE.PlaneGeometry(lp.w - 0.004, lh - 0.004), new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.12 }));
    bez.position.set(0, lh / 2, 0.0003); lid.add(bez);
    // экран блокировки
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 660;
    const c = sc.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 1024, 660);
    gr.addColorStop(0, '#f7d3dc'); gr.addColorStop(0.55, '#eeb1c2'); gr.addColorStop(1, '#f2cdb9');
    c.fillStyle = gr; c.fillRect(0, 0, 1024, 660);
    for (const [x, y, r, a] of [[180, 140, 260, 0.35], [860, 520, 300, 0.3], [700, 120, 160, 0.25], [300, 560, 180, 0.2]]) {
      const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(255,245,240,${a})`); rg.addColorStop(1, 'rgba(255,245,240,0)');
      c.fillStyle = rg; c.fillRect(0, 0, 1024, 660);
    }
    c.fillStyle = '#fff'; c.textAlign = 'center';
    c.shadowColor = 'rgba(150,60,90,0.25)'; c.shadowBlur = 18;
    c.font = '300 150px "Segoe UI", system-ui, sans-serif'; c.fillText('16:40', 512, 270);
    c.font = '400 34px "Segoe UI", system-ui, sans-serif'; c.fillText('среда, 7 октября', 512, 330);
    c.font = '600 58px "Segoe UI", system-ui, sans-serif'; c.fillText('вместе 740 дней ♥', 512, 470);
    c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath(); c.arc(512, 580, 26, 0, Math.PI * 2); c.fill();
    const scrT = new THREE.CanvasTexture(sc); scrT.colorSpace = THREE.SRGBColorSpace; scrT.anisotropy = aniso;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(lp.w - 0.022, lh - 0.03),
      new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.08, emissive: '#ffffff', emissiveMap: scrT, emissiveIntensity: 0.6 }));
    scr.position.set(0, lh / 2 + 0.003, 0.0006); lid.add(scr);
  }

  // ---------- настольная лампа: керамическое основание + льняной абажур ----------
  let lampLight;
  {
    const lp = I.lamp, g = new THREE.Group(); g.position.set(lp.x, TOP, lp.z); world.add(g);
    const prof = [[0, 0], [0.055, 0], [0.062, 0.01], [0.075, 0.06], [0.078, 0.11], [0.068, 0.17], [0.042, 0.215], [0.02, 0.24], [0.018, 0.25], [0, 0.25]].map(([x, y]) => new THREE.Vector2(x, y));
    add(new THREE.LatheGeometry(prof, 40), new THREE.MeshStandardMaterial({ color: '#d9cfc2', roughness: 0.28 }), g);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 10).translate(0, 0.31, 0), M.brass, g);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.035, 14).translate(0, 0.36, 0), M.brass, g);
    const shadeMat = pbr(fabricT, { color: '#f3e9d8', ns: 0.6, side: THREE.DoubleSide, emissive: '#ffc48a', emissiveIntensity: 0.55 });
    shadeMat.map = null;
    const shade = add(projUV(new THREE.CylinderGeometry(0.115, 0.15, 0.19, 48, 1, true), 0.3).translate(0, lp.h - 0.095, 0), shadeMat, g, false);
    shade.castShadow = false;
    lampLight = new THREE.PointLight('#ffb06a', 0.35, 0, 2);
    lampLight.position.set(0, lp.h - 0.11, 0);
    g.add(lampLight);
  }

  // ---------- кружка ----------
  {
    const m = I.mug, g = new THREE.Group(); g.position.set(m.x, TOP, m.z); g.rotation.y = -0.6; world.add(g);
    const prof = [[0, 0], [0.034, 0], [0.039, 0.004], [0.041, 0.02], [0.041, 0.095], [0.037, 0.096], [0.036, 0.02], [0.03, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y));
    const mat = new THREE.MeshStandardMaterial({ color: '#d8a3a2', roughness: 0.22 });
    add(new THREE.LatheGeometry(prof, 40), mat, g);
    add(new THREE.TorusGeometry(0.026, 0.0065, 10, 24, Math.PI * 1.1).rotateZ(-Math.PI * 0.55).translate(0.041, 0.05, 0), mat, g);
    add(new THREE.CircleGeometry(0.0362, 32).rotateX(-Math.PI / 2).translate(0, 0.074, 0), new THREE.MeshStandardMaterial({ color: '#2a160c', roughness: 0.05 }), g);
  }

  // ---------- лоток с записками ----------
  {
    const t = I.tray, g = new THREE.Group(); g.position.set(t.x, TOP, t.z); g.rotation.y = 0.12; world.add(g);
    const r = 0.012, h = 0.028;
    add(projUV(merge([
      boxG(t.w, 0.008, t.d, 0, 0.004, 0, 0.002),
      boxG(t.w, h, r, 0, h / 2, -t.d / 2 + r / 2, 0.003), boxG(t.w, h, r, 0, h / 2, t.d / 2 - r / 2, 0.003),
      boxG(r, h, t.d - 2 * r, -t.w / 2 + r / 2, h / 2, 0, 0.003), boxG(r, h, t.d - 2 * r, t.w / 2 - r / 2, h / 2, 0, 0.003),
    ]), 0.5), M.walnut, g);
    const cols = ['#f6e58f', '#f4b8c4', '#f6e58f', '#f9f3e3', '#f4b8c4'];
    cols.forEach((col, i) => {
      const n = add(new THREE.BoxGeometry(0.076, 0.004, 0.076), new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 }), g);
      n.position.set(-0.06 + (i % 2) * 0.05 + i * 0.012, 0.01 + i * 0.0042, -0.01 + (i % 3) * 0.012);
      n.rotation.y = (rnd() - 0.5) * 0.7;
    });
    const pen = add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1f2a3a', roughness: 0.3 }), g);
    pen.position.set(0.07, 0.014, 0.05); pen.rotation.y = 0.5;
  }

  // ---------- скомканные записки: сфера с «заломами» (|sin| даёт острые складки), гладкие нормали ----------
  {
    const cols = ['#f4f1ea', '#f6e7a0', '#f5c6cf'];
    I.notes.forEach(([x, z], k) => {
      const g = new THREE.IcosahedronGeometry(0.027, 3), p = g.attributes.position, v = new THREE.Vector3();
      const dirs = Array.from({ length: 7 }, () => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize());
      const ph = dirs.map(() => rnd() * 6), fr = dirs.map(() => 90 + rnd() * 110);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        let d = 1;
        dirs.forEach((dv, j) => { d -= 0.08 * Math.abs(Math.sin(v.dot(dv) * fr[j] + ph[j])); });
        d += (rnd() - 0.5) * 0.06;
        v.multiplyScalar(d + 0.05); v.y *= 0.85;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.deleteAttribute('normal'); g.deleteAttribute('uv'); const gm = mergeVertices(g); gm.computeVertexNormals();
      const m = add(gm, new THREE.MeshStandardMaterial({ color: cols[k], roughness: 0.92, flatShading: true }));
      m.position.set(x, TOP + 0.0135, z); m.rotation.set(rnd() * 0.6, rnd() * 6, rnd() * 0.6);
    });
  }

  // ---------- растение на столе (Poly Haven potted_plant_04) ----------
  {
    const p = succulent.scene, s = I.plant.h / 0.27;
    p.scale.setScalar(s); p.position.set(I.plant.x, TOP, I.plant.z);
    p.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (/ground/i.test(o.name)) o.visible = false; } });
    world.add(p);
  }

  // ---------- полка с книгами ----------
  {
    const s = I.shelf, top = s.y + 0.0125;
    add(projUV(new RoundedBoxGeometry(s.w, 0.025, s.d, 2, 0.004).translate(s.x, s.y, BACK + s.d / 2), 0.9), M.walnut);
    const br = [];
    for (const dx of [-0.33, 0.33]) br.push(boxG(0.02, 0.14, 0.006, s.x + dx, s.y - 0.0125 - 0.07, BACK + 0.003), boxG(0.02, 0.006, s.d * 0.8, s.x + dx, s.y - 0.0155, BACK + s.d * 0.4));
    add(merge(br), M.metalDark);
    const cover = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, normalMap: fabricT[1], normalScale: new THREE.Vector2(0.5, 0.5) });
    const pages = new THREE.MeshStandardMaterial({ color: '#eee6d3', roughness: 0.9 });
    const books = [[0.032, 0.25, 0.18, '#b4644a'], [0.026, 0.23, 0.17, '#e1d6c2'], [0.042, 0.28, 0.19, '#5f6f5a'], [0.03, 0.24, 0.175, '#c99aa0']];
    let x = s.x - 0.17;
    books.forEach(([w, h, d, c], i) => {
      const mats = [cover(c), cover(c), pages, cover(c), cover(c), cover(c)];
      const b = add(projUV(new THREE.BoxGeometry(w, h, d), 0.25), mats);
      b.position.set(x + w / 2, top + h / 2, BACK + 0.01 + d / 2); x += w + 0.003;
      if (i === 3) { b.rotation.z = -0.13; b.position.x += 0.016; b.position.y -= 0.002; }
    });
    // две лежащие стопкой
    [[0.2, 0.032, 0.15, '#2f3b4f'], [0.18, 0.026, 0.14, '#d7b56d']].forEach(([w, h, d, c], i) => {
      const mats = [pages, pages, cover(c), cover(c), cover(c), pages];
      const b = add(projUV(new THREE.BoxGeometry(w, h, d), 0.25), mats);
      b.position.set(s.x + 0.3, top + h / 2 + (i ? 0.032 : 0), BACK + 0.012 + d / 2); b.rotation.y = i ? 0.08 : -0.03;
    });
  }

  // ---------- полароиды на стене ----------
  {
    const paper = new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.82 });
    const tape = new THREE.MeshStandardMaterial({ color: '#f2c9cf', roughness: 0.7, transparent: true, opacity: 0.75 });
    const pw = 0.11, ph = 0.13;
    I.photos.forEach(([x, y, tilt], i) => {
      const g = new THREE.Group(); g.position.set(x, y, BACK + 0.002); g.rotation.set((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.06, tilt); world.add(g);
      add(new THREE.BoxGeometry(pw, ph, 0.0012).translate(0, 0, 0.0006), paper, g);
      const ph2 = new THREE.Mesh(new THREE.PlaneGeometry(pw * 0.86, pw * 0.86), new THREE.MeshStandardMaterial({ map: photos[i], roughness: 0.3 }));
      ph2.position.set(0, ph / 2 - 0.007 - pw * 0.43, 0.0013); ph2.receiveShadow = true; g.add(ph2);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.016), tape);
      t.position.set((rnd() - 0.5) * 0.02, ph / 2 - 0.002, 0.0016); t.rotation.z = (rnd() - 0.5) * 0.5; g.add(t);
    });
  }

  // ---------- гирлянда вдоль задней стены ----------
  {
    const li = I.lights, z = BACK + 0.03, pts = [], hooks = 8, sag = 0.05;
    const span = (li.x1 - li.x0 - 0.2) / hooks;
    for (let i = 0; i <= hooks * 10; i++) {
      const u = i / 10, k = u - Math.floor(u);
      pts.push(new THREE.Vector3(li.x0 + 0.1 + u * span, li.y - sag * 4 * k * (1 - k) * (u >= hooks ? 0 : 1), z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    add(new THREE.TubeGeometry(curve, 400, 0.0016, 5), new THREE.MeshStandardMaterial({ color: '#2d2a22', roughness: 0.6 }), world, false);
    const n = 44, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 12, 8).scale(1, 1.25, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 4.3, 2.1) }), n);
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 8), M.metalDark, n);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const p = curve.getPointAt((i + 0.5) / n);
      mtx.makeTranslation(p.x, p.y - 0.026, p.z + 0.004); bulbs.setMatrixAt(i, mtx);
      mtx.makeTranslation(p.x, p.y - 0.01, p.z + 0.004); caps.setMatrixAt(i, mtx);
    }
    world.add(bulbs, caps);
    // мягкий тёплый ореол на стене под гирляндой (дешёвая замена десятков точечных ламп)
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 128;
    const gx = gc.getContext('2d'), gg = gx.createLinearGradient(0, 0, 0, 128);
    gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.35, 'rgba(255,255,255,1)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = gg; gx.fillRect(0, 0, 4, 128);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, 0.5), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(gc), color: new THREE.Color(0.11, 0.06, 0.025), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.set(0, li.y - 0.09, BACK + 0.004); world.add(glow);
  }

  // ---------- ковёр ----------
  {
    const r = I.rug;
    add(projUV(new THREE.CylinderGeometry(r.r, r.r, 0.012, 96, 1), 0.55).translate(r.x, 0.006, r.z), M.rug);
  }

  // ---------- большое растение (Poly Haven pachira_aquatica_01, вариант d) в керамическом кашпо ----------
  {
    const bp = I.bigPlant, g = new THREE.Group(); g.position.set(bp.x, 0, bp.z); world.add(g);
    const potH = 0.42;
    const prof = [[0, 0.01], [0.14, 0.0], [0.15, 0.02], [0.19, potH - 0.02], [0.195, potH], [0.18, potH], [0.17, potH - 0.04], [0, potH - 0.04]].map(([x, y]) => new THREE.Vector2(x, y));
    add(projUV(new THREE.LatheGeometry(prof, 48), 0.35), pbr(plasterT, { color: '#d6cfc4', ns: 0.5, roughness: 0.7 }), g);
    add(new THREE.CircleGeometry(0.172, 32).rotateX(-Math.PI / 2).translate(0, potH - 0.035, 0), new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 1 }), g);
    const tree = new THREE.Group();
    for (const o of [...pachira.scene.children]) if (/_d$/.test(o.name)) { o.position.set(0, 0, 0); tree.add(o); }
    tree.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    tree.scale.setScalar(0.82); tree.position.y = potH - 0.04; tree.rotation.y = 2.2;
    g.add(tree);
  }

  // ---------- запечённые контактные тени (декали) ----------
  // Небесный и отражённый свет у нас без теней, поэтому под столом/предметами и в углах их «дорисовываем»
  // мягкими пятнами затемнения: canvas с размытыми фигурами → alphaMap. Сцена статична — это честный бейк, 3 draw call'а.
  function decal(w, h, ppm, draw, opacity) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w * ppm); c.height = Math.ceil(h * ppm);
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    const P = (m) => m * ppm;
    const shape = (fn, a, blurM) => { x.filter = `blur(${Math.max(0.5, P(blurM))}px)`; x.fillStyle = `rgba(255,255,255,${a})`; x.beginPath(); fn(); x.fill(); x.filter = 'none'; };
    draw({
      ell: (cx, cy, rx, ry, a, b) => shape(() => x.ellipse(P(cx), P(cy), P(rx), P(ry), 0, 0, Math.PI * 2), a, b),
      rect: (x0, y0, x1, y1, a, b) => shape(() => x.rect(P(x0), P(y0), P(x1 - x0), P(y1 - y0)), a, b),
      grad: (x0, y0, x1, y1, a0, a1) => { const g = x.createLinearGradient(P(x0), P(y0), P(x1), P(y1)); g.addColorStop(0, `rgba(255,255,255,${a0})`); g.addColorStop(1, `rgba(255,255,255,${a1})`); x.fillStyle = g; x.fillRect(Math.min(P(x0), P(x1)), Math.min(P(y0), P(y1)), Math.abs(P(x1 - x0)) || c.width, Math.abs(P(y1 - y0)) || c.height); },
    });
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#1c130d', alphaMap: t, transparent: true, opacity, depthWrite: false }));
    world.add(m);
    return m;
  }
  { // столешница: (0,0) = левый задний угол стола
    const x0 = DESK.x - DESK.w / 2, z0 = DESK.z - DESK.d / 2, L2 = (x, z) => [x - x0, z - z0];
    const m = decal(DESK.w, DESK.d, 400, ({ ell, rect }) => {
      const lp = I.laptop, [lx, lz] = L2(lp.x, lp.z);
      rect(lx - lp.w / 2 + 0.004, lz - lp.d / 2 + 0.004, lx + lp.w / 2 - 0.004, lz + lp.d / 2 - 0.004, 0.9, 0.006);
      rect(lx - lp.w / 2 - 0.03, lz - lp.d / 2 - 0.06, lx + lp.w / 2 + 0.03, lz + lp.d / 2 + 0.02, 0.55, 0.05);
      const [ax, az] = L2(I.lamp.x, I.lamp.z); ell(ax, az, 0.064, 0.064, 0.9, 0.008); ell(ax, az, 0.12, 0.12, 0.55, 0.05);
      const [mx, mz] = L2(I.mug.x, I.mug.z); ell(mx, mz, 0.046, 0.046, 0.95, 0.006); ell(mx, mz, 0.08, 0.08, 0.65, 0.03);
      const [px, pz] = L2(I.plant.x, I.plant.z); ell(px, pz, 0.08, 0.08, 0.9, 0.008); ell(px, pz, 0.14, 0.14, 0.55, 0.05);
      const t = I.tray, [tx, tz] = L2(t.x, t.z); rect(tx - t.w / 2, tz - t.d / 2, tx + t.w / 2, tz + t.d / 2, 0.5, 0.012); rect(tx - t.w / 2 - 0.02, tz - t.d / 2 - 0.02, tx + t.w / 2 + 0.02, tz + t.d / 2 + 0.02, 0.2, 0.03);
      for (const [nx, nz] of I.notes) { const [a, b] = L2(nx, nz); ell(a, b, 0.016, 0.016, 1, 0.004); ell(a, b, 0.032, 0.032, 0.7, 0.012); }
    }, 0.85);
    m.geometry.rotateX(-Math.PI / 2); m.position.set(DESK.x, TOP + 0.0008, DESK.z);
  }
  { // пол у задней стены: x −3…3, z от стены до −0.6
    const d = 1.4, ins = 0.06;
    const m = decal(ROOM.w, d, 200, ({ ell, rect, grad }) => {
      grad(0, 0, 0, 0.18, 0.55, 0);                                  // угол пол-стена
      rect(HX + DESK.x - DESK.w / 2 + 0.05, DESK.z - DESK.d / 2 - BACK + 0.02, HX + DESK.x + DESK.w / 2 - 0.05, DESK.z + DESK.d / 2 - BACK - 0.05, 0.45, 0.14);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ell(HX + DESK.x + sx * (DESK.w / 2 - ins), DESK.z + sz * (DESK.d / 2 - ins) - BACK, 0.025, 0.025, 0.9, 0.012);
      ell(HX + I.bigPlant.x, I.bigPlant.z - BACK, 0.17, 0.17, 0.9, 0.02); ell(HX + I.bigPlant.x, I.bigPlant.z - BACK, 0.3, 0.3, 0.35, 0.1);
      for (const cx of [WIN.x0 - 0.2, WIN.x1 + 0.2]) rect(HX + cx - 0.28, 0.02, HX + cx + 0.28, 0.13, 0.5, 0.04);
    }, 0.8);
    m.geometry.rotateX(-Math.PI / 2); m.position.set(0, 0.0015, BACK + d / 2);
  }
  { // задняя стена (по высоте от потолка вниз)
    const m = decal(ROOM.w, H, 120, ({ ell, rect, grad }) => {
      grad(0, H, 0, H - 0.22, 0.5, 0); grad(0, 0, 0, 0.12, 0.35, 0);
      rect(HX + DESK.x - DESK.w / 2 + 0.04, H - TOP + 0.03, HX + DESK.x + DESK.w / 2 - 0.04, H - 0.02, 0.3, 0.1);
      rect(HX + DESK.x - DESK.w / 2 + 0.1, H - TOP + 0.02, HX + DESK.x + DESK.w / 2 - 0.1, H - TOP + 0.16, 0.35, 0.07);
      ell(HX + I.bigPlant.x, H - 1.0, 0.45, 0.8, 0.2, 0.25);
      const s = I.shelf; rect(HX + s.x - s.w / 2, H - s.y + 0.01, HX + s.x + s.w / 2, H - s.y + 0.07, 0.35, 0.03);
    }, 0.85);
    m.position.set(0, H / 2, BACK + 0.034);
  }

  // ---------- свет ----------
  const sunDir = new THREE.Vector3(...SUN.dir).normalize();
  const sun = new THREE.DirectionalLight(SUN.color, 7.0);
  const tgt = new THREE.Vector3(0, H / 2, (BACK + FRONT) / 2);
  sun.target.position.copy(tgt);
  sun.position.copy(tgt).addScaledVector(sunDir, -9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012;
  {
    // ортокамера тени ровно по коробке комнаты (с запасом под стену/потолок, которые отбрасывают тень)
    const lookM = new THREE.Matrix4().lookAt(sun.position, tgt, new THREE.Vector3(0, 1, 0)), inv = lookM.clone().invert();
    const v = new THREE.Vector3(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const x of [-HX, HX]) for (const y of [0, H]) for (const z of [BACK - T, FRONT]) {
      v.set(x, y, z).sub(sun.position).applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, -v.z); z1 = Math.max(z1, -v.z);
    }
    Object.assign(sun.shadow.camera, { left: x0 - 0.05, right: x1 + 0.05, bottom: y0 - 0.05, top: y1 + 0.05, near: Math.max(0.1, z0 - 0.5), far: z1 + 0.5 });
    sun.shadow.camera.updateProjectionMatrix();
  }
  world.add(sun, sun.target);
  // небесный свет из проёма: широкий мягкий прожектор из-за окна в комнату (дешевле RectAreaLight на встроенной графике;
  // стена с окном к нему под скользящим углом и почти не светится — как в жизни)
  const sky = new THREE.SpotLight('#e4ecf7', 9, 0, 1.25, 1, 2);
  sky.position.set(wcx, wcy, BACK - 0.35);
  sky.target.position.set(wcx + 0.9, 0.5, 0.8);
  world.add(sky, sky.target);
  // отражённый свет от солнечного пятна на полу (дешёвая подмена GI): тёплая точка без тени низко над пятном
  const bounce = new THREE.PointLight('#ffd9b0', 1.6, 0, 2);
  bounce.position.set(0.45, 0.35, 0.1);
  world.add(bounce);

  // ---------- окружение: HDRI → зонд комнаты (2 отскока) ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.35;
  hdr.dispose();
  const probe = new THREE.Vector3(0, 1.25, -0.4);
  renderer.setClearColor('#c9d8e6');
  let probeRT = null;
  for (let pass = 0; pass < 2; pass++) {
    world.position.copy(probe).negate(); world.updateMatrixWorld(true);
    const rt = pmrem.fromScene(scene, 0, 0.05, 30);
    world.position.set(0, 0, 0); world.updateMatrixWorld(true);
    if (probeRT) probeRT.dispose();
    probeRT = rt;
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.6;
  }
  pmrem.dispose();

  // ---------- пост-обработка (свой короткий конвейер вместо EffectComposer) ----------
  // 1) сцена → HDR-цель с MSAA 4x (+ глубина); 2) GTAO на половине разрешения по этой глубине (нормали из глубины,
  // повторного рендера сцены нет); 3) bloom: яркое → 1/4 → 1/8 → 1/16 с раздельным гауссом; 4) финал: AO × цвет + bloom → AgX → sRGB.
  const HF = { type: THREE.HalfFloatType };
  // MSAA на встроенной графике стоил 3 мс (pr 1) и 14 мс (pr 1.5) — вместо него FXAA по LDR-кадру
  const msRT = new THREE.WebGLRenderTarget(16, 16, HF);
  msRT.depthTexture = new THREE.DepthTexture(16, 16);
  msRT.depthTexture.type = THREE.UnsignedIntType;
  const gtao = new GTAOPass(scene, camera, 16, 16);
  gtao.setGBuffer(msRT.depthTexture); // своя G-буфер-цель GTAO остаётся, но не рисуется (setSize/setGBuffer её ждут)
  gtao.updateGtaoMaterial({ radius: 0.25, distanceExponent: 1, thickness: 1, scale: 1, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 3, rings: 2, samples: 12 });
  gtao.output = GTAOPass.OUTPUT.Denoise;
  const dummyRT = new THREE.WebGLRenderTarget(1, 1);

  const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qCam = new THREE.Camera();
  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quad, qCam); };
  const bright = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.4 } }, vertexShader: vs, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D t; uniform vec2 texel; uniform float threshold; varying vec2 vUv;
      void main(){ vec3 c = 0.25 * (texture2D(t, vUv + texel * vec2(-1., -1.)).rgb + texture2D(t, vUv + texel * vec2(1., -1.)).rgb
        + texture2D(t, vUv + texel * vec2(-1., 1.)).rgb + texture2D(t, vUv + texel * vec2(1., 1.)).rgb);
        float l = max(c.r, max(c.g, c.b)); c *= max(l - threshold, 0.) / max(l, 1e-4); gl_FragColor = vec4(min(c, vec3(40.)), 1.); }`,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: vs, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb * 0.2270;
        c += (texture2D(t, vUv + dir * 1.3846).rgb + texture2D(t, vUv - dir * 1.3846).rgb) * 0.3162;
        c += (texture2D(t, vUv + dir * 3.2308).rgb + texture2D(t, vUv - dir * 3.2308).rgb) * 0.0703;
        gl_FragColor = vec4(c, 1.); }`,
  });
  const copy = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: vs, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }' });
  const lv = [0, 1, 2].map(() => [new THREE.WebGLRenderTarget(4, 4, HF), new THREE.WebGLRenderTarget(4, 4, HF)]);
  const final = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: msRT.texture }, tAO: { value: gtao.pdRenderTarget.texture }, aoK: { value: 1.0 },
      tB0: { value: lv[0][0].texture }, tB1: { value: lv[1][0].texture }, tB2: { value: lv[2][0].texture }, bloomK: { value: 0.35 },
      toneMappingExposure: { value: 1 }, sat: { value: 1.08 }, contrast: { value: 1.06 },
    },
    vertexShader: vs, depthTest: false, depthWrite: false, toneMapped: false, // тонмаппинг делаем сами (AgX ниже)
    fragmentShader: `uniform sampler2D tColor, tAO, tB0, tB1, tB2; uniform float aoK, bloomK, sat, contrast; varying vec2 vUv;
      #include <tonemapping_pars_fragment>
      void main(){
        vec3 c = texture2D(tColor, vUv).rgb * max(mix(1., texture2D(tAO, vUv).r, aoK), 0.);
        c += bloomK * (texture2D(tB0, vUv).rgb * 0.5 + texture2D(tB1, vUv).rgb * 0.3 + texture2D(tB2, vUv).rgb * 0.2);
        c = AgXToneMapping(c);
        // лёгкий «look» поверх AgX: чуть плотнее тени и чуть насыщеннее (AgX сам по себе серит)
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(mix(vec3(l), c, sat), 0.);
        c = pow(c, vec3(contrast));
        vec2 q = vUv - 0.5; c *= 1. - 0.22 * dot(q, q) * 2.; // мягкая виньетка объектива
        gl_FragColor = sRGBTransferOETF(vec4(c, 1.));
      }`,
  });
  const ldrRT = new THREE.WebGLRenderTarget(16, 16);
  const fxaa = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), vertexShader: vs, fragmentShader: FXAAShader.fragmentShader, depthTest: false, depthWrite: false });
  fxaa.uniforms.tDiffuse.value = ldrRT.texture;
  let W = 16, Hh = 16;

  // сцена и солнце статичны — карту теней рисуем один раз (и после resize на всякий случай)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const fx = { ao: true, bloom: true, aoK: 0.9 };
  return {
    dbg: { gtao, final, bright, fx, sun, sky, bounce, lampLight, M, msRT },
    render() {
      final.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      renderer.setRenderTarget(msRT);
      renderer.render(scene, camera);
      if (fx.ao) gtao.render(renderer, dummyRT, null);
      final.uniforms.aoK.value = fx.ao ? fx.aoK : 0;
      if (fx.bloom) {
        let src = msRT.texture, sw = W, sh = Hh;
        lv.forEach(([a, b], k) => {
          const m = k ? copy : bright;
          m.uniforms.t.value = src; if (!k) bright.uniforms.texel.value.set(0.5 / sw, 0.5 / sh);
          pass(m, a);
          blur.uniforms.t.value = a.texture; blur.uniforms.dir.value.set(1 / a.width, 0); pass(blur, b);
          blur.uniforms.t.value = b.texture; blur.uniforms.dir.value.set(0, 1 / a.height); pass(blur, a);
          src = a.texture; sw = a.width; sh = a.height;
        });
      }
      final.uniforms.bloomK.value = fx.bloom ? 0.35 : 0;
      pass(final, ldrRT);
      pass(fxaa, null);
    },
    resize(w, h, pr) {
      W = Math.round(w * pr); Hh = Math.round(h * pr);
      msRT.setSize(W, Hh); ldrRT.setSize(W, Hh);
      fxaa.uniforms.resolution.value.set(1 / W, 1 / Hh);
      gtao.setSize(Math.round(w / 2), Math.round(h / 2)); // AO в половине CSS-разрешения (на pr 1.5 — треть)
      lv.forEach(([a, b], k) => { const d = 4 << k; a.setSize(Math.ceil(w / d), Math.ceil(h / d)); b.setSize(Math.ceil(w / d), Math.ceil(h / d)); });
      renderer.shadowMap.needsUpdate = true;
    },
  };
}
