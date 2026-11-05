import { defineConfig } from 'vite';

export default defineConfig({
  base: '/taigi-rail-monopoly/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
