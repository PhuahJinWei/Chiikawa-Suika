import type { CapStyle, TierLook } from '../config/tiers';
import { BLUSH, BLUSH_LINE, GOLD, INK, mix } from './palette';

/**
 * Placeholder ball art: a soft pastel ball with a simple kawaii face, drawn centred at (0,0)
 * with radius R. Used for any tier whose picture has not been added yet.
 */
export function drawPlaceholder(ctx: CanvasRenderingContext2D, R: number, look: TierLook, seed: number): void {
  // body
  wobblyCircle(ctx, R, seed);
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.45, R * 0.05, 0, 0, R * 1.05);
  g.addColorStop(0, mix(look.color, '#ffffff', 0.65));
  g.addColorStop(0.6, look.color);
  g.addColorStop(1, mix(look.color, '#b48a70', 0.16));
  ctx.fillStyle = g;
  ctx.fill();

  if (look.cap) {
    ctx.save();
    wobblyCircle(ctx, R, seed);
    ctx.clip();
    ctx.fillStyle = look.cap.color;
    drawCap(ctx, R, look.cap.style);
    ctx.restore();
  }

  // glossy highlight
  ctx.save();
  wobblyCircle(ctx, R, seed);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-R * 0.4, -R * 0.52, R * 0.26, R * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawBallOutline(ctx, R, seed);

  ctx.lineCap = 'round';
  if (look.blush) drawBlush(ctx, R);
  drawEyes(ctx, R, look.eyes);
  drawMouth(ctx, R, look.mouth);
  if (look.extra) drawExtra(ctx, R, look.extra);
}

/** Thickness of the hand-drawn outline every ball gets, as a fraction of its radius. */
export const OUTLINE_WIDTH = 0.07;

