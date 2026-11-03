import { CONTAINER, GAME, PHYSICS, type AbilityId } from '../config/game';
import { MAX_TIER, TIERS } from '../config/tiers';
import { Emitter } from '../core/Emitter';
import { createRng, randomSeed, type Rng } from '../core/rng';
import type { Body } from '../physics/Body';
import { World } from '../physics/World';
import { Abilities } from './Abilities';
import { Spawner } from './Spawner';
import type { BallData, GameEvents, GamePhase, GameSummary, SavedGame } from './types';

const W = CONTAINER.width;
const H = CONTAINER.height;

const shakeDuration = () => GAME.shake.swings * GAME.shake.swingTime + 0.25;

interface ShakeState {
  t: number;
  pulse: number;
}

interface FlipState {
  t: number;
  lidY: number;
  angle: number;
  prevAngle: number;
  remapped: boolean;
}

/** How the container should be drawn this frame. */
export interface ContainerView {
  /** Visual wobble of the whole box (shake). */
  offsetX: number;
  offsetY: number;
  /** Rotation of the box around its centre (flip), radians clockwise. */
  angle: number;
  /** Top edge of the closed box while flipping (<= 0). */
  lidY: number;
  /** 0..1: how far the lid is closed. */
  lid: number;
}

/**
 * All game rules, independent of rendering and input: dropping, merging, scoring,
 * unlocking bigger drops, the overflow/game-over rule and the four abilities.
 * Advance it with `update(dt)`; it runs the physics at a fixed rate internally.
 */
export class Game {
  readonly events = new Emitter<GameEvents>();
  readonly world: World<BallData>;
  readonly abilities = new Abilities();
  spawner!: Spawner;
  private rng!: Rng;

  phase: GamePhase = 'playing';
  /** Game time in seconds (stops while paused). */
  time = 0;
  score = 0;
  drops = 0;
  merges = 0;
  vanishes = 0;
  /** Largest tier seen this game. */
  bestTier = -1;
  discovered: boolean[] = [];

  /** Claw position (local x) and the ball it holds (null while reloading). */
  aimX = W / 2;
  held: number | null = null;
  heldSince = 0;
  private reload = 0;

  removeMode = false;
  private shake: ShakeState | null = null;
  private flip: FlipState | null = null;

  /** Seconds a ball has been above the line, and how close the pile is to it (0..1). */
  overflowTimer = 0;
  dangerLevel = 0;
  overflowBall: Body<BallData> | null = null;
  private overflowGraceUntil = 0;
  private chain = 0;
  private lastMergeAt = -Infinity;

  private acc = 0;
  /** Interpolation factor between the last two physics steps, for smooth rendering. */
  alpha = 0;

  constructor(seed = randomSeed()) {
    this.world = new World<BallData>({ width: W, height: H, ceiling: -900 }, PHYSICS);
    this.reset(seed);
  }

  reset(seed = randomSeed()): void {
    this.rng = createRng(seed);
    this.world.clear();
    this.world.gravityX = 0;
    this.world.gravityY = PHYSICS.gravity;
    this.world.lidY = null;
    this.spawner = new Spawner(this.rng);
    this.abilities.reset();
    this.phase = 'playing';
    this.time = 0;
    this.score = 0;
    this.drops = 0;
    this.merges = 0;
    this.vanishes = 0;
    this.bestTier = -1;
    this.discovered = TIERS.map(() => false);
    this.held = null;
    this.reload = 0;
    this.removeMode = false;
    this.shake = null;
    this.flip = null;
    this.overflowTimer = 0;
    this.dangerLevel = 0;
    this.overflowBall = null;
    this.overflowGraceUntil = 0;
    this.chain = 0;
    this.lastMergeAt = -Infinity;
    this.acc = 0;
    this.alpha = 0;
    this.events.emit('reset', undefined);
    this.loadNext();
    this.events.emit('score', { score: 0, added: 0 });
    this.events.emit('abilities', undefined);
  }

  // ------------------------------------------------------------------ queries

  get busy(): boolean {
    return this.shake !== null || this.flip !== null;
  }

  get flipping(): boolean {
    return this.flip !== null;
  }

