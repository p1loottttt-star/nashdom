// Два живых котика: чёрный (Ваня) и белая (Соня).
// Тело — одна поверхность на скелете (catmesh.js), позы смешиваются плавно, поведение — сценки, которые режиссёр выбирает случайно.
import * as THREE from 'three';
import * as sfx from './sound.js';
import { createNav } from './nav.js';
import { buildRig } from './catmesh.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// позы: высота тела, наклон/крен, суставы передних (fu, fl) и задних (bu, bl) лап, голова, хвост, глаза, доп. движения
const BASE = { y: 0.144, pitch: 0, roll: 0, curl: 0, fu: 0, fl: 0, bu: 0, bl: 0, hp: 0.1, hy: 0, tz: 0.22, ty: 0, eyes: 1, scr: 0, bat: 0, groom: 0, wiggle: 0 };
const POSES = {
  stand: {},
  sit: { y: 0.1, pitch: 0.55, fu: -0.55, bu: 1.15, bl: -2.3, hp: -0.45, tz: -0.05, ty: 0.35 },
  groom: { y: 0.1, pitch: 0.55, fu: -0.55, bu: 1.15, bl: -2.3, hp: -0.45, tz: -0.05, ty: 0.35, groom: 1 },
  loaf: { y: 0.052, fu: 1.5, fl: -0.2, bu: 1.35, bl: -2.6, hp: 0.05, tz: -0.03, ty: 0.32 },
  sleep: { y: 0.05, roll: 0.2, curl: 0.55, fu: 1.4, fl: -2.4, bu: 1.4, bl: -2.6, hp: -0.55, hy: 0.85, tz: -0.04, ty: 0.42, eyes: 0 },
  side: { y: 0.05, roll: 1.35, fu: 0.7, fl: -0.4, bu: 0.5, bl: -0.3, hp: 0.25, hy: 0.25, tz: 0, ty: 0.15, bat: 1 },
  crouch: { y: 0.085, pitch: -0.12, fu: 0.6, fl: -1.1, bu: 0.95, bl: -1.9, hp: 0.25, tz: 0.05 },
  stalk: { y: 0.075, pitch: -0.1, fu: 0.6, fl: -1.15, bu: 0.95, bl: -1.95, hp: 0.3, tz: 0.05, wiggle: 1 },
  leap: { fu: 1.1, fl: -0.2, bu: -0.9, bl: 0.4, tz: 0.1 },
  scratch: { y: 0.17, pitch: 1.05, fu: 0.2, fl: -0.3, bu: -1.0, bl: 0.3, hp: -0.9, tz: -0.2, scr: 1 },
};
for (const k in POSES) POSES[k] = { ...BASE, ...POSES[k] };

