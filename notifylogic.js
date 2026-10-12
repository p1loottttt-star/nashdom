// Колокольчик в комнате: что ждёт меня от партнёра. Вход — уже отобранные данные (hud.js), выход — дела по важности.
// Дело = { key, kind, text, sub, go } — key меняется, когда появляется новое (новый ход — новый at), go — куда вести.
const clip = (s = '', n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
export function pending({ notes = [], gifts = [], turns = [], asks = [], qday = null } = {}) {
  return [
    ...notes.map((n) => ({ key: 'note:' + n.id, kind: 'note', text: 'записка', sub: n.text ? clip(n.text) : 'с рисунком', go: 'desk' })),
    ...gifts.map((g) => ({ key: 'gift:' + g.id, kind: 'gift', text: 'подарок: ' + g.title, sub: g.note ? `«${clip(g.note, 50)}»` : 'коробка на столе', go: 'desk' })),
    ...turns.map((m) => ({ key: `turn:${m.id}:${m.at}`, kind: 'turn', text: `ваш ход · ${m.title}`, sub: 'ждёт тебя в «Играх»', go: 'games', match: m.id })),
    ...asks.map((a) => ({ key: 'ask:' + a.id, kind: 'ask', text: 'зовёт в тест', sub: `«${a.title}»`, go: 'quiz' })),
    ...(qday ? [{ key: 'qday:' + qday, kind: 'qday', text: 'ответил(а) на вопрос дня', sub: 'твоя очередь', go: 'quiz' }] : []),
  ];
}
export const fresh = (seen, items) => items.filter((i) => !seen.has(i.key));
