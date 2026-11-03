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

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
