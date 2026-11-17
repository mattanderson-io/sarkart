import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: process.env.SARKART_BASE || '/',
  plugins: [preact({ babel: {} })],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
