import type { AbilityId } from '../config/game';

export interface BallData {
  tier: number;
  /** Game time when the ball appeared (dropped or merged). */
  bornAt: number;
  /** The overflow check ignores this ball until this game time (freshly dropped balls). */
  graceUntil: number;
  /** Created by a merge (plays the pop animation). */
  merged: boolean;
  /** Shows its shocked face until this game time (set by hard hits, see GAME.shock). */
  shockedUntil?: number;
}

export type GamePhase = 'playing' | 'over';

/**
 * A game in progress, as saved to storage. Balls are [tier, x, y, vx, vy, angle, spin,
 * asleep (0/1)] to keep it small.
 */
export interface SavedGame {
  v: 1;
  rng: number;
  time: number;
  score: number;
  drops: number;
  merges: number;
  vanishes: number;
  bestTier: number;
  discovered: boolean[];
  aimX: number;
  held: number | null;
  reload: number;
  spawner: { upcoming: number; largest: number };
  abilities: Partial<Record<AbilityId, { charges: number; progress: number }>>;
  balls: number[][];
}

export interface GameSummary {
  score: number;
  bestTier: number;
  drops: number;
  merges: number;
  vanishes: number;
  seconds: number;
}

export interface GameEvents {
  reset: undefined;
  held: { tier: number };
  next: { tier: number };
  drop: { tier: number; x: number };
  merge: { tier: number; x: number; y: number; points: number; chain: number };
  vanish: { tier: number; x: number; y: number; points: number };
  score: { score: number; added: number };
  discover: { tier: number };
  unlock: { tier: number };
  abilities: undefined;
  abilityReady: { id: AbilityId };
  abilityUsed: { id: AbilityId };
  removeMode: { active: boolean };
  removed: { tier: number; x: number; y: number };
  flipDone: undefined;
  gameOver: GameSummary;
}
