// Геометрия кота: прежняя field (из git HEAD) против текущей на той же сетке — совпадение и время сборки.
// Запуск: node tests/perf/catcmp.mjs [ревизия, по умолчанию HEAD]
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = new URL('../../', import.meta.url);
const three = pathToFileURL(new URL('node_modules/three/build/three.module.js', root).pathname.replace(/^\/(\w:)/, '$1')).href;
const prep = (src, name) => {
  const p = new URL(`./.tmp-${name}.mjs`, import.meta.url);
  fs.writeFileSync(p, src.replace("from 'three'", `from '${three}'`) + '\nexport const __poly = polygonize;\n');
  return import(p.href);
};
const rev = process.argv[2] || 'HEAD';
const A = await prep(execSync(`git show ${rev}:catmesh.js`, { cwd: root }).toString(), 'old');
const B = await prep(fs.readFileSync(new URL('catmesh.js', root), 'utf8'), 'new');
let t = performance.now(); const a = A.__poly(0.0046); const ta = performance.now() - t;
t = performance.now(); const b = B.__poly(0.0046); const tb = performance.now() - t;
let maxd = 0; for (let i = 0; i < Math.min(a.pos.length, b.pos.length); i++) maxd = Math.max(maxd, Math.abs(a.pos[i] - b.pos[i]));
console.log({ oldMs: Math.round(ta), newMs: Math.round(tb), verts: [a.pos.length / 3, b.pos.length / 3], tris: [a.idx.length / 3, b.idx.length / 3], sameIdx: a.idx.length === b.idx.length && a.idx.every((v, i) => v === b.idx[i]), maxPosDiff: maxd });
for (const n of ['old', 'new']) fs.rmSync(new URL(`./.tmp-${n}.mjs`, import.meta.url), { force: true });
