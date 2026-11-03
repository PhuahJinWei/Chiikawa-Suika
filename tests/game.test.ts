import { describe, expect, it } from 'vitest';
import { CONTAINER, GAME } from '../src/config/game';
import { MAX_TIER, TIERS } from '../src/config/tiers';
import { createRng } from '../src/core/rng';
import { Abilities, ABILITY_IDS } from '../src/game/Abilities';
import { Game } from '../src/game/Game';
import { Spawner } from '../src/game/Spawner';

const W = CONTAINER.width;
const H = CONTAINER.height;

function run(game: Game, seconds: number) {
  const n = Math.round(seconds / GAME.fixedStep);
  for (let i = 0; i < n; i++) game.update(GAME.fixedStep);
}

function place(game: Game, tier: number, x: number, y: number) {
  return game.world.add(x, y, TIERS[tier].radius, { tier, bornAt: 0, graceUntil: 0, merged: false });
}

describe('merging and scoring', () => {
  it('two equal balls merge into the next tier and score the triangular points x10', () => {
    const game = new Game(1);
    const r = TIERS[2].radius;
    place(game, 2, W / 2 - r, H - r);
    place(game, 2, W / 2 + r + 0.5, H - r);
    const merges: number[] = [];
    game.events.on('merge', (e) => merges.push(e.tier));
    run(game, 0.2);
    expect(merges).toEqual([3]);
    expect(game.world.bodies.map((b) => b.data.tier)).toEqual([3]);
    expect(game.score).toBe(GAME.scoring.points[2]);
    expect(game.score).toBe(60);
  });

  it('chain merges cascade upward', () => {
    const game = new Game(2);
    // A tier-1 ball against the left wall, two tier-0 balls beside it, gravity tilted left:
    // 0+0 -> 1 rolls into the other 1 -> 2.
    game.world.gravityX = -1500;
    const r1 = TIERS[1].radius;
    place(game, 1, r1, H - r1);
    place(game, 0, 2 * r1 + 21.5, H - 21);
    place(game, 0, 2 * r1 + 64.5, H - 21);
    run(game, 1.5);
    expect(game.world.bodies.map((b) => b.data.tier)).toEqual([2]);
    expect(game.score).toBe(10 + 30);
  });

  it('two of the largest balls vanish', () => {
    const game = new Game(3);
    const r = TIERS[MAX_TIER].radius;
    place(game, MAX_TIER, r, H - r);
    place(game, MAX_TIER, r, H - 3 * r - 1);
    let vanished = 0;
    game.events.on('vanish', () => vanished++);
    run(game, 1);
    expect(vanished).toBe(1);
    expect(game.world.bodies.length).toBe(0);
    expect(game.score).toBe(GAME.scoring.points[MAX_TIER]);
  });
});

describe('dropping', () => {
  it('drops the held ball, reloads after the cooldown and charges abilities', () => {
    const game = new Game(4);
    const first = game.held;
    expect(first).not.toBeNull();
    game.setAim(100);
    expect(game.drop()).toBe(true);
    expect(game.held).toBeNull();
    expect(game.drop()).toBe(false);
    expect(game.world.bodies[0].data.tier).toBe(first);
    expect(Math.abs(game.world.bodies[0].x - 100)).toBeLessThanOrEqual(GAME.drop.jitter / 2);
    run(game, GAME.drop.cooldown + 0.05);
    expect(game.held).not.toBeNull();
    expect(game.drops).toBe(1);
  });

  it('keeps the aim inside the walls', () => {
    const game = new Game(5);
    game.setAim(-500);
    expect(game.aimX).toBe(game.aimRadius);
    game.setAim(5000);
    expect(game.aimX).toBe(W - game.aimRadius);
  });
});