  get canDrop(): boolean {
    return this.phase === 'playing' && !this.busy && !this.removeMode && this.held !== null;
  }

  /** Radius of the ball in (or about to enter) the claw. */
  get aimRadius(): number {
    return TIERS[this.held ?? this.spawner.next].radius;
  }

  canUse(id: AbilityId): boolean {
    if (this.phase !== 'playing' || this.busy || !this.abilities.has(id)) return false;
    if (id === 'remove' || id === 'flip' || id === 'shake') return this.world.bodies.length > 0;
    return true;
  }

  /** Whether a friend shows its shocked face: just hit hard, being shaken or flipped, or stuck above the line. */
  isShocked(b: Body<BallData>): boolean {
    return this.busy || b === this.overflowBall || (b.data.shockedUntil ?? 0) > this.time;
  }

  /** Tiers the "pick" ability may choose from. */
  pickOptions(): number[] {
    return Array.from({ length: this.spawner.maxDroppable + 1 }, (_, i) => i);
  }

  summary(): GameSummary {
    return {
      score: this.score,
      bestTier: this.bestTier,
      drops: this.drops,
      merges: this.merges,
      vanishes: this.vanishes,
      seconds: Math.round(this.time),
    };
  }

  // ------------------------------------------------------------------ saving

  /**
   * The game as it stands, for saving. Null when it can't be saved right now: after game
   * over, or mid-shake or mid-flip (the last save from before it is kept).
   */
  snapshot(): SavedGame | null {
    if (this.phase !== 'playing' || this.busy) return null;
    const r = (n: number) => Math.round(n * 100) / 100;
    return {
      v: 1,
      rng: this.rng.state,
      time: r(this.time),
      score: this.score,
      drops: this.drops,
      merges: this.merges,
      vanishes: this.vanishes,
      bestTier: this.bestTier,
      discovered: this.discovered.slice(),
      aimX: r(this.aimX),
      held: this.held,
      reload: r(Math.max(0, this.reload)),
      spawner: this.spawner.save(),
      abilities: this.abilities.save(),
      balls: this.world.bodies.map((b) => [
        b.data.tier,
        r(b.x),
        r(b.y),
        r(b.vx),
        r(b.vy),
        r(b.angle),
        r(b.omega),
        b.sleeping ? 1 : 0,
      ]),
    };
  }

  /** Continue a saved game. Returns false (and leaves a fresh game) if the save is unusable. */
  restore(s: SavedGame): boolean {
    const tierOk = (t: unknown) => Number.isInteger(t) && (t as number) >= 0 && (t as number) <= MAX_TIER;
    const finite = (...ns: unknown[]) => ns.every((n) => typeof n === 'number' && Number.isFinite(n));
    if (
      !s ||
      s.v !== 1 ||
      !Array.isArray(s.balls) ||
      !s.balls.every((b) => Array.isArray(b) && b.length === 8 && tierOk(b[0]) && finite(...b)) ||
      !finite(s.rng, s.time, s.score, s.aimX) ||
      (s.held !== null && !tierOk(s.held)) ||
      !tierOk(s.spawner?.upcoming) ||
      !tierOk(s.spawner?.largest)
    ) {
      this.reset();
      return false;
    }
    this.reset();
    this.rng.state = s.rng >>> 0;
    this.spawner.load(s.spawner);
    this.abilities.load(s.abilities ?? {});
    this.time = s.time;
    this.score = s.score;
    this.drops = s.drops | 0;
    this.merges = s.merges | 0;
    this.vanishes = s.vanishes | 0;
    this.bestTier = tierOk(s.bestTier) ? s.bestTier : -1;
    this.discovered = TIERS.map((_, i) => s.discovered?.[i] === true);
    this.held = s.held;
    this.heldSince = this.time - 1;
    this.reload = s.reload || 0;
    for (const [tier, x, y, vx, vy, angle, omega, asleep] of s.balls) {
      const r = TIERS[tier].radius;
      const b = this.world.add(Math.min(W - r, Math.max(r, x)), Math.min(H - r, y), r, {
        tier,
        bornAt: this.time - 10,
        graceUntil: 0,
        merged: false,
      });
      b.vx = vx;
      b.vy = vy;
      b.angle = b.lastAngle = angle;
      b.omega = omega;
      b.sleeping = asleep === 1;
    }
    this.setAim(s.aimX);
    // A moment to get your bearings before the overflow rule applies again.
    this.overflowGraceUntil = this.time + GAME.overflow.time;
    this.events.emit('score', { score: this.score, added: 0 });
    this.events.emit('next', { tier: this.spawner.next });
    if (this.held !== null) this.events.emit('held', { tier: this.held });
    this.events.emit('abilities', undefined);
    return true;
  }

