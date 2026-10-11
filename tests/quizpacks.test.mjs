// пакеты новых тестов: форма, запись в каталоге, ключи фото; фото и авторы — когда собраны (scripts/quizimg.mjs)
import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { validate, length } from '../quizlogic.js';
import { NEW, RUBRICS, FORMATS, QUIZZES } from '../quizdb.js';

const root = new URL('..', import.meta.url);
const credits = existsSync(new URL('public/quiz/credits.json', root)) ? JSON.parse(readFileSync(new URL('public/quiz/credits.json', root), 'utf8')) : null;
const files = readdirSync(new URL('quizpacks/', root)).filter((f) => f.endsWith('.js'));
assert.equal(new Set([...QUIZZES, ...NEW].map((q) => q.id)).size, QUIZZES.length + NEW.length, 'повтор id');
for (const q of QUIZZES) assert.ok(RUBRICS[q.rubric], 'рубрика ' + q.id);
let photos = 0;
for (const f of files) {
  const id = f.slice(0, -3), meta = NEW.find((q) => q.id === id);
  assert.ok(meta, 'нет в каталоге: ' + id);
  const pack = { ...meta, ...(await import(new URL('quizpacks/' + f, root))).default };
  assert.deepEqual(validate(pack), [], id);
  assert.ok(RUBRICS[meta.rubric] && FORMATS[meta.kind] && meta.desc && meta.pop >= 0 && meta.added, 'поля каталога ' + id);
  assert.equal(meta.n, length(pack), 'n ' + id);
  const keys = [pack.cover, ...(pack.questions || []).map((x) => x.img), ...Object.values(pack.results || {}).map((x) => x.img), ...(pack.items || []).map((x) => x.img)].filter(Boolean);
  for (const k of keys) assert.ok(pack.imgs?.[k], `${id}: ключ фото без запроса ${k}`);
  if (credits) for (const k of Object.keys(pack.imgs)) {
    assert.ok(existsSync(new URL(`public/quiz/${k}.webp`, root)), 'нет файла ' + k);
    const c = credits[k]; assert.ok(c?.by && c.src && c.lic, 'нет автора ' + k); photos++;
  }
}
for (const q of NEW) assert.ok(files.includes(q.id + '.js'), 'нет пакета ' + q.id);
console.log(`quizpacks: ok (${files.length} тестов${credits ? `, ${photos} фото` : ', фото ещё не собраны'})`);
