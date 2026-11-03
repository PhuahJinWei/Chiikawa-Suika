// Vite plugin: writes sw.js (the offline cache) into the build, from src/offline/sw.js.
// It fills in the list of every file the game needs and a version that changes whenever
// any of them changes, so players get updates and old caches are cleaned up.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Every file under `dir`, as forward-slash paths relative to it. */
function filesIn(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export function offlineCache() {
  return {
    name: 'offline-cache',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = filesIn('public').filter((f) => !f.endsWith('.txt'));
      const files = ['./', ...Object.keys(bundle).sort(), ...publicFiles];
      const template = readFileSync('src/offline/sw.js', 'utf8');
      const hash = createHash('sha1').update(JSON.stringify(files)).update(template);
      for (const f of publicFiles) hash.update(readFileSync(join('public', f)));
      for (const f of Object.keys(bundle).sort()) {
        const item = bundle[f];
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const source = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
