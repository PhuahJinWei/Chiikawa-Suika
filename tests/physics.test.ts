import { describe, expect, it } from 'vitest';
import { CONTAINER, GAME, PHYSICS } from '../src/config/game';
import { MAX_TIER, TIERS } from '../src/config/tiers';
import { createRng } from '../src/core/rng';
import { World, type PhysicsConfig } from '../src/physics/World';

const STEP = 1 / 120;
const W = CONTAINER.width;
const H = CONTAINER.height;

function makeWorld(overrides: Partial<PhysicsConfig> = {}) {
  return new World<{ tier: number }>({ width: W, height: H, ceiling: -1000 }, { ...PHYSICS, ...overrides });
}

function run(world: World<unknown>, seconds: number) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) world.step(STEP);
}

function maxOverlap(world: World<unknown>): number {
  let worst = 0;
  const bs = world.bodies;
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i];
      const b = bs[j];
      const o = a.radius + b.radius - Math.hypot(b.x - a.x, b.y - a.y);
      if (o > worst) worst = o;
    }
  }
  return worst;
}

function outOfBounds(world: World<unknown>, top = -1000): number {
  const eps = 1e-6;
  return world.bodies.filter(
    (b) => b.x - b.radius < -eps || b.x + b.radius > W + eps || b.y + b.radius > H + eps || b.y - b.radius < top - eps,
  ).length;
}

function maxSpeed(world: World<unknown>): number {
  return Math.max(0, ...world.bodies.map((b) => Math.max(b.speed, Math.abs(b.omega * b.radius))));
}

/** Real motion over the last step (ignores sub-pixel substep noise). */
function maxMotion(world: World<unknown>): number {
  return Math.max(0, ...world.bodies.map((b) => b.motion));
}

/** Drops `count` random small/medium balls one by one, like a player would. */
function dropPile(world: World<{ tier: number }>, count: number, seed: number, maxTier = 4, gap = 0.3) {
  const rng = createRng(seed);
  for (let i = 0; i < count; i++) {
    const tier = Math.floor(rng() * (maxTier + 1));
    const r = TIERS[tier].radius;
    world.add(r + rng() * (W - 2 * r), -82, r, { tier });
    run(world, gap);
  }
}

describe('physics world', () => {
  it('a dropped ball lands, bounces a little and goes to sleep on the floor', () => {
    const world = makeWorld();
    const r = TIERS[2].radius;
    const ball = world.add(W / 2, -82, r, { tier: 2 });
    let bounces = 0;
    let wasRising = false;
    let t = 0;
    while (!ball.sleeping && t < 5) {
      world.step(STEP);
      t += STEP;
      const rising = ball.vy < -1;
      if (rising && !wasRising) bounces++;
      wasRising = rising;
    }
    expect(ball.sleeping).toBe(true);
    expect(t).toBeLessThan(2.5);
    expect(bounces).toBeLessThanOrEqual(2);
    expect(ball.y).toBeCloseTo(H - r, 3);
    expect(ball.x).toBeCloseTo(W / 2, 3);
  });

  it('a random pile settles with no overlap, no escapes and everything asleep', () => {
    const world = makeWorld();
    dropPile(world, 70, 7);
    let settle = 0;
    while (world.bodies.some((b) => !b.sleeping) && settle < 10) {
      world.step(STEP);
      settle += STEP;
    }
    const overlap = maxOverlap(world);
    console.log(`pile: ${world.bodies.length} balls, settled ${settle.toFixed(2)}s after last drop, max overlap ${overlap.toFixed(3)}`);
    expect(world.bodies.every((b) => b.sleeping)).toBe(true);
    expect(settle).toBeLessThan(4);
    expect(overlap).toBeLessThan(0.75);
    expect(outOfBounds(world)).toBe(0);
  });

  it('stays still without the help of sleeping (no resting jitter)', () => {
    const world = makeWorld({ sleepTime: Infinity });
    dropPile(world, 60, 11);
    run(world, 7);
    const before = world.bodies.map((b) => [b.x, b.y] as const);
    let motion = 0;
    for (let i = 0; i < 240; i++) {
      world.step(STEP);
      motion = Math.max(motion, maxMotion(world));
    }
    const drift = Math.max(...world.bodies.map((b, i) => Math.hypot(b.x - before[i][0], b.y - before[i][1])));
    console.log(`no-sleep pile: max motion ${motion.toFixed(3)} u/s, drift over 2s ${drift.toFixed(3)} u, overlap ${maxOverlap(world).toFixed(3)}`);
    // Without sleeping, a pile may still settle very slowly, but must never visibly shake.
    expect(motion).toBeLessThan(2);
    expect(drift).toBeLessThan(3);
    expect(maxOverlap(world)).toBeLessThan(0.75);
  });

  it('reports hard hits as impacts, and resting contacts as none', () => {
    const world = makeWorld({ sleepTime: Infinity }); // stay awake, so resting contacts stay in the solver
    const r = TIERS[3].radius;
    const ball = world.add(W / 2, H - r - 300, r, { tier: 3 });
    let landing = 0;
    for (let i = 0; i < 60; i++) {
      world.step(STEP);
      landing = Math.max(landing, ball.impact);
    }
    // a 300-unit fall meets the floor at about 1250 units/s
    expect(landing).toBeGreaterThan(1100);
    dropPile(world, 30, 5);
    run(world, 4);
    let resting = 0;
    for (let i = 0; i < 240; i++) {
      world.step(STEP);
      for (const b of world.bodies) resting = Math.max(resting, b.impact);
    }
    console.log(`impacts: landing ${landing.toFixed(0)} u/s, hardest in a resting pile ${resting.toFixed(1)} u/s`);
    expect(resting).toBeLessThan(GAME.shock.impactSpeed / 10);
  });

  it('a heavy ball resting on small ones does not sink into them', () => {
    const world = makeWorld();
    for (let i = 0; i < 14; i++) world.add(21 + i * 42.5, H - 21, 21, { tier: 0 });
    run(world, 1);
    world.add(W / 2 + 7, -150, TIERS[MAX_TIER].radius, { tier: MAX_TIER });
    world.add(W / 2 - 60, -500, TIERS[MAX_TIER - 1].radius, { tier: MAX_TIER - 1 });
    run(world, 6);
    const overlap = maxOverlap(world);
    console.log(`heavy stack: max overlap ${overlap.toFixed(3)}`);
    expect(overlap).toBeLessThan(1.5);
    expect(outOfBounds(world)).toBe(0);
    expect(world.bodies.every((b) => b.sleeping)).toBe(true);
  });

  it('flipping the closed box tumbles the pile and it settles again', () => {
    const world = makeWorld();
    dropPile(world, 45, 3);
    run(world, 2);
    const lidY = Math.min(0, ...world.bodies.map((b) => b.y - b.radius)) - 1;
    world.lidY = lidY;
    world.wakeAll();
    const g = PHYSICS.gravity;
    const steps = Math.round(1.2 / STEP);
    for (let i = 1; i <= steps; i++) {
      const th = Math.PI * (0.5 - 0.5 * Math.cos((Math.PI * i) / steps));
      world.gravityX = g * Math.sin(th);
      world.gravityY = g * Math.cos(th);
      world.step(STEP);
      expect(outOfBounds(world, lidY)).toBe(0);
    }
    world.flipThroughCentre(lidY);
    world.gravityX = 0;
    world.gravityY = g;
    world.lidY = null;
    let t = 0;
    while (world.bodies.some((b) => !b.sleeping) && t < 10) {
      world.step(STEP);
      t += STEP;
    }
    const overlap = maxOverlap(world);
    console.log(`flip: settled ${t.toFixed(2)}s after flip, overlap ${overlap.toFixed(3)}`);
    expect(world.bodies.every((b) => b.sleeping)).toBe(true);
    expect(overlap).toBeLessThan(0.75);
    expect(outOfBounds(world)).toBe(0);
  });

  it('a growing ball pushes neighbours aside gently instead of launching them', () => {
    const world = makeWorld();
    dropPile(world, 40, 21);
    run(world, 2);
    const victim = world.bodies[world.bodies.length - 5];
    world.remove(victim);
    world.add(victim.x, victim.y, victim.radius * 1.6, { tier: 0 }, { startRadius: victim.radius, growTime: 0.12 });
    let fastest = 0;
    for (let i = 0; i < 60; i++) {
      world.step(STEP);
      fastest = Math.max(fastest, maxSpeed(world));
    }
    console.log(`grow: fastest body during growth ${fastest.toFixed(1)} u/s`);
    expect(fastest).toBeLessThan(900);
    run(world, 4);
    expect(maxOverlap(world)).toBeLessThan(0.75);
  });
});

