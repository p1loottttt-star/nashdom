// все tests/*.test.mjs по очереди; хоть один упал — код выхода 1
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
let bad = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
  const r = spawnSync(process.execPath, [dir + f], { stdio: 'inherit' });
  if (r.status) { bad++; console.error('FAIL', f); }
}
process.exit(bad ? 1 : 0);
