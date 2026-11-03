import './styles/main.css';
import { App } from './App';
import { exposeImagesToCss } from './config/assets';

exposeImagesToCss();
const app = new App();
const started = app.start().catch(() => {});

// Handy for tinkering in the browser console during development (not included in builds).
if (import.meta.env.DEV) Object.assign(window, { app });

// The built game keeps a copy of itself, so it plays offline after the first visit. Saving
// that copy downloads every file again, so it waits until the ball pictures are in (or 20 s)
// rather than competing with them on a first visit over a slow connection.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void Promise.race([started, new Promise((r) => setTimeout(r, 20000))]).then(
    () => void navigator.serviceWorker.register('./sw.js').catch(() => {}),
  );
}
