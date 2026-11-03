/** Shared colours for canvas drawing, sampled from the art in /public/images (CSS mirrors them). */
export const INK = '#8a6262';
export const INK_SOFT = '#a88a87';
export const PAPER = '#fbf9f5';
export const PINK = '#ffc2cc';
export const PINK_DEEP = '#f7acb7';
export const PINK_LIGHT = '#ffdae0';
export const BLUSH = '#f8a9bb';
export const BLUSH_LINE = '#e5839c';
export const DANGER = '#f0647a';
/** The drop guide: a deep pink that stands out on the cream box without reading as danger. */
export const GUIDE = '#e0708a';
export const GOLD = '#ffd66b';

export function mix(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parse(color: string): [number, number, number] {
  if (color.startsWith('rgb')) {
    const m = color.match(/[\d.]+/g) ?? ['0', '0', '0'];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  let h = color.replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
