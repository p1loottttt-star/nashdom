// Если YouTube у человека не грузится (замедление в России): название ролика с YouTube + похожие видео на Rutube.
// Сервер вне России: YouTube отдаёт ему название, а Rutube ищем отсюда же — браузеру не нужен CORS.
export default async function handler(req, res) {
  const id = String(req.query.id || '');
  if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ error: 'id' });
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  const get = (url) => fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 nash-dom' }, signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const meta = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
  if (!meta?.title) return res.status(200).json({ title: '', rutube: [] });

  const found = await get(`https://rutube.ru/api/search/video/?format=json&query=${encodeURIComponent(meta.title.slice(0, 120))}`);
  const rutube = (found?.results || []).slice(0, 6).map((v) => ({
    id: String(v.id || ''),
    url: v.video_url || `https://rutube.ru/video/${v.id}/`,
    title: String(v.title || '').slice(0, 140),
    author: String(v.author?.name || '').slice(0, 60),
    thumb: v.thumbnail_url || '',
    duration: Number(v.duration) || 0,
  })).filter((v) => /^[0-9a-f]{32}$/.test(v.id));
  res.status(200).json({ title: meta.title, author: meta.author_name || '', rutube });
}
