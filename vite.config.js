import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { EMOJI_RE } from './emoji.js';

// версия сайта: короткий хеш коммита (на Vercel — из env) + дата сборки
const git = () => { try { return execSync('git rev-parse HEAD').toString(); } catch { return 'dev'; } };
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || git()).trim().slice(0, 7);

// все цветные эмодзи сайта — для emoji.js (рисуются картинками в фоне); список собирается сам из исходников
const EMOJI = [...new Set(fs.readdirSync('.').filter((f) => /\.(js|html)$/.test(f) && !f.startsWith('vite.')).flatMap((f) => fs.readFileSync(f, 'utf8').match(EMOJI_RE) || []))];

// отпечаток кода, от которого зависит вид вещей: превью магазина (thumbs.js) перерисовываются, только когда он меняется
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const ART = fnv(['furniture.js', 'toon.js', 'thumbs.js', 'roomstyle.js'].map((f) => fs.readFileSync(f, 'utf8')).join('|'));

export default defineConfig({
  css: { postcss: {} },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] }, // у ffmpeg.wasm свой воркер (new URL) — пребандлинг его ломает // не искать postcss-конфиг в родительской папке LeadGen
  define: { __ART__: JSON.stringify(ART), __EMOJI__: JSON.stringify(EMOJI), __VERSION__: JSON.stringify(`${sha} · ${new Date().toISOString().slice(0, 10)}`) },
  build: { target: 'es2022', chunkSizeWarningLimit: 800, rollupOptions: { input: { main: 'index.html', lab: 'lab/index.html' } } },
});