/** The shared hand-drawn outline drawn on every ball (placeholders and your pictures alike). */
export function drawBallOutline(ctx: CanvasRenderingContext2D, R: number, seed: number): void {
  const lw = Math.max(1.2, R * OUTLINE_WIDTH);
  wobblyCircle(ctx, R - lw * 0.35, seed);
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Clip to the ball's (slightly hand-drawn) circle. Call inside save()/restore(). */
export function clipToBall(ctx: CanvasRenderingContext2D, R: number, seed: number): void {
  wobblyCircle(ctx, R, seed);
  ctx.clip();
}

function wobblyCircle(ctx: CanvasRenderingContext2D, R: number, seed: number): void {
  ctx.beginPath();
  const n = 56;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = R * (1 + 0.011 * Math.sin(3 * a + seed) + 0.007 * Math.sin(7 * a + seed * 1.7));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawCap(ctx: CanvasRenderingContext2D, R: number, style: CapStyle): void {
  ctx.beginPath();
  switch (style) {
    case 'split': {
      // two coloured lobes with a pale wedge down the forehead
      ctx.moveTo(-R * 1.2, R * 0.08);
      ctx.quadraticCurveTo(-R * 0.6, -R * 0.12, -R * 0.2, -R * 0.1);
      ctx.quadraticCurveTo(-R * 0.06, -R * 0.5, 0, -R * 1.15);
      ctx.quadraticCurveTo(R * 0.06, -R * 0.5, R * 0.2, -R * 0.1);
      ctx.quadraticCurveTo(R * 0.6, -R * 0.12, R * 1.2, R * 0.08);
      ctx.lineTo(R * 1.2, -R * 1.3);
      ctx.lineTo(-R * 1.2, -R * 1.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'top': {
      // cap with a scalloped edge
      ctx.moveTo(-R * 1.2, -R * 0.32);
      const bumps = 5;
      for (let i = 0; i < bumps; i++) {
        const x0 = -R * 1.2 + (i * 2.4 * R) / bumps;
        const x1 = x0 + (2.4 * R) / bumps;
        ctx.quadraticCurveTo((x0 + x1) / 2, -R * 0.14, x1, -R * 0.32);
      }
      ctx.lineTo(R * 1.2, -R * 1.3);
      ctx.lineTo(-R * 1.2, -R * 1.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'ears': {
      for (const s of [-1, 1]) {
        ctx.moveTo(s * R * 0.62 + R * 0.3, -R * 0.66);
        ctx.arc(s * R * 0.62, -R * 0.66, R * 0.3, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    }
    case 'spots': {
      const spots: [number, number, number][] = [
        [-0.55, -0.55, 0.2],
        [0.15, -0.78, 0.14],
        [0.62, -0.42, 0.17],
        [-0.72, 0.42, 0.12],
        [0.58, 0.62, 0.15],
      ];
      for (const [x, y, r] of spots) {
        ctx.moveTo(R * (x + r), R * y);
        ctx.arc(R * x, R * y, R * r, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    }
    case 'mane': {
      const n = 13;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 0.82 + (i / (n - 1)) * Math.PI * 1.36;
        const x = Math.cos(a) * R * 0.98;
        const y = Math.sin(a) * R * 0.98;
        ctx.moveTo(x + R * 0.24, y);
        ctx.arc(x, y, R * 0.24, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    }
    case 'helmet': {
      ctx.rect(-R * 1.2, -R * 1.3, R * 2.4, R * 1.1);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, R * 0.045);
      ctx.beginPath();
      ctx.moveTo(-R, -R * 0.2);
      ctx.lineTo(R, -R * 0.2);
      ctx.stroke();
      ctx.fillStyle = mix('#b7c2cf', '#ffffff', 0.5);
      for (const x of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.arc(R * x, -R * 0.42, R * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'band': {
      ctx.rect(-R * 1.2, -R * 0.62, R * 2.4, R * 0.26);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(R * 0.72, -R * 0.5, R * 0.14, R * 0.09, 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function drawBlush(ctx: CanvasRenderingContext2D, R: number): void {
  for (const s of [-1, 1]) {
    const cx = s * R * 0.52;
    const cy = R * 0.2;
    ctx.fillStyle = BLUSH;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.15, R * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = BLUSH_LINE;
    ctx.lineWidth = Math.max(0.8, R * 0.022);
    for (const dx of [-0.06, 0, 0.06]) {
      ctx.beginPath();
      ctx.moveTo(cx + R * (dx - 0.02), cy + R * 0.035);
      ctx.lineTo(cx + R * (dx + 0.02), cy - R * 0.035);
      ctx.stroke();
    }
  }
}

function drawEyes(ctx: CanvasRenderingContext2D, R: number, style: TierLook['eyes']): void {
  const ey = R * 0.02;
  const lw = Math.max(1, R * 0.045);
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  for (const s of [-1, 1]) {
    const ex = s * R * 0.3;
    const kind = style === 'wink' && s === 1 ? 'happy' : style === 'wink' ? 'bead' : style;
    ctx.fillStyle = INK;
    switch (kind) {
      case 'bead':
        ctx.beginPath();
        ctx.ellipse(ex, ey, R * 0.07, R * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        highlight(ctx, ex + R * 0.022, ey - R * 0.035, R * 0.028);
        break;
      case 'dot':
        ctx.beginPath();
        ctx.arc(ex, ey, R * 0.07, 0, Math.PI * 2);
        ctx.fill();
        highlight(ctx, ex + R * 0.02, ey - R * 0.025, R * 0.022);
        break;
      case 'round':
        ctx.beginPath();
        ctx.arc(ex, ey, R * 0.11, 0, Math.PI * 2);
        ctx.fill();
        highlight(ctx, ex + R * 0.035, ey - R * 0.04, R * 0.04);
        highlight(ctx, ex - R * 0.035, ey + R * 0.04, R * 0.018);
        break;
      case 'sparkle':
        ctx.beginPath();
        ctx.arc(ex, ey, R * 0.1, 0, Math.PI * 2);
        ctx.fill();
        highlight(ctx, ex + R * 0.03, ey - R * 0.035, R * 0.035);
        highlight(ctx, ex - R * 0.03, ey + R * 0.03, R * 0.02);
        highlight(ctx, ex + R * 0.035, ey + R * 0.035, R * 0.012);
        break;
      case 'happy':
        ctx.beginPath();
        ctx.moveTo(ex - R * 0.08, ey + R * 0.03);
        ctx.quadraticCurveTo(ex, ey - R * 0.1, ex + R * 0.08, ey + R * 0.03);
        ctx.stroke();
        break;
      case 'sleepy':
        ctx.beginPath();
        ctx.moveTo(ex - R * 0.08, ey - R * 0.01);
        ctx.quadraticCurveTo(ex, ey + R * 0.08, ex + R * 0.08, ey - R * 0.01);
        ctx.stroke();
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(ex - R * 0.07, ey);
        ctx.lineTo(ex + R * 0.07, ey);
        ctx.stroke();
        break;
    }
  }
}

function highlight(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
}

function drawMouth(ctx: CanvasRenderingContext2D, R: number, style: TierLook['mouth']): void {
  const lw = Math.max(1, R * 0.04);
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  const my = R * 0.2;
  ctx.beginPath();
  switch (style) {
    case 'w':
    case 'cat':
      if (style === 'cat') {
        ctx.moveTo(-R * 0.035, my - R * 0.08);
        ctx.lineTo(R * 0.035, my - R * 0.08);
        ctx.lineTo(0, my - R * 0.035);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
      }
      ctx.moveTo(-R * 0.1, my - R * 0.02);
      ctx.quadraticCurveTo(-R * 0.05, my + R * 0.08, 0, my - R * 0.01);
      ctx.quadraticCurveTo(R * 0.05, my + R * 0.08, R * 0.1, my - R * 0.02);
      ctx.stroke();
      break;
    case 'smile':
      ctx.moveTo(-R * 0.08, my - R * 0.02);
      ctx.quadraticCurveTo(0, my + R * 0.09, R * 0.08, my - R * 0.02);
      ctx.stroke();
      break;
    case 'open':
    case 'v': {
      if (style === 'open') {
        ctx.moveTo(-R * 0.09, my - R * 0.03);
        ctx.quadraticCurveTo(0, my + R * 0.18, R * 0.09, my - R * 0.03);
      } else {
        ctx.moveTo(-R * 0.08, my - R * 0.03);
        ctx.lineTo(R * 0.08, my - R * 0.03);
        ctx.lineTo(0, my + R * 0.1);
      }
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#f2788f';
      ctx.beginPath();
      ctx.ellipse(0, my + R * 0.09, R * 0.06, R * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'o':
      ctx.ellipse(0, my + R * 0.02, R * 0.045, R * 0.055, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'flat':
      ctx.moveTo(-R * 0.06, my + R * 0.02);
      ctx.lineTo(R * 0.06, my + R * 0.02);
      ctx.stroke();
      break;
  }
}

function drawExtra(ctx: CanvasRenderingContext2D, R: number, extra: NonNullable<TierLook['extra']>): void {
  const lw = Math.max(1, R * 0.035);
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  switch (extra) {
    case 'sweat': {
      const x = R * 0.62;
      const y = -R * 0.38;
      const s = R * 0.12;
      ctx.fillStyle = '#bfe3ff';
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.3);
      ctx.quadraticCurveTo(x + s, y, x, y + s * 0.6);
      ctx.quadraticCurveTo(x - s, y, x, y - s * 1.3);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'sparkle':
    case 'star':
      star(ctx, extra === 'star' ? R * 0.58 : R * 0.55, extra === 'star' ? R * 0.5 : -R * 0.6, R * 0.13, GOLD);
      break;
    case 'sprout': {
      ctx.strokeStyle = '#5c9a62';
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.68);
      ctx.lineTo(0, -R * 0.86);
      ctx.stroke();
      ctx.fillStyle = '#8fd19a';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * R * 0.09, -R * 0.88, R * 0.1, R * 0.05, s * -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      break;
    }
    case 'brows':
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * R * 0.4, -R * 0.2);
        ctx.lineTo(s * R * 0.2, -R * 0.14);
        ctx.stroke();
      }
      break;
    case 'crown': {
      const w = R * 0.4;
      const y = -R * 0.6;
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(-w / 2, y);
      ctx.lineTo(-w / 2, y - R * 0.18);
      ctx.lineTo(-w / 4, y - R * 0.08);
      ctx.lineTo(0, y - R * 0.22);
      ctx.lineTo(w / 4, y - R * 0.08);
      ctx.lineTo(w / 2, y - R * 0.18);
      ctx.lineTo(w / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke = true): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) ctx.stroke();
}