/** Behaviour a player expects from round things; none of these may be special-cased. */
describe('natural ball behaviour', () => {
  const onFloor = (b: { y: number; radius: number }) => Math.abs(b.y - (H - b.radius)) < 1.5;

  it('a ball cannot balance on top of a single ball: it rolls off', () => {
    const world = makeWorld();
    const base = world.add(W / 2, H - 47, 47, { tier: 3 });
    run(world, 0.5);
    const top = world.add(W / 2 + 3, H - 2 * 47 - 37 - 2, 37, { tier: 2 });
    run(world, 5);
    console.log(`balance: top ball moved ${(top.x - base.x).toFixed(1)} sideways, on floor: ${onFloor(top)}`);
    expect(onFloor(top)).toBe(true);
    expect(world.bodies.every((b) => b.sleeping)).toBe(true);
  });

  it('a ball can rest in the dip between two balls', () => {
    const world = makeWorld();
    world.add(W / 2 - 47, H - 47, 47, { tier: 3 });
    world.add(W / 2 + 47.5, H - 47, 47, { tier: 3 });
    run(world, 0.5);
    const top = world.add(W / 2 + 4, H - 220, 37, { tier: 2 });
    run(world, 5);
    expect(onFloor(top)).toBe(false);
    expect(Math.abs(top.x - W / 2)).toBeLessThan(20);
    expect(world.bodies.every((b) => b.sleeping)).toBe(true);
  });

  it('dropping into the gap beside a ball that leans on the wall pushes that ball away', () => {
    const world = makeWorld();
    const big = world.add(37, H - 37, 37, { tier: 2 });
    run(world, 0.5);
    const small = world.add(22, -82, 22, { tier: 0 });
    run(world, 4);
    console.log(`wall wedge: big ball pushed ${(big.x - 37).toFixed(1)} to the right, small on floor: ${onFloor(small)}`);
    expect(big.x - 37).toBeGreaterThan(15);
    expect(onFloor(small)).toBe(true);
  });

  it('a rolling ball slows down and stops on its own', () => {
    const world = makeWorld();
    const ball = world.add(80, H - 37, 37, { tier: 2 });
    run(world, 0.3);
    ball.vx = 400;
    ball.omega = 400 / 37;
    let t = 0;
    while (!ball.sleeping && t < 6) {
      world.step(STEP);
      t += STEP;
    }
    console.log(`rolling: stopped after ${t.toFixed(2)}s at x=${ball.x.toFixed(0)}`);
    expect(ball.sleeping).toBe(true);
    expect(ball.x - 80).toBeGreaterThan(80);
    expect(ball.x - 80).toBeLessThan(420);
  });
});
