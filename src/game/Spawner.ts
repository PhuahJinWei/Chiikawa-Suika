import { GAME } from '../config/game';
import type { Rng } from '../core/rng';

type SpawnRules = typeof GAME.spawn;

export interface SpawnerState {
  upcoming: number;
  largest: number;
}

/**
 * Picks which ball the claw gets next. Starts with only the smallest balls and unlocks
 * bigger drops as bigger balls are created, never beyond `maxTier`.
 */
export class Spawner {
  private upcoming: number;
  private largest: number;

  constructor(
    private readonly rng: Rng,
    private readonly rules: SpawnRules = GAME.spawn,
  ) {
    this.largest = rules.startMaxTier;
    this.upcoming = this.roll();
  }

  /** The ball after the one in the claw (shown as "next"). */
  get next(): number {
    return this.upcoming;
  }

  /** Largest tier that can currently be dropped. */
  get maxDroppable(): number {
    return this.largest;
  }

  take(): number {
    const t = this.upcoming;
    this.upcoming = this.roll();
    return t;
  }

  save(): SpawnerState {
    return { upcoming: this.upcoming, largest: this.largest };
  }

  load(s: SpawnerState): void {
    this.upcoming = s.upcoming;
    this.largest = s.largest;
  }

  canDrop(tier: number): boolean {
    return Number.isInteger(tier) && tier >= 0 && tier <= this.largest;
  }

  /** Report a ball that now exists. Returns the newly unlocked drop tier, if any. */
  observe(tier: number): number | null {
    const { unlockLag, startMaxTier, maxTier } = this.rules;
    const target = Math.min(maxTier, Math.max(startMaxTier, tier - unlockLag));
    if (target <= this.largest) return null;
    this.largest = target;
    return target;
  }

  private roll(): number {
    const w = this.rules.weights;
    let total = 0;
    for (let t = 0; t <= this.largest; t++) total += w[t] ?? 1;
    let r = this.rng() * total;
    for (let t = 0; t <= this.largest; t++) {
      r -= w[t] ?? 1;
      if (r < 0) return t;
    }
    return this.largest;
  }
}