  containerView(): ContainerView {
    const view: ContainerView = { offsetX: 0, offsetY: 0, angle: 0, lidY: 0, lid: 0 };
    if (this.shake) {
      // One half-sine sway per swing, opposite to the way the balls are thrown.
      const { amplitude, swingTime } = GAME.shake;
      const t = this.shake.t;
      const k = Math.max(0, 1 - t / shakeDuration()) ** 0.5;
      view.offsetX = amplitude * Math.sin((Math.PI * t) / swingTime) * k;
      view.offsetY = -amplitude * 0.25 * Math.abs(Math.sin((Math.PI * t) / swingTime)) * k;
    }
    const f = this.flip;
    if (f) {
      const { closeTime, rotateTime, openTime } = GAME.flip;
      view.lidY = f.lidY;
      view.angle = f.prevAngle + (f.angle - f.prevAngle) * this.alpha;
      view.lid = f.remapped ? Math.max(0, 1 - (f.t - closeTime - rotateTime) / openTime) : Math.min(1, f.t / closeTime);
    }
    return view;
  }

  // ------------------------------------------------------------------ player actions

  setAim(x: number): void {
    const r = this.aimRadius;
    this.aimX = Math.min(W - r, Math.max(r, x));
  }

  drop(): boolean {
    if (!this.canDrop || this.held === null) return false;
    const tier = this.held;
    const r = TIERS[tier].radius;
    const wobble = (this.rng() - 0.5) * GAME.drop.jitter;
    const x = Math.min(W - r, Math.max(r, this.aimX + wobble));
    const body = this.world.add(x, GAME.drop.y, r, {
      tier,
      bornAt: this.time,
      graceUntil: this.time + GAME.drop.grace,
      merged: false,
    });
    body.vy = 80;
    this.held = null;
    this.reload = GAME.drop.cooldown;
    this.drops++;
    this.events.emit('drop', { tier, x });
    return true;
  }

  /** Shake and flip act immediately, remove toggles target mode, pick needs `pick(tier)`. */
  useAbility(id: AbilityId): boolean {
    if (id === 'remove' && this.removeMode) {
      this.setRemoveMode(false);
      return true;
    }
    if (!this.canUse(id)) return false;
    switch (id) {
      case 'remove':
        this.setRemoveMode(true);
        return true;
      case 'pick':
        return true;
      case 'shake':
        this.abilities.consume(id);
        this.startShake();
        break;
      case 'flip':
        this.abilities.consume(id);
        this.startFlip();
        break;
    }
    this.events.emit('abilityUsed', { id });
    this.events.emit('abilities', undefined);
    return true;
  }

  setRemoveMode(active: boolean): void {
    if (this.removeMode === active) return;
    this.removeMode = active;
    this.events.emit('removeMode', { active });
  }

  /** In remove mode: pop the ball under the point (container-local coordinates). */
  removeAt(x: number, y: number): boolean {
    if (!this.removeMode || !this.canUse('remove')) return false;
    const b = this.world.bodyAt(x, y, 6);
    if (!b) return false;
    const { tier } = b.data;
    const bx = b.x;
    const by = b.y;
    this.world.remove(b);
    this.abilities.consume('remove');
    this.setRemoveMode(false);
    this.events.emit('removed', { tier, x: bx, y: by });
    this.events.emit('abilityUsed', { id: 'remove' });
    this.events.emit('abilities', undefined);
    return true;
  }

