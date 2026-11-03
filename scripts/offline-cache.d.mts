import type { Plugin } from 'vite';

/** Writes sw.js (the offline cache) into the build. See offline-cache.mjs. */
export function offlineCache(): Plugin;
