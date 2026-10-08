// Эмодзи в интерфейсе — картинками. Цветные эмодзи Windows дороги при первой встрече: ~1 мс на значок в каждом размере
// на раскладку и до 5 мс на растр — окна ноутбука открывались по 60–150 мс, из них 75–85% уходило на эмодзи
// (tests/perf/trace.mjs --strip-emoji). Те же системные значки один раз рисуются в фоне (emoji-worker.js),
// а символы в тексте подменяются <img> с метриками шрифта: на вид то же, а раскладка и растр почти бесплатные.
// Подменяется только то, что и так цветное (Emoji_Presentation или с FE0F): ▶ ♥ ✏ остаются текстом своего шрифта.
export const EMOJI_RE = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F?))*/gu;
const url = new Map();
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CANVAS', 'TITLE']);

function swapText(t) {
  const s = t.data;
  if (s.search(EMOJI_RE) < 0) return; // search, не test: test сдвигает lastIndex, и matchAll ниже начал бы искать после значка
  for (let p = t.parentNode; p && p !== document.body; p = p.parentNode) if (SKIP.has(p.nodeName) || p.isContentEditable) return;
  const frag = document.createDocumentFragment();
  let at = 0, hit = false;
  for (const m of s.matchAll(EMOJI_RE)) {
    const src = url.get(m[0]);
    if (!src) continue; // незнакомый значок (например, из записки) — остаётся текстом
    if (m.index > at) frag.append(s.slice(at, m.index));
    frag.append(Object.assign(document.createElement('img'), { className: 'emo', src, alt: m[0], draggable: false }));
    at = m.index + m[0].length; hit = true;
  }
  if (!hit) return;
  if (at < s.length) frag.append(s.slice(at));
  t.replaceWith(frag);
}
function walk(root) {
  if (root.nodeType === 3) return swapText(root);
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
  for (let t; (t = w.nextNode());) list.push(t);
  list.forEach(swapText);
}

function apply(box, items) {
  for (const [e, blob] of items) url.set(e, URL.createObjectURL(blob));
  // размер и опускание под строку — из метрик шрифта эмодзи: картинка встаёт ровно туда, где был символ
  document.head.append(Object.assign(document.createElement('style'), {
    textContent: `img.emo{display:inline-block;width:${box.w.toFixed(3)}em;height:${box.h.toFixed(3)}em;vertical-align:${(-box.d).toFixed(3)}em;margin:0;border:0;pointer-events:none;user-select:none}`,
  }));
  walk(document.body);
  // всё, что появится потом (окна ноутбука, тосты, магазин), — подменяется до раскладки (наблюдатель срабатывает раньше неё)
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') swapText(m.target); else m.addedNodes.forEach(walk); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
}

// картинки рисуются один раз на браузер (~2 с в фоне: кодирование PNG) и лежат в Cache Storage — дальше берутся сразу
const CACHE = 'emoji-v1', key = (e) => '/__emoji/' + [...e].map((c) => c.codePointAt(0).toString(16)).join('-') + '.png';
export async function startEmoji(list = __EMOJI__) {
  if (typeof OffscreenCanvas === 'undefined' || !list.length) return;
  const cache = await caches?.open(CACHE).catch(() => null);
  const have = [], missing = [];
  let box = null;
  if (cache) {
    box = await cache.match('/__emoji/box.json').then((r) => r?.json()).catch(() => null);
    await Promise.all(list.map(async (e) => { const r = await cache.match(key(e)); if (r) have.push([e, await r.blob()]); else missing.push(e); }));
  } else missing.push(...list);
  if (box && !missing.length) return apply(box, have);
  const w = new Worker(new URL('./emoji-worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }) => {
    w.terminate();
    if (location.search.includes('debug')) console.info('эмодзи картинками:', data.items.length, 'за', data.ms, 'мс');
    apply(data.box, have.concat(data.items));
    if (cache) {
      cache.put('/__emoji/box.json', new Response(JSON.stringify(data.box)));
      for (const [e, blob] of data.items) cache.put(key(e), new Response(blob, { headers: { 'content-type': 'image/png' } }));
    }
  };
  w.onerror = (e) => { console.warn('emoji worker', e.message); w.terminate(); };
  w.postMessage(missing.length && box ? missing : list);
}
