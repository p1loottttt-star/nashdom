// Правила записи в дом — те же, что CHECK в supabase/migrations (сверяет tests/rules.test.mjs).
export const KIND = /^[a-z]{2,20}$/;
export const ID = /^[A-Za-z0-9_:.-]{1,120}$/;
export const MAX_DATA = 1000000; // байт JSON; в базе — pg_column_size
export function checkItem(kind, id, data) {
  if (!KIND.test(kind)) throw new Error(`bad kind: ${kind}`);
  if (!ID.test(id)) throw new Error(`bad id: ${id}`);
  if (data != null && new Blob([JSON.stringify(data)]).size >= MAX_DATA) throw new Error('too big');
}