  /** Replace the ball in the claw with a chosen (unlocked) tier. */
  pick(tier: number): boolean {
    if (!this.canUse('pick') || !this.spawner.canDrop(tier)) return false;
    this.abilities.consume('pick');
    this.held = tier;
    this.heldSince = this.time;
    this.reload = 0;
    this.setAim(this.aimX);
    this.events.emit('held', { tier });
    this.events.emit('abilityUsed', { id: 'pick' });
    this.events.emit('abilities', undefined);
    return true;
  }

  // ------------------------------------------------------------------ simulation

  update(dt: number): void {
    if (this.phase !== 'playing') return;
    const step = GAME.fixedStep;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= step && this.phase === 'playing') {
      this.fixedStep(step);
      this.acc -= step;
      if (++n >= 10) {
        this.acc = 0;
        break;
      }
    }
    this.alpha = this.phase === 'playing' ? this.acc / step : 1;
  }

  private fixedStep(h: number): void {
    this.time += h;
    if (this.held === null && !this.flip) {
      this.reload -= h;
      if (this.reload <= 0) this.loadNext();
    }
    this.stepShake(h);
    this.stepFlip(h);
    this.world.step(h);
    this.noteHits();
    this.resolveMerges();
    this.checkOverflow(h);
  }

  /** A hard hit shocks a friend for a moment: the harder the hit, the longer the face. */
  private noteHits(): void {
    const { impactSpeed, hardSpeed, time, maxTime } = GAME.shock;
    for (const b of this.world.bodies) {
      if (b.impact < impactSpeed) continue;
      const k = Math.min(1, (b.impact - impactSpeed) / (hardSpeed - impactSpeed));
      const until = this.time + time + (maxTime - time) * k;
      if (until > (b.data.shockedUntil ?? 0)) b.data.shockedUntil = until;
    }
  }

  private loadNext(): void {
    const tier = this.spawner.take();
    this.held = tier;
    this.heldSince = this.time;
    this.see(tier);
    this.setAim(this.aimX);
    this.events.emit('held', { tier });
    this.events.emit('next', { tier: this.spawner.next });
  }

  /** Track discoveries, the best tier and drop unlocks. */
  private see(tier: number): void {
    const isNew = !this.discovered[tier];
    this.discovered[tier] = true;
    let unlocked: number | null = null;
    if (tier > this.bestTier) {
      this.bestTier = tier;
      unlocked = this.spawner.observe(tier);
    }
    // Emit only after all state is updated, so listeners see a consistent game.
    if (isNew) this.events.emit('discover', { tier });
    if (unlocked !== null) this.events.emit('unlock', { tier: unlocked });
  }

  private resolveMerges(): void {
    const t = this.world.touching;
    for (let i = 0; i < t.length; i += 2) {
      const a = t[i];
      const b = t[i + 1];
      if (a.removed || b.removed || a.data.tier !== b.data.tier) continue;
      this.merge(a, b);
    }
  }

  private merge(a: Body<BallData>, b: Body<BallData>): void {
    const tier = a.data.tier;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const vx = (a.vx + b.vx) / 2;
    const vy = (a.vy + b.vy) / 2;
    const startRadius = Math.max(a.radius, b.radius);
    this.world.remove(a);
    this.world.remove(b);
    this.merges++;
    this.chain = this.time - this.lastMergeAt < 0.6 ? this.chain + 1 : 1;
    this.lastMergeAt = this.time;
    // Abilities are earned by merging, not by dropping.
    for (const id of this.abilities.onMerge()) this.events.emit('abilityReady', { id });
    this.events.emit('abilities', undefined);

    const points = GAME.scoring.points[tier] ?? 0;
    if (tier >= MAX_TIER) {
      const total = points + GAME.scoring.vanishBonus;
      this.vanishes++;
      this.addScore(total);
      this.events.emit('vanish', { tier, x, y, points: total });
      return;
    }

    const next = tier + 1;
    const body = this.world.add(
      x,
      y,
      TIERS[next].radius,
      { tier: next, bornAt: this.time, graceUntil: 0, merged: true },
      { startRadius, growTime: GAME.merge.growTime },
    );
    body.vx = vx;
    body.vy = vy;
    this.addScore(points);
    this.events.emit('merge', { tier: next, x, y, points, chain: this.chain });
    this.see(next);
  }

  private addScore(points: number): void {
    this.score += points;
    this.events.emit('score', { score: this.score, added: points });
  }

  private checkOverflow(h: number): void {
    if (this.flip || this.time < this.overflowGraceUntil) {
      this.overflowTimer = 0;
      this.dangerLevel = 0;
      this.overflowBall = null;
      return;
    }
    const line = GAME.overflow.lineY;
    let highest = Infinity;
    let culprit: Body<BallData> | null = null;
    for (const b of this.world.bodies) {
      if (b.data.graceUntil > this.time) continue;
      const top = b.y - b.radius;
      if (top < highest) {
        highest = top;
        culprit = b;
      }
    }
    this.dangerLevel = culprit ? Math.min(1, Math.max(0, 1 - (highest - line) / GAME.overflow.warnDistance)) : 0;
    if (culprit && highest < line) {
      this.overflowTimer += h;
      this.overflowBall = culprit;
      if (this.overflowTimer >= GAME.overflow.time) this.endGame();
    } else {
      this.overflowTimer = 0;
      this.overflowBall = null;
    }
  }

  private endGame(): void {
    this.phase = 'over';
    this.setRemoveMode(false);
    this.events.emit('gameOver', this.summary());
  }

  // ------------------------------------------------------------------ abilities

  private startShake(): void {
    this.setRemoveMode(false);
    this.shake = { t: 0, pulse: 0 };
    this.world.wakeAll();
    this.overflowGraceUntil = Math.max(this.overflowGraceUntil, this.time + shakeDuration() + 0.8);
  }

  private stepShake(h: number): void {
    const s = this.shake;
    if (!s) return;
    const { swings, swingTime, kickX, kickY } = GAME.shake;
    while (s.pulse < swings && s.t >= s.pulse * swingTime) {
      // The box jerks one way, so its contents are thrown the other way; the last swings fade.
      const dir = s.pulse % 2 === 0 ? -1 : 1;
      const strength = s.pulse < swings - 2 ? 1 : 0.55;
      this.world.wakeAll();
      for (const b of this.world.bodies) {
        b.vx += dir * kickX * strength * (0.6 + 0.8 * this.rng());
        b.vy -= kickY * strength * (0.3 + 0.7 * this.rng());
        b.omega += (this.rng() * 2 - 1) * 4;
      }
      s.pulse++;
    }
    s.t += h;
    if (s.t >= shakeDuration()) this.shake = null;
  }

  private startFlip(): void {
    this.setRemoveMode(false);
    let top = 0;
    for (const b of this.world.bodies) top = Math.min(top, b.y - b.radius);
    const lidY = Math.min(0, top - 1);
    this.flip = { t: 0, lidY, angle: 0, prevAngle: 0, remapped: false };
    this.world.lidY = lidY;
    this.world.wakeAll();
  }

  private stepFlip(h: number): void {
    const f = this.flip;
    if (!f) return;
    const { closeTime, rotateTime, openTime, grace } = GAME.flip;
    const g = PHYSICS.gravity;
    f.t += h;
    f.prevAngle = f.angle;
    if (!f.remapped) {
      const u = Math.min(1, Math.max(0, (f.t - closeTime) / rotateTime));
      f.angle = Math.PI * (0.5 - 0.5 * Math.cos(Math.PI * u));
      this.world.gravityX = g * Math.sin(f.angle);
      this.world.gravityY = g * Math.cos(f.angle);
      if (u >= 1) {
        // The box is upside down: mirror everything through the centre and stand it upright.
        this.world.flipThroughCentre(f.lidY);
        f.remapped = true;
        f.angle = f.prevAngle = 0;
        this.world.gravityX = 0;
        this.world.gravityY = g;
        this.world.lidY = null;
        this.world.wakeAll();
      }
    } else if (f.t >= closeTime + rotateTime + openTime) {
      this.flip = null;
      this.overflowGraceUntil = this.time + grace;
      this.events.emit('flipDone', undefined);
    }
  }
}
