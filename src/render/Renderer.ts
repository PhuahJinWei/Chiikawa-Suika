import { CONTAINER, GAME, STAGE } from '../config/game';
import { TIERS } from '../config/tiers';
import type { ContainerView, Game } from '../game/Game';
import type { Settings } from '../services/Settings';
import type { BallArt } from './BallArt';
import { Effects } from './Effects';
import { DANGER, GUIDE, INK, PINK, PINK_DEEP, PINK_LIGHT, withAlpha } from './palette';

const W = CONTAINER.width;
const H = CONTAINER.height;
const T = CONTAINER.wall;
/** Inside of the box: the warm cream of the art's frames (text_field_2.png). */
const BOX_CREAM = '#fdf8ee';
/** Top of the claw's rail, in world units below the top of the canvas. */
const RAIL_TOP = 14;
/** Gap (CSS px) between the rail's ends and the canvas edges, which lie on the cabinet's outline. */
const RAIL_INSET = 10;

/** Draws the stage: claw, container, balls and effects. World units are scaled to fit. */
export class Renderer {
  readonly effects = new Effects();
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  /** CSS pixels per world unit, and where the stage starts inside the canvas. */
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private cssW = 1;
  private cssH = 1;
  private dots: Path2D | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly art: BallArt,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** The canvas fills the cabinet; the stage is fitted inside it. */
  resize(cssW: number, cssH: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.max(1, Math.round(this.cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssH * this.dpr));
    this.scale = Math.max(0.01, Math.min(this.cssW / STAGE.width, this.cssH / STAGE.height));
    this.offX = (this.cssW - STAGE.width * this.scale) / 2;
    // Stand the box on the cabinet floor; spare height goes above, as a longer claw cable.
    this.offY = this.cssH - STAGE.height * this.scale;
    this.art.clearCache();
  }

  /** The whole canvas in stage units (it is larger than the stage when the screen has room to spare). */
  private canvasBounds(): { x: number; y: number; w: number; h: number } {
    return { x: -this.offX / this.scale, y: -this.offY / this.scale, w: this.cssW / this.scale, h: this.cssH / this.scale };
  }

