import { star } from './faces';
import { INK, withAlpha } from './palette';

type Shape = 'dot' | 'star' | 'heart';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: Shape;
  rot: number;
  spin: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
  size: number;
}

/**
 * Short-lived visual effects. Particles and rings live in container-local space (they move
 * with the box); popups and the flash live in stage space (always upright).
 */
export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private popups: Popup[] = [];
  private flashLife = 0;
  reduced = false;

  burst(x: number, y: number, radius: number, colors: string[], count: number): void {
    const n = this.reduced ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (0.6 + Math.random() * 0.8) * (160 + radius * 2.2);
      const shape: Shape = i % 5 === 0 ? 'heart' : i % 3 === 0 ? 'star' : 'dot';
      this.particles.push({
        x: x + Math.cos(a) * radius * 0.6,
        y: y + Math.sin(a) * radius * 0.6,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 60,
        life: 0,
        max: 0.5 + Math.random() * 0.4,
        size: 4 + Math.random() * 5 + radius * 0.04,
        color: colors[i % colors.length],
        shape,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  }

  ring(x: number, y: number, radius: number, color: string): void {
    this.rings.push({ x, y, r0: radius * 0.8, r1: radius * 1.6, life: 0, max: 0.35, color });
  }

  popup(x: number, y: number, text: string, color: string, size = 30): void {
    this.popups.push({ x, y, text, life: 0, max: 0.95, color, size });
  }

  flash(): void {
    if (!this.reduced) this.flashLife = 0.45;
  }

  clear(): void {
    this.particles.length = 0;
    this.rings.length = 0;
    this.popups.length = 0;
    this.flashLife = 0;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life += dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy = p.vy * (1 - 2.2 * dt) + 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const p of this.popups) p.life += dt;
    this.popups = this.popups.filter((p) => p.life < p.max);
    this.flashLife = Math.max(0, this.flashLife - dt);
  }

  drawLocal(ctx: CanvasRenderingContext2D): void {
    for (const r of this.rings) {
      const t = r.life / r.max;
      ctx.strokeStyle = withAlpha(r.color, 1 - t);
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const s = p.size * (1 - t * 0.4);
      if (p.shape === 'dot') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        star(ctx, 0, 0, s, p.color, false);
        ctx.restore();
      } else {
        heart(ctx, p.x, p.y, s * 0.9, p.rot * 0.3, p.color);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** `x, y, width, height`: the area the flash covers (the whole cabinet, in stage units). */
  drawStage(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.popups) {
      const t = p.life / p.max;
      const rise = easeOut(Math.min(1, t * 1.4)) * 46;
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : t < 0.3 ? 1.1 - ((t - 0.15) / 0.15) * 0.1 : 1;
      ctx.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      ctx.font = `900 ${Math.round(p.size * pop)}px "Zen Maru Gothic", "M PLUS Rounded 1c", system-ui, sans-serif`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(p.text, p.x, p.y - rise);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.strokeText(p.text, p.x, p.y - rise);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - rise);
    }
    ctx.globalAlpha = 1;
    if (this.flashLife > 0) {
      ctx.fillStyle = `rgba(255, 250, 230, ${(this.flashLife / 0.45) * 0.7})`;
      ctx.fillRect(x, y, width, height);
    }
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.fill();
  ctx.restore();
}
