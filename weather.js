// Погода за окном: город → координаты → текущая погода, восход и закат. Open-Meteo: бесплатно, без ключей.
// ?weather=clear|cloudy|overcast|rain|storm|snow|fog — посмотреть погоду без города (как ?hour=13 для времени).

export async function findCity(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=ru&format=json`).then((x) => x.json());
  return (r.results || []).map((c) => ({ name: c.name, region: [c.admin1, c.country].filter(Boolean).join(', '), lat: +c.latitude.toFixed(3), lon: +c.longitude.toFixed(3) }));
}

const hourOf = (iso) => { const [h, m] = iso.split('T')[1].split(':'); return +h + m / 60; };

export async function fetchWeather(city) {
  const d = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}`
    + '&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=1').then((x) => x.json());
  const c = d.current;
  return {
    code: c.weather_code, cloud: c.cloud_cover / 100, temp: Math.round(c.temperature_2m), wind: c.wind_speed_10m,
    isDay: !!c.is_day, sunrise: hourOf(d.daily.sunrise[0]), sunset: hourOf(d.daily.sunset[0]), offset: d.utc_offset_seconds, at: Date.now(),
  };
}

const FAKE = {
  clear: { code: 0, cloud: 0.05 }, cloudy: { code: 2, cloud: 0.55 }, overcast: { code: 3, cloud: 1 },
  rain: { code: 63, cloud: 1 }, storm: { code: 95, cloud: 1 }, snow: { code: 73, cloud: 1 }, fog: { code: 45, cloud: 0.9 },
};
export function fakeWeather() {
  const k = new URLSearchParams(location.search).get('weather');
  return k && FAKE[k] ? { ...FAKE[k], temp: 12, wind: 12, isDay: true, at: Date.now(), fake: true } : null;
}

// код погоды (WMO) → что рисовать: облака, дождь, снег, туман, гроза — всё 0…1
export function effects(w) {
  const c = w?.code ?? 0, fx = { clouds: w?.cloud ?? 0.2, rain: 0, snow: 0, fog: 0, storm: false };
  const wet = (r) => { fx.rain = r; fx.clouds = Math.max(fx.clouds, 0.9); };
  if (c === 45 || c === 48) { fx.fog = 0.85; fx.clouds = Math.max(fx.clouds, 0.8); }
  else if (c >= 51 && c <= 57) wet([0.2, 0.3, 0.4][(c - 51) >> 1] ?? 0.3);
  else if (c >= 61 && c <= 67) wet({ 61: 0.4, 63: 0.65, 65: 0.9, 66: 0.5, 67: 0.8 }[c] ?? 0.6);
  else if (c >= 71 && c <= 77) { fx.snow = { 71: 0.35, 73: 0.6, 75: 0.9, 77: 0.3 }[c] ?? 0.5; fx.clouds = Math.max(fx.clouds, 0.9); }
  else if (c >= 80 && c <= 82) wet({ 80: 0.5, 81: 0.75, 82: 1 }[c]);
  else if (c === 85 || c === 86) { fx.snow = c === 85 ? 0.6 : 0.9; fx.clouds = 1; }
  else if (c >= 95) { wet(c === 95 ? 0.8 : 0.95); fx.storm = true; }
  fx.wind = Math.min(1, (w?.wind ?? 8) / 40);
  return fx;
}

export function label(w) {
  const c = w?.code ?? -1, night = w && !w.isDay;
  if (c === 0) return night ? ['🌙', 'ясно'] : ['☀️', 'ясно'];
  if (c === 1) return night ? ['🌙', 'почти ясно'] : ['🌤️', 'почти ясно'];
  if (c === 2) return ['⛅', 'облачно'];
  if (c === 3) return ['☁️', 'пасмурно'];
  if (c === 45 || c === 48) return ['🌫️', 'туман'];
  if (c >= 51 && c <= 57) return ['🌦️', 'морось'];
  if (c >= 61 && c <= 67) return ['🌧️', 'дождь'];
  if (c >= 71 && c <= 77) return ['🌨️', 'снег'];
  if (c >= 80 && c <= 82) return ['🌧️', 'ливень'];
  if (c === 85 || c === 86) return ['🌨️', 'снегопад'];
  if (c >= 95) return ['⛈️', 'гроза'];
  return ['🌡️', ''];
}

// который час в городе (не на устройстве): если Соня в другом часовом поясе, у неё своё время за окном
export function cityHour(w) {
  if (w?.offset == null) { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  const d = new Date(Date.now() + w.offset * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

// реальные восход/закат → шкала комнаты, где рассвет в 6:30, а закат в 18:30 (зимой день короче)
export function roomHour(h, w) {
  if (!w?.sunrise || !w?.sunset) return h;
  const sr = w.sunrise, ss = w.sunset;
  if (h < sr) return (h / sr) * 6.5;
  if (h < ss) return 6.5 + ((h - sr) / (ss - sr)) * 12;
  return 18.5 + ((h - ss) / (24 - ss)) * 5.5;
}