  /** CSS pixel position inside the canvas → container-local coordinates. */
  toLocal(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.offX) / this.scale - STAGE.boxX, y: (py - this.offY) / this.scale - STAGE.boxY };
  }

  render(game: Game, settings: Settings, dt: number, pointer: { x: number; y: number } | null): void {
    const ctx = this.ctx;
    this.effects.reduced = settings.reduceMotion;
    this.effects.update(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, this.offX * this.dpr, this.offY * this.dpr);

    const view = game.containerView();
    if (settings.reduceMotion) {
      view.offsetX *= 0.3;
      view.offsetY *= 0.3;
    }

    this.drawRail();
    ctx.save();
    this.applyContainerTransform(view);
    this.drawBoxBack(view);
    this.drawBalls(game, settings, pointer);
    if (settings.guideLine && game.canDrop) this.drawGuide(game, settings);
    this.drawBoxFront(view);
    this.drawDanger(game);
    this.effects.drawLocal(ctx);
    ctx.restore();

    if (!game.flipping) this.drawClaw(game, settings);
    const b = this.canvasBounds();
    this.effects.drawStage(ctx, b.x, b.y, b.w, b.h);
  }

  // ---------------------------------------------------------------- container

  /** Places the box on stage; while flipping it rotates and zooms out so it always fits. */
  private applyContainerTransform(view: ContainerView): void {
    const top = Math.min(0, view.lidY);
    const pivotX = W / 2;
    const pivotY = (top + H) / 2;
    let cx = STAGE.boxX + pivotX;
    let cy = STAGE.boxY + pivotY;
    let zoom = 1;
    if (view.angle !== 0) {
      const bw = W + 2 * T + 16;
      const bh = H - top + 2 * T + 40;
      const c = Math.abs(Math.cos(view.angle));
      const s = Math.abs(Math.sin(view.angle));
      zoom = Math.min(1, (STAGE.width - 16) / (bw * c + bh * s), (STAGE.height - 16) / (bw * s + bh * c));
      const pull = Math.sin(view.angle) ** 2;
      cx += (STAGE.width / 2 - cx) * pull;
      cy += (STAGE.height / 2 - cy) * pull;
    }
    const ctx = this.ctx;
    ctx.translate(cx + view.offsetX, cy + view.offsetY);
    if (view.angle !== 0) ctx.rotate(view.angle);
    if (zoom !== 1) ctx.scale(zoom, zoom);
    ctx.translate(-pivotX, -pivotY);
  }

  /**
   * The inside of the box: flat warm cream like the art's frames and panels, with soft pink
   * polka dots, like Chiikawa stationery. Flat colour keeps the outlined characters crisp.
   */
  private drawBoxBack(view: ContainerView): void {
    const ctx = this.ctx;
    const top = Math.min(0, view.lidY);
    ctx.fillStyle = BOX_CREAM;
    ctx.fillRect(0, top, W, H - top);

    if (!this.dots) {
      this.dots = new Path2D();
      for (let y = 30; y < H; y += 40) {
        for (let x = ((y / 40) % 2) * 20 + 20; x < W; x += 40) {
          this.dots.moveTo(x + 3.5, y);
          this.dots.arc(x, y, 3.5, 0, Math.PI * 2);
        }
      }
    }
    ctx.fillStyle = withAlpha(PINK, 0.55);
    ctx.fill(this.dots);

    // a gentle shadow where the walls and floor meet the inside, for a little depth
    for (const [x0, x1] of [
      [0, 18],
      [W, W - 18],
    ]) {
      const s = ctx.createLinearGradient(x0, 0, x1, 0);
      s.addColorStop(0, 'rgba(138, 98, 98, 0.1)');
      s.addColorStop(1, 'rgba(138, 98, 98, 0)');
      ctx.fillStyle = s;
      ctx.fillRect(Math.min(x0, x1), top, 18, H - top);
    }
    const s = ctx.createLinearGradient(0, H, 0, H - 14);
    s.addColorStop(0, 'rgba(138, 98, 98, 0.1)');
    s.addColorStop(1, 'rgba(138, 98, 98, 0)');
    ctx.fillStyle = s;
    ctx.fillRect(0, H - 14, W, 14);
  }

  private drawBoxFront(view: ContainerView): void {
    const ctx = this.ctx;
    const top = Math.min(0, view.lidY);

    // Thick U-shaped frame with rounded outer corners and slightly rounded inner corners.
    const R = 26;
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(-T, top);
    ctx.lineTo(-T, H + T - R);
    ctx.quadraticCurveTo(-T, H + T, -T + R, H + T);
    ctx.lineTo(W + T - R, H + T);
    ctx.quadraticCurveTo(W + T, H + T, W + T, H + T - R);
    ctx.lineTo(W + T, top);
    ctx.arc(W + T / 2, top, T / 2, 0, Math.PI, true);
    ctx.lineTo(W, H - r);
    ctx.quadraticCurveTo(W, H, W - r, H);
    ctx.lineTo(r, H);
    ctx.quadraticCurveTo(0, H, 0, H - r);
    ctx.lineTo(0, top);
    ctx.arc(-T / 2, top, T / 2, 0, Math.PI, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(-T, 0, W + T, 0);
    g.addColorStop(0, PINK);
    g.addColorStop(0.5, PINK_LIGHT);
    g.addColorStop(1, PINK);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // stitched highlight running through the middle of the walls
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(-T / 2, top + 10);
    ctx.lineTo(-T / 2, H + T / 2 - 6);
    ctx.quadraticCurveTo(-T / 2, H + T / 2, -T / 2 + 6, H + T / 2);
    ctx.lineTo(W + T / 2 - 6, H + T / 2);
    ctx.quadraticCurveTo(W + T / 2, H + T / 2, W + T / 2, H + T / 2 - 6);
    ctx.lineTo(W + T / 2, top + 10);
    ctx.stroke();
    ctx.restore();

    if (view.lid > 0) {
      // the lid slides in from the right while flipping (and back out afterwards)
      const dx = (1 - easeInOut(view.lid)) * (W + 2 * T + 60);
      ctx.save();
      ctx.translate(dx, 0);
      roundRect(ctx, -T, top - T, W + 2 * T, T, 10);
      ctx.fillStyle = PINK;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Where the held friend will land: a pink dashed line flowing down from the claw to a
   * dashed outline of the friend at the spot where it first touches something. Strong pink
   * so it reads clearly on the cream box.
   */
  private drawGuide(game: Game, settings: Settings): void {
    const ctx = this.ctx;
    const x = game.aimX;
    const r = game.aimRadius;
    // first contact of a circle of radius r falling straight down at x
    let landY = H - r;
    for (const b of game.world.bodies) {
      const reach = b.radius + r;
      const dx = b.x - x;
      if (Math.abs(dx) < reach) landY = Math.min(landY, b.y - Math.sqrt(reach * reach - dx * dx));
    }
    const startY = GAME.drop.y + r + 8;
    const endY = landY - r - 6;
    const flow = settings.reduceMotion ? 0 : -game.time * 40;

    ctx.save();
    ctx.lineCap = 'round';
    if (endY > startY) {
      // a soft white band under the dashes keeps them readable over pink dots and friends
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
      ctx.strokeStyle = GUIDE;
      ctx.lineWidth = 4.5;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = flow;
      ctx.stroke();
    }
    // the landing spot: the friend's outline, lightly filled
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = flow;
    ctx.beginPath();
    ctx.arc(x, landY, r, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(GUIDE, 0.14);
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = GUIDE;
    ctx.stroke();
    ctx.restore();
  }

  private drawBalls(game: Game, settings: Settings, pointer: { x: number; y: number } | null): void {
    const ctx = this.ctx;
    const a = game.alpha;
    const px = this.scale * this.dpr;
    const hover = game.removeMode && pointer ? game.world.bodyAt(pointer.x, pointer.y, 6) : null;
    const danger = game.overflowTimer > 0 ? game.overflowBall : null;
    for (const b of game.world.bodies) {
      const x = b.lastX + (b.x - b.lastX) * a;
      const y = b.lastY + (b.y - b.lastY) * a;
      const angle = settings.uprightFaces ? 0 : b.lastAngle + (b.angle - b.lastAngle) * a;
      let r = b.radius;
      const age = game.time - b.data.bornAt;
      if (b.data.merged && age < 0.3 && !settings.reduceMotion) r *= 1 + 0.12 * Math.sin((age / 0.3) * Math.PI);
      if (b === hover) r *= 1.06;

      if (b === danger) {
        ctx.fillStyle = withAlpha(DANGER, 0.25 + 0.2 * Math.sin(game.time * 14));
        ctx.beginPath();
        ctx.arc(x, y, r + 10, 0, Math.PI * 2);
        ctx.fill();
      }
      // The friend about to be removed looks shocked too.
      const shocked = b === hover || game.isShocked(b);
      const sprite = this.art.sprite(b.data.tier, b.targetRadius * px, shocked);
      const half = r * sprite.extent;
      ctx.save();
      ctx.translate(x, y);
      if (angle !== 0) ctx.rotate(angle);
      ctx.drawImage(sprite.canvas, -half, -half, half * 2, half * 2);
      ctx.restore();

      if (b === hover) {
        ctx.save();
        ctx.strokeStyle = DANGER;
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -game.time * 30;
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // While けす waits for a tap, every friend is marked as a target (on top of its neighbours).
    if (game.removeMode) {
      ctx.save();
      ctx.strokeStyle = withAlpha(DANGER, 0.55);
      ctx.lineWidth = 3;
      ctx.setLineDash([9, 9]);
      ctx.lineDashOffset = -game.time * 24;
      for (const b of game.world.bodies) {
        if (b === hover) continue;
        ctx.beginPath();
        ctx.arc(b.lastX + (b.x - b.lastX) * a, b.lastY + (b.y - b.lastY) * a, b.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawDanger(game: Game): void {
    if (game.flipping) return;
    const level = game.dangerLevel;
    const ctx = this.ctx;
    const over = game.overflowTimer > 0;
    ctx.save();
    // Always faintly visible so the limit is known; it brightens as the pile gets close.
    ctx.globalAlpha = Math.min(1, 0.22 + level * 1.1) * (over ? 0.6 + 0.4 * Math.sin(game.time * 14) : 1);
    ctx.strokeStyle = DANGER;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.moveTo(8, GAME.overflow.lineY);
    ctx.lineTo(W - 8, GAME.overflow.lineY);
    ctx.stroke();
    ctx.restore();

    if (over) {
      // a countdown badge above the line: the pie fills up until the game ends
      const p = Math.min(1, game.overflowTimer / GAME.overflow.time);
      const R = 27;
      const x = W - R - 8;
      const y = GAME.overflow.lineY - R - 12;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = DANGER;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 32px "Zen Maru Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeText('!', x, y + 1);
      ctx.fillText('!', x, y + 1);
    }
  }

  // ---------------------------------------------------------------- claw

  /** Top of the rail (stage y): always just under the cabinet's top, however tall the screen. */
  private railY(): number {
    return RAIL_TOP - this.offY / this.scale;
  }

  /** The rail spans the cabinet, from one side to the other. */
  private drawRail(): void {
    const ctx = this.ctx;
    const b = this.canvasBounds();
    const inset = RAIL_INSET / this.scale;
    const x0 = b.x + inset;
    const x1 = b.x + b.w - inset;
    if (x1 - x0 < 40) return; // not laid out yet
    const y = this.railY();
    roundRect(ctx, x0, y, x1 - x0, 20, 10);
    ctx.fillStyle = '#fff0f4';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PINK_DEEP;
    ctx.beginPath();
    ctx.moveTo(x0 + 16, y + 10);
    ctx.lineTo(x1 - 16, y + 10);
    ctx.stroke();
    ctx.restore();
  }

  private drawClaw(game: Game, settings: Settings): void {
    const ctx = this.ctx;
    const cx = STAGE.boxX + game.aimX;
    const ballY = STAGE.boxY + GAME.drop.y;
    const held = game.held;
    const r = game.aimRadius;
    const appear = held !== null ? Math.min(1, (game.time - game.heldSince) / 0.2) : 0;
    const open = held === null ? 1 : 1 - easeInOut(appear);
    const hubY = Math.max(66, ballY - r - 12) - open * 10;
    const carriageY = this.railY() - 7;

    // the cable runs from the carriage on the rail down to the claw, however long that is
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, carriageY + 32);
    ctx.lineTo(cx, hubY);
    ctx.stroke();

    if (held !== null) {
      const s = settings.reduceMotion ? 1 : easeOutBack(appear);
      const sprite = this.art.sprite(held, TIERS[held].radius * this.scale * this.dpr);
      const half = TIERS[held].radius * sprite.extent * s;
      ctx.drawImage(sprite.canvas, cx - half, ballY - half, half * 2, half * 2);
    }

    for (const side of [-1, 1] as const) this.drawArm(cx, hubY, ballY, r, side, open);

    ctx.fillStyle = PINK_LIGHT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, hubY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // carriage
    roundRect(ctx, cx - 36, carriageY, 72, 36, 14);
    ctx.fillStyle = PINK;
    ctx.fill();
    ctx.stroke();
  }

  private drawArm(cx: number, hubY: number, ballY: number, r: number, side: -1 | 1, open: number): void {
    const ctx = this.ctx;
    // closed pose, relative to the hub
    const sx = side * 7;
    const sy = 6;
    const ctlx = side * (r + 16);
    const ctly = ballY - hubY - r * 0.55;
    const tx = side * r * 0.9;
    const ty = ballY - hubY + r * 0.18;
    const a = side * 0.75 * open;
    const rot = (x: number, y: number) => [cx + x * Math.cos(a) - y * Math.sin(a), hubY + x * Math.sin(a) + y * Math.cos(a)];
    const [x0, y0] = rot(sx, sy);
    const [x1, y1] = rot(ctlx, ctly);
    const [x2, y2] = rot(tx, ty);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, c] of [
      [8, INK],
      [3.5, PINK],
    ] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x1, y1, x2, y2);
      ctx.stroke();
    }
    ctx.fillStyle = PINK_LIGHT;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x2, y2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
