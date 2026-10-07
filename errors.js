// Ошибки из браузера → таблица client_errors в Supabase (только в облаке; смотреть в панели Supabase).
// Одна запись на одинаковую ошибку, не больше 20 за сессию. Адрес — без параметров (там бывает код приглашения).
let cfg = null, n = 0;
const sent = new Set();
export const setupErrors = (c) => { cfg = c; };

const token = () => { // сессия supabase-js лежит в localStorage; без входа — anon
  try { for (const k of Object.keys(localStorage)) if (/^sb-.+-auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; } catch {}
  return null;
};
export function report(msg, stack) {
  msg = String(msg || 'error').slice(0, 500);
  if (!cfg || n >= 20 || sent.has(msg)) return;
  sent.add(msg); n++;
  fetch(cfg.url + '/rest/v1/client_errors', {
    method: 'POST', keepalive: true,
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + (token() || cfg.key), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ msg, stack: String(stack || '').slice(0, 4000), url: location.pathname.slice(0, 300), ua: navigator.userAgent.slice(0, 300), version: __VERSION__ }),
  }).catch(() => {});
}
addEventListener('error', (e) => report(e.message, e.error?.stack));
addEventListener('unhandledrejection', (e) => report(e.reason?.message || e.reason, e.reason?.stack));