describe('spawner', () => {
  it('starts small, unlocks bigger drops as bigger balls appear, and caps at maxTier', () => {
    const s = new Spawner(createRng(9));
    expect(s.maxDroppable).toBe(GAME.spawn.startMaxTier);
    for (let i = 0; i < 200; i++) expect(s.take()).toBeLessThanOrEqual(GAME.spawn.startMaxTier);
    expect(s.observe(3)).toBeNull();
    expect(s.observe(4)).toBe(3);
    expect(s.observe(5)).toBe(4);
    expect(s.observe(MAX_TIER)).toBeNull();
    expect(s.maxDroppable).toBe(GAME.spawn.maxTier);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(s.take());
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('abilities', () => {
  it('earns charges by dropping and respects the maximum', () => {
    const a = new Abilities({
      shake: { mergesPerCharge: 2, startCharges: 0, maxCharges: 1 },
      remove: { mergesPerCharge: 3, startCharges: 1, maxCharges: 2 },
      pick: { mergesPerCharge: 1, startCharges: 0, maxCharges: 1 },
      flip: { mergesPerCharge: 5, startCharges: 1, maxCharges: 1 },
    });
    expect(a.has('shake')).toBe(false);
    a.onMerge();
    expect(a.progress('shake')).toBeCloseTo(0.5);
    expect(a.onMerge()).toContain('shake');
    expect(a.charges('shake')).toBe(1);
    a.onMerge();
    a.onMerge();
    expect(a.charges('shake')).toBe(1);
    expect(a.charges('remove')).toBe(2);
    expect(a.consume('flip')).toBe(true);
    expect(a.consume('flip')).toBe(false);
  });

  it('charges only from merges, never from dropping', () => {
    const game = new Game(14);
    for (let i = 0; i < 3; i++) {
      game.held = i;
      game.setAim(80 + i * 200);
      game.drop();
      run(game, 1);
    }
    expect(game.merges).toBe(0);
    expect(game.abilities.progress('shake')).toBe(0);
    expect(game.abilities.charges('shake')).toBe(GAME.abilities.shake.startCharges);
    game.world.clear();
    const r = TIERS[0].radius;
    place(game, 0, W / 2 - r, H - r);
    place(game, 0, W / 2 + r + 0.5, H - r);
    run(game, 0.3);
    expect(game.merges).toBeGreaterThanOrEqual(1);
    expect(game.abilities.progress('shake')).toBeCloseTo(game.merges / GAME.abilities.shake.mergesPerCharge);
  });

  it('remove pops the chosen ball and uses a charge', () => {
    const game = new Game(6);
    const ball = place(game, 3, 200, H - TIERS[3].radius);
    place(game, 1, 400, H - TIERS[1].radius);
    expect(game.useAbility('remove')).toBe(true);
    expect(game.removeMode).toBe(true);
    expect(game.removeAt(5, 5)).toBe(false);
    expect(game.removeAt(ball.x + 5, ball.y - 5)).toBe(true);
    expect(game.world.bodies.length).toBe(1);
    expect(game.removeMode).toBe(false);
    expect(game.abilities.charges('remove')).toBe(GAME.abilities.remove.startCharges - 1);
  });

  it('pick swaps the held ball for an unlocked tier only', () => {
    const game = new Game(7);
    expect(game.pick(GAME.spawn.maxTier)).toBe(false);
    expect(game.pick(0)).toBe(true);
    expect(game.held).toBe(0);
    expect(game.abilities.charges('pick')).toBe(GAME.abilities.pick.startCharges - 1);
  });

  it('shake jostles the pile and everything stays inside the box', () => {
    const game = new Game(8);
    for (let i = 0; i < 25; i++) {
      game.setAim(30 + ((i * 97) % 540));
      game.drop();
      run(game, 0.5);
    }
    expect(game.useAbility('shake')).toBe(true);
    expect(game.busy).toBe(true);
    expect(game.drop()).toBe(false);
    run(game, GAME.shake.swings * GAME.shake.swingTime + 3);
    expect(game.busy).toBe(false);
    for (const b of game.world.bodies) {
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      expect(b.x - b.radius).toBeGreaterThanOrEqual(-1e-6);
      expect(b.x + b.radius).toBeLessThanOrEqual(W + 1e-6);
      expect(b.y + b.radius).toBeLessThanOrEqual(H + 1e-6);
    }
  });

  it('flip turns the pile over, keeps every ball inside, and play continues', () => {
    const game = new Game(10);
    for (let i = 0; i < 25; i++) {
      game.setAim(30 + ((i * 131) % 540));
      game.drop();
      run(game, 0.5);
    }
    run(game, 2);
    const before = game.world.bodies.length;
    const avgYBefore = game.world.bodies.reduce((s, b) => s + b.y, 0) / before;
    let done = false;
    game.events.on('flipDone', () => (done = true));
    expect(game.useAbility('flip')).toBe(true);
    const { closeTime, rotateTime, openTime } = GAME.flip;
    run(game, closeTime + rotateTime + openTime + 0.2);
    expect(done).toBe(true);
    expect(game.phase).toBe('playing');
    run(game, 3);
    expect(game.world.bodies.length).toBeLessThanOrEqual(before);
    for (const b of game.world.bodies) {
      expect(b.x - b.radius).toBeGreaterThanOrEqual(-1e-6);
      expect(b.x + b.radius).toBeLessThanOrEqual(W + 1e-6);
      expect(b.y + b.radius).toBeLessThanOrEqual(H + 1e-6);
    }
    const avgYAfter = game.world.bodies.reduce((s, b) => s + b.y, 0) / game.world.bodies.length;
    expect(Math.abs(avgYAfter - avgYBefore)).toBeLessThan(80);
    expect(game.drop()).toBe(true);
  });
});

describe('stacking', () => {
  it('a ball dropped exactly on top of another still rolls off (tiny real-world imperfection)', () => {
    const game = new Game(13);
    game.held = 3;
    game.setAim(W / 2);
    game.drop();
    run(game, 1.5);
    game.held = 2;
    game.setAim(W / 2);
    game.drop();
    run(game, 6);
    const top = game.world.bodies.find((b) => b.data.tier === 2)!;
    expect(Math.abs(top.y - (H - top.radius))).toBeLessThan(1.5);
  });
});

describe('shocked faces', () => {
  it('a hard landing shocks the friend that lands and the one it lands on, then everyone calms down', () => {
    const game = new Game(15);
    const r3 = TIERS[3].radius;
    const below = place(game, 3, W / 2, H - r3);
    run(game, 1);
    expect(game.isShocked(below)).toBe(false);
    game.held = 1;
    game.setAim(W / 2);
    game.drop();
    const dropped = game.world.bodies[game.world.bodies.length - 1];
    let both = false;
    for (let i = 0; i < 120 && !both; i++) {
      game.update(GAME.fixedStep);
      both = game.isShocked(dropped) && game.isShocked(below);
    }
    expect(both).toBe(true);
    run(game, 4);
    expect(game.world.bodies.filter((b) => game.isShocked(b))).toEqual([]);
  });

  it('everyone is shocked while the box is shaken, and calm again once it has settled', () => {
    const game = new Game(17);
    for (let tier = 0; tier <= 4; tier++) place(game, tier, 50 + tier * 120, H - TIERS[tier].radius);
    run(game, 1.5);
    expect(game.world.bodies.some((b) => game.isShocked(b))).toBe(false);
    expect(game.useAbility('shake')).toBe(true);
    run(game, 0.2);
    expect(game.world.bodies.every((b) => game.isShocked(b))).toBe(true);
    run(game, GAME.shake.swings * GAME.shake.swingTime + 4);
    expect(game.world.bodies.some((b) => game.isShocked(b))).toBe(false);
  });

  it('a friend stuck above the line looks shocked', () => {
    const game = new Game(18);
    game.world.gravityY = 0;
    const high = place(game, 2, W / 2, -10);
    run(game, 0.5);
    expect(game.overflowTimer).toBeGreaterThan(0);
    expect(game.isShocked(high)).toBe(true);
  });
});

describe('saving', () => {
  it('a saved game continues exactly where it was left', () => {
    const game = new Game(21);
    for (let i = 0; i < 20; i++) {
      game.setAim(40 + ((i * 131) % 520));
      game.drop();
      run(game, 0.6);
    }
    run(game, 2);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const copy = new Game(99);
    expect(copy.restore(saved)).toBe(true);
    expect(copy.score).toBe(game.score);
    expect(copy.held).toBe(game.held);
    expect(copy.spawner.next).toBe(game.spawner.next);
    expect(copy.world.bodies.map((b) => b.data.tier)).toEqual(game.world.bodies.map((b) => b.data.tier));
    for (const id of ABILITY_IDS) expect(copy.abilities.charges(id)).toBe(game.abilities.charges(id));
    // the same random draws follow
    expect(copy.spawner.take()).toBe(game.spawner.take());
    // resting friends stay exactly where they were; the rest finish settling without a jump
    const before = copy.world.bodies.map((b) => ({ x: b.x, y: b.y, asleep: b.sleeping }));
    expect(before.some((b) => b.asleep)).toBe(true);
    run(copy, 2);
    const drift = copy.world.bodies.map((b, i) => Math.hypot(b.x - before[i].x, b.y - before[i].y));
    expect(Math.max(...drift.filter((_, i) => before[i].asleep))).toBeLessThan(0.05);
    expect(Math.max(...drift)).toBeLessThan(10);
    expect(copy.phase).toBe('playing');
    expect(copy.drop()).toBe(true);
  });

  it('saves nothing mid-shake or after game over, and refuses broken saves', () => {
    const game = new Game(22);
    place(game, 2, W / 2, H - TIERS[2].radius);
    expect(game.snapshot()).not.toBeNull();
    game.useAbility('shake');
    expect(game.snapshot()).toBeNull();
    const broken = { ...new Game(23).snapshot()!, balls: [[99, 0, 0, 0, 0, 0, 0, 0]] };
    const fresh = new Game(24);
    expect(fresh.restore(broken)).toBe(false);
    expect(fresh.world.bodies.length).toBe(0);
    expect(fresh.score).toBe(0);
  });
});

describe('game over', () => {
  it('ends after a ball stays above the line long enough', () => {
    const game = new Game(11);
    game.world.gravityY = 0;
    place(game, 2, W / 2, -10);
    let over = false;
    game.events.on('gameOver', () => (over = true));
    run(game, GAME.overflow.time - 0.2);
    expect(over).toBe(false);
    expect(game.dangerLevel).toBe(1);
    run(game, 0.4);
    expect(over).toBe(true);
    expect(game.phase).toBe('over');
    expect(game.drop()).toBe(false);
  });

  it('ignores a freshly dropped ball passing the line', () => {
    const game = new Game(12);
    game.drop();
    run(game, GAME.overflow.time + 0.5);
    expect(game.phase).toBe('playing');
  });
});
