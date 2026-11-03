import './styles/main.css';
import { App } from './App';
import { exposeImagesToCss } from './config/assets';

exposeImagesToCss();
const app = new App();
void app.start();

// Handy for tinkering in the browser console during development (not included in builds).
if (import.meta.env.DEV) Object.assign(window, { app });

// The built game keeps a copy of itself, so it plays offline after the first visit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
