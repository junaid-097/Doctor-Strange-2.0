import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ command }) => ({
  base: './',
  plugins: command === 'serve' ? [basicSsl()] : [],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  server: { host: true },
}));
