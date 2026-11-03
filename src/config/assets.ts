/** UI pictures in /public/images. Swap a file here to restyle that part of the game. */
export const IMAGES = {
  background: 'images/background_1.png',
  ribbon: 'images/text_field_1.png',
  frame: 'images/text_field_2.png',
  titleFrame: 'images/text_field_3.png',
  blob: 'images/blob.png',
  gem: 'images/gem.png',
  menu: 'images/buttons/menu.png',
  close: 'images/buttons/close.png',
  bush1: 'images/bush_1.png',
  bush2: 'images/bush_2.png',
} as const;

export type ImageKey = keyof typeof IMAGES;

/**
 * Full URL of a file in /public. Absolute on purpose: a relative url() inside a CSS
 * variable resolves against the stylesheet that uses it (assets/ in a build), not the page.
 */
export function assetUrl(path: string): string {
  return new URL(import.meta.env.BASE_URL + path, document.baseURI).href;
}

/** Exposes every image to CSS as `--img-<name>` (e.g. --img-ribbon), resolved against the base URL. */
export function exposeImagesToCss(root: HTMLElement = document.documentElement): void {
  for (const [key, path] of Object.entries(IMAGES)) {
    const name = key.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);
    root.style.setProperty(`--img-${name}`, `url("${assetUrl(path)}")`);
  }
}

/**
 * Loads a picture, or null once it is missing or keeps failing. Phone connections and in-app
 * browsers (LINE's, for one) sometimes drop or stall a request, so a failed attempt is tried
 * again after a moment, and a slow one gets a second attempt alongside it (the first to
 * finish wins). Retries add `?try=N` so a broken cached copy is not handed back again.
 */
export function loadImage(src: string, tries = 3, patience = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false;
    let started = 0;
    let running = 0;
    let queued = false;
    const settle = (img: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(img);
    };
    const queue = (delay: number) => {
      if (settled || queued || started >= tries) return false;
      queued = true;
      setTimeout(() => {
        queued = false;
        attempt();
      }, delay);
      return true;
    };
    const attempt = () => {
      if (settled) return;
      started++;
      running++;
      const img = new Image();
      const slow = setTimeout(() => queue(0), patience);
      const end = (ok: boolean) => {
        clearTimeout(slow);
        running--;
        if (ok) settle(img);
        else if (!queue(1000) && running === 0 && !queued) settle(null);
      };
      img.onload = () => end(img.naturalWidth > 0);
      img.onerror = () => end(false);
      img.src = started === 1 ? src : `${src}${src.includes('?') ? '&' : '?'}try=${started}`;
    };
    attempt();
  });
}
