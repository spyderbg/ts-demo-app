import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'frontend', plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3456' } },
  build: { outDir: '../build/frontend', emptyOutDir: true },
});
