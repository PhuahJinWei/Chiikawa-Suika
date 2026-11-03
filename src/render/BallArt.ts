import { assetUrl, loadImage } from '../config/assets';
import { TIERS } from '../config/tiers';
import { clipToBall, drawBallOutline, drawPlaceholder } from './faces';

/** Pictures are drawn this much larger than the ball, so their edge hides under the outline. */
const ART_BLEED = 1.04;

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Draw the sprite this many ball-radii around the centre (> 1 when art pokes out). */
  extent: number;
}

/**
 * Ball pictures: the player's drawings from /public when present, otherwise a generated
 * placeholder face. Each ball has its usual face and, optionally, a shocked one. Sprites are
 * pre-rendered per pixel size and face, and cached.
 */
export class BallArt {
  private images: (HTMLImageElement | null)[] = TIERS.map(() => null);
  private shockedImages: (HTMLImageElement | null)[] = TIERS.map(() => null);
  private sprites = new Map<string, Sprite>();
  private thumbs = new Map<string, string>();

  /**
   * Loads every tier's pictures; missing files are fine. Each one is used as soon as it
   * arrives (`onPicture` is called then), so one slow file never holds back the rest. A
   * ball's shocked face loads after its usual one. Returns how many usual faces were found.
   */
  async load(onPicture: () => void = () => {}): Promise<number> {
    const get = (path: string | undefined, into: (HTMLImageElement | null)[], tier: number) =>
      path
        ? loadImage(assetUrl(path)).then((img) => {
            if (!img) return false;
            into[tier] = img;
            this.forget(tier);
            onPicture();
            return true;
          })
        : Promise.resolve(false);
    const found = await Promise.all(
      TIERS.map((t, i) =>
        get(t.image, this.images, i).then(async (ok) => {
          await get(t.shockedImage, this.shockedImages, i);
          return ok;
        }),
      ),
    );
    return found.filter(Boolean).length;
  }

  /** Drops the cached sprites and thumbnails of one tier, so they are drawn again. */
  private forget(tier: number): void {
    for (const cache of [this.sprites, this.thumbs]) {
      for (const key of [...cache.keys()]) if (key.startsWith(`${tier}:`)) cache.delete(key);
    }
  }

  hasImage(tier: number): boolean {
    return this.images[tier] !== null;
  }

  /** `shocked`: the face for a hard hit; balls without a shocked picture keep their usual face. */
  sprite(tier: number, pxRadius: number, shocked = false): Sprite {
    const r = Math.max(6, Math.round(pxRadius));
    const face = shocked && this.shockedImages[tier] ? 'shocked' : 'usual';
    const key = `${tier}:${r}:${face}`;
    let s = this.sprites.get(key);
    if (!s) {
      s = this.render(tier, r, face === 'shocked' ? this.shockedImages[tier] : this.images[tier]);
      this.sprites.set(key, s);
    }
    return s;
  }

  /** PNG data URL of the ball for use in the DOM (menus, HUD). */
  thumbnail(tier: number, size = 96, shocked = false): string {
    const key = `${tier}:${size}:${shocked}`;
    let url = this.thumbs.get(key);
    if (!url) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const s = this.sprite(tier, size / 2 / 1.12, shocked);
      const half = (size / 2 / 1.12) * s.extent;
      ctx.drawImage(s.canvas, size / 2 - half, size / 2 - half, half * 2, half * 2);
      url = canvas.toDataURL('image/png');
      this.thumbs.set(key, url);
    }
    return url;
  }

  clearCache(): void {
    this.sprites.clear();
  }

  private render(tier: number, r: number, img: HTMLImageElement | null): Sprite {
    const def = TIERS[tier];
    const seed = tier * 1.37 + 0.5;
    const half = Math.ceil(r * 1.06) + 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = half * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(half, half);
    if (img) {
      // Your drawing has no outline: trim it to the ball and add the shared one on top.
      // Drawings are coloured out to the template's dashed line; ART_BLEED tucks that edge
      // under the (slightly wobbly) outline so no sliver of background shows between them.
      const d = r * (def.imageScale ?? 1) * ART_BLEED;
      ctx.save();
      clipToBall(ctx, r, seed);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, -d, -d, d * 2, d * 2);
      ctx.restore();
      drawBallOutline(ctx, r, seed);
    } else {
      drawPlaceholder(ctx, r, def.look, seed);
    }
    return { canvas, extent: half / r };
  }
}
