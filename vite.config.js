import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// версия сайта: короткий хеш коммита (на Vercel — из env) + дата сборки
const git = () => { try { return execSync('git rev-parse HEAD').toString(); } catch { return 'dev'; } };
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || git()).trim().slice(0, 7);

export default defineConfig({
  css: { postcss: {} }, // не искать postcss-конфиг в родительской папке LeadGen
  define: { __VERSION__: JSON.stringify(`${sha} · ${new Date().toISOString().slice(0, 10)}`) },
  build: { target: 'es2022', chunkSizeWarningLimit: 800, rollupOptions: { input: { main: 'index.html', lab: 'lab/index.html' } } },
});
