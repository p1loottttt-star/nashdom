// Подсчёты «Тестов для пар» — чистые функции (проверяет tests/quiz.test.mjs).
// Запись прохождения: { user, answers }. who: 'me' | 'you' | 'both'; type: индекс варианта; know: { self, guess }.

// «кто из нас»: ответы относительны отвечающему → в людей (id или 'both')
const abs = (ans, me, other) => (ans === 'me' ? me : ans === 'you' ? other : ans === 'both' ? 'both' : null);
export function whoRows(quiz, A, B) {
  const rows = quiz.items.map((text, i) => {
    const a = abs(A.answers[i], A.user, B.user), b = abs(B.answers[i], B.user, A.user);
    return { text, a, b, agree: !!a && a === b };
  });
  const agreed = rows.filter((r) => r.agree).length;
  return { rows, agreed, pct: rows.length ? Math.round((agreed / rows.length) * 100) : 0 };
}

// «какой ты»: самый частый ключ; при равенстве — тот, что раньше в списке результатов
export function typeResult(quiz, answers) {
  const keys = Object.keys(quiz.results), n = Object.fromEntries(keys.map((k) => [k, 0]));
  quiz.questions.forEach((q, i) => { const k = q.a[answers[i]]?.[1]; if (k in n) n[k]++; });
  return keys.reduce((best, k) => (n[k] > n[best] ? k : best), keys[0]);
}

// «знаешь»: mine — сколько моих догадок совпало с ответами партнёра «про себя», theirs — наоборот
export function knowScore(quiz, A, B) {
  const rows = quiz.questions.map((q, i) => {
    const a = A.answers[i] || {}, b = B.answers[i] || {};
    return { q: q.q, a, b, myOk: a.guess === b.self, theirOk: b.guess === a.self };
  });
  return { rows, mine: rows.filter((r) => r.myOk).length, theirs: rows.filter((r) => r.theirOk).length, total: rows.length };
}

// сколько ответов ждёт тест (для прогресса и проверки «пройден до конца»)
export const length = (quiz) => (quiz.kind === 'who' ? quiz.items.length : quiz.questions.length);

// целостность записи базы: [] — всё в порядке, иначе список проблем
export function validate(q) {
  const bad = [];
  if (!q.id || !q.title || !q.topic || !q.emoji) bad.push('нет id/title/topic/emoji');
  if (q.kind === 'who') { if (!(q.items?.length >= 6)) bad.push('мало утверждений'); }
  else if (q.kind === 'type') {
    const keys = Object.keys(q.results || {});
    if (keys.length < 2) bad.push('мало результатов');
    for (const k of keys) if (!q.results[k].title || !q.results[k].text) bad.push('результат без текста: ' + k);
    for (const [i, x] of (q.questions || []).entries()) {
      if (!x.q || !(x.a?.length >= 2)) bad.push('вопрос ' + i);
      for (const [t, k] of x.a || []) if (!t || !keys.includes(k)) bad.push(`вопрос ${i}: ключ ${k}`);
    }
    for (const k of keys) if (!(q.questions || []).some((x) => x.a.some((a) => a[1] === k))) bad.push('недостижим: ' + k);
  } else if (q.kind === 'know') {
    for (const [i, x] of (q.questions || []).entries()) if (!x.q || !(x.a?.length >= 2)) bad.push('вопрос ' + i);
    if (!(q.questions?.length >= 5)) bad.push('мало вопросов');
  } else bad.push('неизвестный формат');
  return bad;
}
