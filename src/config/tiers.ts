/**
 * The ball line-up, smallest first. This is the file to edit when your drawings are ready.
 *
 * - `name` is shown in the game (Japanese).
 * - `radius` is in world units; the container is 600 units wide and 720 tall.
 * - `image` is a path inside /public. Until that file exists, the placeholder face described
 *   by `look` is drawn instead, so the game works with or without art.
 * - `shockedImage` (optional) is the face shown for a moment when the ball is hit hard, shaken
 *   or flipped (see `shock` in game.ts). Without it the ball keeps its usual face.
 * - Pictures are drawn so the image's edges touch the ball's edge (see art-templates/).
 *   `imageScale` (default 1) can enlarge a picture if a drawing ever needs it.
 *
 * Only the first few tiers are ever dropped (see `spawn` in game.ts). The last tier is the
 * "goal" ball: two of them touching pop and vanish.
 */

export type EyeStyle = 'dot' | 'bead' | 'happy' | 'sparkle' | 'sleepy' | 'round' | 'wink' | 'line';
export type MouthStyle = 'w' | 'smile' | 'open' | 'o' | 'flat' | 'cat' | 'v';
export type CapStyle = 'split' | 'top' | 'ears' | 'spots' | 'mane' | 'helmet' | 'band';
export type ExtraStyle = 'sweat' | 'sparkle' | 'sprout' | 'brows' | 'crown' | 'star';

export interface TierLook {
  /** Main fill colour of the placeholder ball. */
  color: string;
  /** Optional coloured pattern on the upper part of the ball. */
  cap?: { color: string; style: CapStyle };
  eyes: EyeStyle;
  mouth: MouthStyle;
  blush?: boolean;
  extra?: ExtraStyle;
}

export interface TierDef {
  name: string;
  radius: number;
  image?: string;
  shockedImage?: string;
  imageScale?: number;
  /** Colour used for particles, rings and score pop-ups. */
  accent: string;
  look: TierLook;
}

export const TIERS: TierDef[] = [
  {
    name: 'モブ',
    radius: 22,
    image: 'balls/01.png',
    shockedImage: 'balls/01_shocked.png',
    accent: '#b49c9c',
    look: { color: '#ffffff', eyes: 'bead', mouth: 'smile', blush: true },
  },
  {
    name: 'ちいかわ',
    radius: 29,
    image: 'balls/02.png',
    shockedImage: 'balls/02_shocked.png',
    accent: '#f6a9bd',
    look: { color: '#ffffff', cap: { color: '#9cc2ea', style: 'split' }, eyes: 'bead', mouth: 'w', blush: true },
  },
  {
    name: 'ハチワレ',
    radius: 37,
    image: 'balls/03.png',
    shockedImage: 'balls/03_shocked.png',
    accent: '#7aa7c4',
    look: { color: '#fff1b0', eyes: 'dot', mouth: 'open', blush: true, extra: 'sparkle' },
  },
  {
    name: 'うさぎ',
    radius: 47,
    image: 'balls/04.png',
    shockedImage: 'balls/04_shocked.png',
    accent: '#f2cf5b',
    look: { color: '#f6efff', cap: { color: '#e3d5fb', style: 'top' }, eyes: 'round', mouth: 'cat', blush: true },
  },
  {
    name: 'モモンガ',
    radius: 58,
    image: 'balls/05.png',
    shockedImage: 'balls/05_shocked.png',
    accent: '#a9d3ea',
    look: { color: '#f6deb8', cap: { color: '#c98f5a', style: 'top' }, eyes: 'sleepy', mouth: 'o', blush: true },
  },
  {
    name: 'くりまんじゅう',
    radius: 72,
    image: 'balls/06.png',
    shockedImage: 'balls/06_shocked.png',
    accent: '#a8704e',
    look: { color: '#ffd9a8', cap: { color: '#f2a65e', style: 'mane' }, eyes: 'happy', mouth: 'open', blush: true },
  },
  {
    name: 'ラッコ',
    radius: 88,
    image: 'balls/07.png',
    shockedImage: 'balls/07_shocked.png',
    accent: '#d9b98a',
    look: { color: '#e7ecf2', cap: { color: '#b7c2cf', style: 'helmet' }, eyes: 'line', mouth: 'flat', extra: 'brows' },
  },
  {
    name: 'シーサー',
    radius: 106,
    image: 'balls/08.png',
    shockedImage: 'balls/08_shocked.png',
    accent: '#ee9a6b',
    look: { color: '#d7f3e1', cap: { color: '#9ddcb9', style: 'ears' }, eyes: 'wink', mouth: 'w', blush: true, extra: 'sprout' },
  },
  {
    name: 'ふるほんや',
    radius: 128,
    image: 'balls/09.png',
    shockedImage: 'balls/09_shocked.png',
    accent: '#f2a5ad',
    look: { color: '#ffd6dc', cap: { color: '#f6a5b2', style: 'spots' }, eyes: 'sparkle', mouth: 'v', blush: true },
  },
  {
    name: 'ひとは',
    radius: 154,
    image: 'balls/10.png',
    shockedImage: 'balls/10_shocked.png',
    accent: '#6f6a6a',
    look: { color: '#eadccf', cap: { color: '#c9b19c', style: 'top' }, eyes: 'happy', mouth: 'w', blush: true, extra: 'crown' },
  },
];

export const MAX_TIER = TIERS.length - 1;
