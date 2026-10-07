// весь SQL схемы: миграции supabase/migrations по порядку имён
import fs from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
export const MIGRATIONS = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(new URL(f, dir), 'utf8'));
export const SQL = MIGRATIONS.join('\n');
