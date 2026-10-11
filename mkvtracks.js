// Звуковые дорожки в .mkv: разбор заголовка (EBML) без ffmpeg — Segment → Tracks → TrackEntry (тип 2 = звук), кодек, язык, название.
// Нужен, чтобы предложить выбор дорожки в «своём фильме» (localcast.js); mp4 не разбираем — там почти всегда одна дорожка.
const LANG = { ru: 'русский', en: 'английский', uk: 'украинский', ro: 'румынский', ja: 'японский', fr: 'французский', de: 'немецкий', es: 'испанский', it: 'итальянский', ko: 'корейский', zh: 'китайский', rus: 'русский', eng: 'английский', ukr: 'украинский', rum: 'румынский', ron: 'румынский', jpn: 'японский', fre: 'французский', fra: 'французский', ger: 'немецкий', deu: 'немецкий', spa: 'испанский', ita: 'итальянский', kor: 'корейский', chi: 'китайский', zho: 'китайский', und: '' };

export async function audioTracks(file) {
  const b = new Uint8Array(await file.slice(0, 4 << 20).arrayBuffer());
  if (b[0] !== 0x1a || b[1] !== 0x45 || b[2] !== 0xdf || b[3] !== 0xa3) return [];
  // число переменной длины: у ID маркер длины остаётся в значении, у размера — снимается
  const vint = (p, id) => { let l = 1, m = 0x80; while (l < 8 && !(b[p] & m)) { l++; m >>= 1; } let v = id ? b[p] : b[p] & (m - 1); for (let i = 1; i < l; i++) v = v * 256 + b[p + i]; return [v, l]; };
  const str = (d, e) => new TextDecoder().decode(b.subarray(d, e)).replace(/\0+$/, '');
  const out = [];
  const walk = (p, end, entry) => {
    while (p < end - 2) {
      const [id, il] = vint(p, true), [size, sl] = vint(p + il), d = p + il + sl;
      const unknown = size === 2 ** (7 * sl) - 1, e = unknown ? end : Math.min(end, d + size);
      if (id === 0x18538067 || id === 0x1654ae6b) walk(d, e, null); // Segment, Tracks
      else if (id === 0xae) { const t = {}; walk(d, e, t); if (t.type === 2) out.push(t); } // TrackEntry
      else if (id === 0x1f43b675) return; // кластеры — дальше только кадры
      else if (entry) {
        if (id === 0x83) entry.type = b[d];
        else if (id === 0x86) entry.codec = str(d, e);
        else if (id === 0x22b59c || id === 0x22b59d) entry.lang = str(d, e);
        else if (id === 0x536e) entry.name = str(d, e);
      }
      if (unknown && id !== 0x18538067) return;
      p = e;
    }
  };
  walk(0, b.length, null);
  return out.map((t, i) => ({ i, codec: (t.codec || '').replace(/^A_/, ''), lang: LANG[t.lang] ?? t.lang ?? '', name: t.name || '' }));
}

// подпись дорожки в меню: «1 · русский · Дубляж · AC3»
export const trackLabel = (t) => [t.i + 1, t.lang, t.name, t.codec].filter(Boolean).join(' · ');
