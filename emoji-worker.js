// Фоновый поток для emoji.js: рисует системные цветные эмодзи в картинки (тот же шрифт, что в тексте),
// чтобы главный поток не платил за них при открытии окон. Ответ: { box: размер в em, items: [[эмодзи, png]] }.
const S = 72, FONT = `${S}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;

self.onmessage = async ({ data: list }) => {
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
  probe.font = FONT;
  const m = probe.measureText('😀');
  const W = Math.ceil(m.width), A = Math.ceil(m.fontBoundingBoxAscent), D = Math.ceil(m.fontBoundingBoxDescent);
  const t0 = performance.now();
  const items = await Promise.all(list.map((e) => { // кодирование PNG идёт параллельно — по одному было ~8 с на 132 значка
    const c = new OffscreenCanvas(W, A + D), x = c.getContext('2d');
    x.font = FONT; x.textBaseline = 'alphabetic';
    x.fillText(e, 0, A);
    return c.convertToBlob({ type: 'image/png' }).then((b) => [e, b]);
  }));
  self.ms = performance.now() - t0;
  self.postMessage({ box: { w: W / S, h: (A + D) / S, d: D / S }, items, ms: Math.round(self.ms) });
};
