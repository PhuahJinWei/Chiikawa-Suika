import { defineConfig } from 'vitest/config';
import { offlineCache } from './scripts/offline-cache.mjs';

export default defineConfig({
  // Relative base so the built game works from any folder (GitHub Pages, itch.io, a USB stick...).
  base: './',
  // sw.js: lets the built game play offline after the first visit.
  plugins: [offlineCache()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
