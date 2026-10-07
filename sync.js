// Чистая логика CoupleTube: разбор ссылки и подгонка плеера к общему состоянию. Проверка: node tests/sync.test.mjs
const YT_ID = /^[\w-]{11}$/;

// «1h2m3s», «90», «90s» → секунды
const seconds = (t) => {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return +t;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
};

// ссылка → источник: { type: 'yt' | 'vk' | 'rutube' | 'twitch' | 'vimeo' | 'file', … } или null
export function parseSource(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m|music|player|clips)\./, '');
  const path = u.pathname, q = (k) => u.searchParams.get(k);
  const start = seconds(q('t') || q('start'));

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be' ? path.slice(1).split('/')[0] : q('v') || (path.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/) || [])[1];
    return YT_ID.test(id || '') ? { type: 'yt', id, start } : null;
  }
  // VK: vk.com/video-1_2, vkvideo.ru/video-1_2, vk.com/video?z=video-1_2, video_ext.php?oid=&id=&hash=
  if (/^(vk\.com|vk\.ru|vkvideo\.ru)$/.test(host)) {
    if (/^\/video_e(xt|mbed)\.php$/.test(path) && q('oid') && q('id')) return { type: 'vk', oid: q('oid'), id: q('id'), hash: q('hash') || '', start };
    const m = (path + ' ' + (q('z') || '')).match(/(?:video|clip)(-?\d+)_(\d+)/);
    return m ? { type: 'vk', oid: m[1], id: m[2], hash: '', start } : null;
  }
  // Rutube: rutube.ru/video/<id>/, /play/embed/<id>, /shorts/<id>; скрытые — ?p=ключ
  if (host === 'rutube.ru') {
    const id = (path.match(/^\/(?:video|play\/embed|shorts)\/(?:private\/)?([0-9a-f]{32}|\d+)/) || [])[1];
    return id ? { type: 'rutube', id, p: q('p') || '', start } : null;
  }
  // Twitch: запись twitch.tv/videos/<id>, прямой эфир twitch.tv/<канал>
  if (host === 'twitch.tv') {
    const v = path.match(/^\/videos\/(\d+)/);
    if (v) return { type: 'twitch', video: v[1], start };
    const ch = path.match(/^\/([a-zA-Z0-9_]{3,25})\/?$/);
    return ch && !['directory', 'videos', 'settings', 'search'].includes(ch[1]) ? { type: 'twitch', channel: ch[1].toLowerCase(), start: 0 } : null;
  }
  // Vimeo: vimeo.com/<id>, vimeo.com/<id>/<hash>, player.vimeo.com/video/<id>?h=
  if (host === 'vimeo.com') {
    const m = path.match(/^\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/);
    return m ? { type: 'vimeo', id: m[1], h: m[2] || q('h') || '', start } : null;
  }
  // Яндекс Диск: публичная ссылка; прямой адрес файла достаём при открытии (он временный)
  if (/^(disk\.yandex\.[a-z]+|yadi\.sk|disk\.360\.yandex\.ru)$/.test(host) && /^\/(i|d|public)\//.test(path)) return { type: 'file', url: u.href, hls: false, yadisk: true };
  // Dropbox: ?raw=1 превращает страницу в сам файл
  if (host === 'dropbox.com' && /^\/(s|scl)\//.test(path)) {
    u.searchParams.delete('dl'); u.searchParams.set('raw', '1');
    return { type: 'file', url: u.href, hls: false };
  }
  const ext = (path.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  if (['mp4', 'webm', 'ogv', 'ogg', 'mov', 'm4v'].includes(ext)) return { type: 'file', url: u.href, hls: false };
  if (ext === 'm3u8') return { type: 'file', url: u.href, hls: true };
  return null;
}

// где должно быть видео сейчас: state = { playing, pos (с), at (мс, часы сервера) }
export const expected = (s, now) => (s.playing ? s.pos + Math.max(0, now - s.at) / 1000 : s.pos);

// diff = моя позиция − ожидаемая (с). Больше порога — прыжок; меньше — мягко скоростью (у YouTube скорость не плавная)
export function correction(diff, type) {
  const a = Math.abs(diff);
  if (a > (type === 'yt' ? 1.2 : 0.8)) return { seek: true, rate: 1 };
  if (type === 'yt' || a < 0.08) return { seek: false, rate: 1 };
  return { seek: false, rate: 1 - Math.max(-0.05, Math.min(0.05, diff * 0.25)) };
}

// одна и та же ссылка → один и тот же ключ (для баллов «посмотрели вместе»)
export const sourceKey = (s) => ({
  yt: () => 'yt:' + s.id, vk: () => `vk:${s.oid}_${s.id}`, rutube: () => 'rt:' + s.id,
  twitch: () => 'tw:' + (s.video || s.channel), vimeo: () => 'vm:' + s.id, local: () => 'lc:' + s.sid,
}[s.type] || (() => 'f:' + s.url.slice(0, 100)))();
