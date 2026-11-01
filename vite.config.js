import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

const v = JSON.parse(readFileSync(new URL('./app-version.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [preact()],
  base: './',
  define: { __WEB_VERSION__: v.web, __NATIVE_VERSION__: v.native },
  build: { outDir: 'dist', target: 'es2020' },
});