export function createCats({ scene, camera, TOP, floatAt, deskObstacles, floorObstacles }) {
  const SILL = 1.21;
  let nav = createNav({ TOP, SILL, deskObstacles, floorObstacles });

  // когтеточка и клубок
  const post = new THREE.Group(); post.position.set(-1.4, 0, -1.7); scene.add(post);
  const carpet = new THREE.MeshPhysicalMaterial({ color: '#e8d2c0', roughness: 1, sheen: 1, sheenColor: '#fff' });
  const ropeTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 256 }), x = c.getContext('2d');
    x.fillStyle = '#c9a77c'; x.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 8) { x.fillStyle = 'rgba(90,60,30,.45)'; x.fillRect(0, y, 64, 2); x.fillStyle = 'rgba(255,240,210,.25)'; x.fillRect(0, y + 3, 64, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t;
  })();
  const pm = (geo, mat, x, y, z) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; post.add(me); return me; };
  pm(new THREE.BoxGeometry(0.34, 0.03, 0.3), carpet, 0, 0.015, 0);
  pm(new THREE.CylinderGeometry(0.05, 0.05, 0.56, 24), new THREE.MeshStandardMaterial({ map: ropeTex, bumpMap: ropeTex, roughness: 1 }), 0, 0.31, 0);
  pm(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 32), carpet, 0, 0.6, 0);
  pm(new THREE.CylinderGeometry(0.0015, 0.0015, 0.16, 4), new THREE.MeshBasicMaterial({ color: '#7a6a5a' }), 0.12, 0.52, 0.04);
  const pom = pm(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#f58fa8', sheen: 1, roughness: 1 }), 0.12, 0.44, 0.04);

  const yarnTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 64 }), x = c.getContext('2d');
    x.fillStyle = '#f3a6b8'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = 'rgba(180,70,100,.5)'; x.lineWidth = 2;
    for (let i = -64; i < 128; i += 7) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 40, 64); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const yarn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), new THREE.MeshPhysicalMaterial({ map: yarnTex, roughness: 1, sheen: 1, sheenColor: '#ffd0dc' }));
  yarn.position.set(0.35, 0.045, -0.3); yarn.castShadow = yarn.receiveShadow = true; scene.add(yarn);
  const yarnV = V();

  const cats = [];
  class Cat {
    constructor(name, opts, spotName) {
      const sp = nav.spot(spotName);
      this.name = name;
      this.rig = buildRig(opts);
      this.root = this.rig.root;
      this.root.position.copy(sp.pos);
      this.level = sp.level; this.at = spotName; this.heading = sp.face; this.pose = 'sleep';
      this.cur = { ...POSES.sleep };
      this.walking = false; this.walkBlend = 0; this.phase = 0; this.jumpPitch = 0;
      this.task = null; this.look = null; this.lookYaw = 0; this.lookPitch = 0; this.lookW = 0;
      this.alert = 0; this.alertBlend = 0; this.blink = 0; this.nextBlink = 2 + rnd() * 3; this.nextZ = 2 + rnd() * 2; this.nextTwitch = 3;
      this.root.userData.act = () => this.react();
      scene.add(this.root);
    }
    run(fn) { return new Promise((res) => { this.task = { fn, res }; }); }
    face(h) {
      return this.run((dt) => { const d = angDiff(this.heading, h); this.heading += Math.sign(d) * Math.min(Math.abs(d), dt * 4); return Math.abs(d) < 0.02; });
    }
    async standUp() { if (this.pose !== 'stand') { this.pose = 'stand'; await wait(0.45); } }
    // идёт по точкам пути: движется точно по линии, а голова/тело плавно доворачивают
    async walkPath(pts) {
      if (!pts || pts.length < 2) return;
      await this.standUp();
      const first = pts[1].clone().sub(this.root.position);
      if (first.lengthSq() > 1e-6) await this.face(Math.atan2(-first.z, first.x));
      const rest = pts.map((_, i) => 0);
      for (let i = pts.length - 2; i >= 0; i--) rest[i] = rest[i + 1] + pts[i].distanceTo(pts[i + 1]);
      this.walking = true;
      let k = 1, speed = 0;
      await this.run((dt) => {
        const tgt = pts[k], to = tgt.clone().sub(this.root.position); to.y = 0;
        const d = to.length();
        if (d < 0.008) { this.root.position.set(tgt.x, tgt.y, tgt.z); return ++k >= pts.length; }
        const diff = angDiff(this.heading, Math.atan2(-to.z, to.x));
        this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 4.5);
        // разгон, сбавить в повороте, мягко затормозить к концу пути
        const left = d + rest[k], vmax = 0.32 * Math.max(0.18, Math.cos(diff));
        speed = Math.min(speed + dt * 0.9, vmax, Math.sqrt(2 * 0.8 * left) + 0.02);
        const step = Math.min(d, speed * dt);
        this.root.position.addScaledVector(to.normalize(), step);
        this.root.position.y = tgt.y;
        this.phase += step / 0.17;
        return false;
      });
      this.walking = false;
    }
    async jumpTo(p, level = this.level) {
      const start = this.root.position.clone(), dir = p.clone().sub(start), flat = Math.hypot(dir.x, dir.z);
      await this.standUp();
      await this.face(Math.atan2(-dir.z, dir.x));
      this.pose = 'crouch'; await wait(0.4);
      this.pose = 'leap';
      const T = 0.45 + Math.min(0.25, flat * 0.15), arc = 0.1 + Math.max(0, dir.y) * 0.55;
      let t = 0;
      await this.run((dt) => {
        t = Math.min(1, t + dt / T);
        this.root.position.set(start.x + dir.x * t, start.y + dir.y * t + 4 * arc * t * (1 - t), start.z + dir.z * t);
        this.jumpPitch = Math.atan2(dir.y + 4 * arc * (1 - 2 * t), Math.max(flat, 0.05)) * 0.5;
        return t >= 1;
      });
      this.root.position.copy(p);
      this.level = level; this.jumpPitch = 0; sfx.paws();
      this.pose = 'crouch'; await wait(0.22); this.pose = 'stand';
    }
    // дойти до места: путь в обход предметов и другого кота, с прыжками между уровнями
    async go(spotName) {
      const sp = nav.spot(spotName);
      const others = cats.filter((c) => c !== this && c.root.visible).map((c) => ({ level: c.level, x: c.root.position.x, z: c.root.position.z }));
      const steps = nav.plan(this.level, this.root.position, sp, others);
      if (!steps) return false;
      this.at = null;
      for (const st of steps) {
        if (st.type === 'walk') await this.walkPath(st.pts);
        else await this.jumpTo(st.to, st.level);
      }
      this.at = spotName;
      if (sp.face !== undefined) await this.face(sp.face);
      return true;
    }
    onDesk() { return this.level === 'desk' && this.root.visible; }
    react(text) {
      this.alert = 1.8;
      text ||= pick(['мур ♥', 'мяу', '♥', this.pose === 'sleep' ? 'не буди…' : 'мрр?']);
      (text.startsWith('мур') || text === '♥' || text === 'мрр?' ? sfx.purr : sfx.meow)();
      floatAt(this.rig.head, text);
    }
    update(dt, s) {
      if (this.task && this.task.fn(dt)) { const r = this.task.res; this.task = null; r(); }
      const P = POSES[this.pose], c = this.cur, k = this.pose === 'leap' || this.pose === 'crouch' ? 12 : 4;
      for (const key in P) c[key] = damp(c[key], P[key], k, dt);
      this.walkBlend = damp(this.walkBlend, this.walking ? 1 : 0, 7, dt);
      this.alert = Math.max(0, this.alert - dt);
      this.alertBlend = damp(this.alertBlend, this.alert > 0 ? 1 : 0, 8, dt);
      const yr = dt > 0 ? angDiff(this.prevHeading ?? this.heading, this.heading) / dt : 0;
      this.prevHeading = this.heading;
      this.yawRate = damp(this.yawRate || 0, clamp(yr, -4, 4), 5, dt);
      const r = this.rig, wb = this.walkBlend, ph = this.phase, al = this.alertBlend, yaw = this.yawRate;

      r.root.rotation.y = this.heading;
      // походка в четыре такта: задняя левая → передняя левая → задняя правая → передняя правая.
      // 62% цикла лапа стоит и уезжает назад, 38% — быстро переносится вперёд с подъёмом
      const gait = (off) => {
        const p = (((ph + off) % 1) + 1) % 1;
        if (p < 0.62) return [1 - 2 * (p / 0.62), 0];
        const q = (p - 0.62) / 0.38;
        return [-1 + 2 * q * q * (3 - 2 * q), Math.sin(q * Math.PI)];
      };
      const bob = Math.abs(Math.sin(ph * Math.PI * 2)) * 0.006 * wb, sway = Math.sin(ph * Math.PI * 2);
      r.body.position.y = c.y + bob + al * 0.006;
      r.body.position.x = Math.sin(s * 9) * 0.006 * c.wiggle;
      r.body.rotation.z = c.pitch + this.jumpPitch + Math.sin(ph * Math.PI * 4) * 0.018 * wb;
      r.body.rotation.x = c.roll * (1 - al * 0.4) + Math.sin(s * 9) * 0.06 * c.wiggle + sway * 0.03 * wb - yaw * 0.05 * wb;
      const offs = [0.25, 0.75, 0, 0.5]; // FL FR BL BR
      r.legs.forEach((L, i) => {
        const [sw, lift] = gait(offs[i]);
        let up = (L.front ? c.fu : c.bu) + sw * (L.front ? 0.4 : 0.46) * wb;
        let lo = L.front ? c.fl - lift * 1.05 * wb : c.bl + lift * 0.95 * wb - 0.12 * wb;
        if (L.front) {
          up += Math.sin(s * 9 + (L.left ? 0 : Math.PI)) * 0.35 * c.scr;
          up += Math.sin(s * 7 + (L.left ? 0 : 2)) * 0.5 * c.bat;
          if (L.left) { up += 1.2 * c.groom; lo -= 1.2 * c.groom; }
        }
        L.hip.rotation.z = up; L.knee.rotation.z = lo;
      });

      // взгляд: на камеру, на другого кота, на точку; в покое кот сам оглядывается
      const idle = !this.walking && !this.look && c.eyes > 0.5 && ['sit', 'loaf', 'stand'].includes(this.pose);
      this.idleT = (this.idleT ?? 2) - dt;
      if (this.idleT < 0) {
        this.idleT = 2.5 + rnd() * 4;
        this.idleLook = idle && rnd() < 0.7 ? (rnd() < 0.35 ? 'camera' : V(this.root.position.x + (rnd() - 0.5) * 2, 0.4 + rnd() * 1.2, this.root.position.z + (rnd() - 0.2) * 2)) : null;
      }
      const look = this.look || (idle ? this.idleLook : null);
      if (look) {
        const tgt = look === 'camera' ? camera.position : look.isObject3D ? look.getWorldPosition(V()) : look;
        const d = tgt.clone().sub(r.neck.getWorldPosition(V())).applyAxisAngle(V(0, 1, 0), -this.heading);
        this.lookYaw = damp(this.lookYaw, clamp(Math.atan2(-d.z, d.x), -1.3, 1.3), 3.5, dt);
        this.lookPitch = damp(this.lookPitch, clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.6) - c.pitch, 3.5, dt);
      }
      this.lookW = damp(this.lookW, look ? 1 : 0, 2.5, dt);
      const lw = this.lookW;
      r.neck.rotation.y = (c.hy * (1 - lw) + this.lookYaw * lw) * (1 - al * 0.5) + yaw * 0.14;
      // голова гасит покачивание тела при шаге
      r.neck.rotation.z = c.hp * (1 - lw * 0.5) + this.lookPitch * lw * 0.8 + al * 0.45 + c.groom * (-0.35 + Math.sin(s * 7) * 0.12) - Math.sin(ph * Math.PI * 4) * 0.018 * wb;

      // моргание, уши, дыхание
      this.nextBlink -= dt;
      if (this.nextBlink < 0) { this.blink = 0.12; this.nextBlink = 2.5 + rnd() * 4; }
      this.blink = Math.max(0, this.blink - dt);
      const open = (c.eyes > 0.5 || al > 0.5) && this.blink === 0;
      r.eyesOpen.forEach((e) => (e.visible = open));
      r.eyesClosed.forEach((e) => (e.visible = !open));
      this.nextTwitch -= dt;
      if (this.nextTwitch < 0) { this.nextTwitch = 2 + rnd() * 5; this.twitch = { ear: Math.floor(rnd() * 2), t: 0 }; }
      r.ears.forEach((e, i) => {
        let z = -0.1 - al * 0.25;
        if (this.twitch?.ear === i && this.twitch.t < 0.35) z += Math.sin((this.twitch.t / 0.35) * Math.PI * 2) * 0.4;
        e.rotation.z = z;
      });
      if (this.twitch) this.twitch.t += dt;
      // дыхание и изгиб позвоночника (во сне — клубком, на ходу — в сторону поворота)
      const br = Math.sin(s * (this.pose === 'sleep' ? 1.9 : 2.8));
      r.body.position.y += br * (this.pose === 'sleep' ? 0.0016 : 0.001);
      r.chest.rotation.set(br * 0.012, c.curl * 0.55 + yaw * 0.08 * wb, 0);
      r.pelvis.rotation.set(0, -c.curl * 0.55 - yaw * 0.06 * wb, 0);

      // хвост: волна + запаздывание за поворотами + иногда дёргается кончик
      this.flickT = (this.flickT ?? 3) - dt;
      if (this.flickT < -0.5) this.flickT = 2 + rnd() * 6;
      const flick = this.flickT < 0 ? Math.sin(-this.flickT * 20) * 0.35 * c.eyes : 0;
      const awake = c.eyes, n = r.tail.length;
      for (let i = 0; i < n; i++) {
        const t = i / n, seg = r.tail[i];
        seg.rotation.z = c.tz + Math.sin(s * 1.5 - i * 0.5) * 0.045 * (0.3 + wb + awake) + (i === 0 ? 0.3 * wb : 0);
        seg.rotation.y = c.ty + Math.sin(s * 1.05 - i * 0.6 + this.heading) * 0.1 * (0.25 + awake) - yaw * 0.07 * (1 + t) + (t > 0.65 ? flick : 0);
      }

      if (this.pose === 'sleep' && c.eyes < 0.5 && this.root.visible) {
        this.nextZ -= dt;
        if (this.nextZ < 0) { this.nextZ = 3.5 + rnd() * 2; floatAt(r.head, 'z'); }
      }
    }
  }

  const black = new Cat('Ваня', { fur: '#28242d', furDark: '#121015', furLight: '#4a4452', sheen: '#5a5468', muzzle: '#3a3541', paw: '#2a2630', inner: '#6b5560', nose: '#4a3a42', iris: '#cfe35a', lid: '#6a6372', whisker: '#d8d2dc', collar: '#c43a4f', scale: 1 }, 'deskA');
  const white = new Cat('Соня', { fur: '#f7f2ee', furDark: '#e2d8d2', furLight: '#ffffff', sheen: '#ffffff', muzzle: '#ffffff', paw: '#fbe3e8', inner: '#f4aebf', nose: '#e8798f', iris: '#7fc4f2', lid: '#3b2a35', whisker: '#c9c0c4', collar: '#f08aa0', bow: '#f26d92', scale: 0.9 }, 'deskB');
  cats.push(black, white);
  black.look = white.rig.head; white.look = black.rig.head;

  // ---------- сценки ----------
  const rest = async (c, pose, sec) => { c.pose = pose; await wait(sec); };
  const SOLO = {
    deskSit: async (c) => { await c.go('deskL'); await rest(c, 'sit', 2); c.look = 'camera'; await wait(4); c.look = null; await rest(c, 'groom', 4); await rest(c, 'loaf', 3); await rest(c, 'sleep', 14 + rnd() * 8); await rest(c, 'loaf', 2); },
    sill: async (c, o) => { const n = o?.at === 'sill1' ? 'sill2' : 'sill1'; if (!(await c.go(n))) return; await rest(c, 'sit', 3); c.look = V(-1.55, 1.6, -2.4); await rest(c, 'loaf', 5); await rest(c, 'sleep', 16 + rnd() * 10); c.look = null; await rest(c, 'loaf', 2); },
    post: async (c) => { await c.go('post'); c.pose = 'scratch'; sfx.scratch(3.5); await wait(3.8); await rest(c, 'sit', 1.5); await rest(c, 'groom', 4); c.look = pom; await rest(c, 'sit', 3); c.look = null; },
    play: async (c) => {
      await c.go('rug');
      for (let i = 0; i < 3; i++) {
        const d = yarn.position.clone().sub(c.root.position); d.y = 0;
        await c.face(Math.atan2(-d.z, d.x));
        c.look = yarn; c.pose = 'stalk'; await wait(1.2 + rnd());
        const want = yarn.position.clone().addScaledVector(d.normalize(), -0.12);
        await c.jumpTo(nav.snap('floor', want.x, want.z));
        yarnV.set(d.x, 0, d.z).normalize().multiplyScalar(0.5 + rnd() * 0.4).applyAxisAngle(V(0, 1, 0), (rnd() - 0.5) * 1.2);
        await rest(c, 'side', 2 + rnd() * 2);
        await rest(c, 'crouch', 0.6);
      }
      c.look = null; c.pose = 'stand';
      await c.go('rug'); await rest(c, 'sit', 3); await rest(c, 'groom', 3);
    },
    under: async (c) => { await c.go('under'); await rest(c, 'loaf', 4); await rest(c, 'sleep', 16 + rnd() * 8); await rest(c, 'loaf', 2); },
    bag: async (c) => { await c.go('bag'); await rest(c, 'loaf', 3); await rest(c, 'sleep', 18 + rnd() * 8); await rest(c, 'loaf', 2); },
    leave: async (c) => {
      await c.go('exit'); c.root.visible = false; await wait(12 + rnd() * 12); c.root.visible = true;
      await c.go('rug'); await rest(c, 'sit', 1); c.look = 'camera'; await wait(4); c.look = null; await rest(c, 'groom', 3);
    },
  };
  async function cuddle(a, b) {
    if (b.at === 'deskA' || a.at === 'deskB') [a, b] = [b, a];
    if (!(await a.go('deskA'))) return; await rest(a, 'loaf', 1.5); a.pose = 'sleep';
    await wait(2 + rnd() * 3);
    if (!(await b.go('deskB'))) return;
    b.look = a.rig.head; b.pose = 'stand'; await wait(1.2); b.alert = 1.2; // нос к носу
    a.look = b.rig.head; a.alert = 1.5; sfx.purr(2.4);
    await rest(b, 'loaf', 2.5); b.pose = 'sleep'; a.pose = 'sleep';
    await wait(26 + rnd() * 16);
    a.look = b.look = null; a.pose = b.pose = 'loaf'; await wait(2);
  }
  async function windowTogether(a, b) {
    if (b.at === 'sill1' || a.at === 'sill2') [a, b] = [b, a];
    await Promise.all([a.go('sill1'), wait(2).then(() => b.go('sill2'))]);
    a.look = b.rig.head; b.look = a.rig.head;
    a.pose = b.pose = 'loaf'; await wait(5);
    a.look = b.look = V(-1.55, 1.6, -2.4); await wait(6);
    a.look = b.rig.head; b.look = a.rig.head;
    a.pose = b.pose = 'sleep'; await wait(20 + rnd() * 10);
    a.look = b.look = null; a.pose = b.pose = 'loaf'; await wait(2);
  }
  (async function director() {
    await wait(30 + rnd() * 15); // сначала они просто спят вместе
    black.look = white.look = null;
    for (;;) {
      const [a, b] = rnd() < 0.5 ? [black, white] : [white, black];
      const r = rnd();
      try {
        if (r < 0.25) await cuddle(a, b);
        else if (r < 0.35) await windowTogether(a, b);
        else {
          const keys = Object.keys(SOLO), k1 = pick(keys), k2 = pick(keys.filter((k) => k !== k1));
          await Promise.all([SOLO[k1](a, b), wait(rnd() * 5).then(() => SOLO[k2](b, a))]);
        }
      } catch (e) { console.warn(e); }
    }
  })();

  return {
    cats,
    clickables: cats.map((c) => c.root),
    obstacles: () => cats.filter((c) => c.onDesk()).map((c) => ({ x: c.root.position.x, z: c.root.position.z, r: 0.11, y: TOP, cat: c })),
    get nav() { return nav; },
    // другой стол — другая сетка ходьбы и точки прыжков
    setDesk(desk) { nav = createNav({ TOP, SILL, deskObstacles, floorObstacles, desk }); },
    update(dt, s) {
      for (const c of cats) c.update(dt, s);
      // клубок катится и тормозит на ковре
      if (yarnV.lengthSq() > 1e-5) {
        yarn.position.addScaledVector(yarnV, dt);
        yarn.rotateOnWorldAxis(V(yarnV.z, 0, -yarnV.x).normalize(), (yarnV.length() * dt) / 0.045);
        yarnV.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
        const off = V(yarn.position.x, 0, yarn.position.z + 0.35);
        if (off.length() > 0.95) { off.setLength(0.95); yarn.position.set(off.x, 0.045, off.z - 0.35); yarnV.multiplyScalar(-0.5); }
      }
      pom.position.x = 0.12 + Math.sin(s * 1.3) * 0.01;
    },
  };
}
