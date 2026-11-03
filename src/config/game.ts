import type { PhysicsConfig } from '../physics/World';
import { TIERS } from './tiers';

/** Inside size of the container in world units. Everything else is scaled to fit the screen. */
export const CONTAINER = {
  width: 600,
  /** Tall enough to fill a modern phone screen (about 9:19.5). */
  height: 820,
  /** Visual wall thickness. */
  wall: 22,
};

/**
 * The canvas "stage": container plus the claw area above it. Local (0,0) = top-left inside the box.
 * The box's outline touches the stage's sides and bottom, so on phones it lands exactly on the
 * cabinet's outline and the tray's top line (see .cabinet in main.css).
 */
export const STAGE = {
  width: 648,
  height: 1044,
  boxX: 24,
  boxY: 200,
};

/** Physics tuning. Units: world units (container = 600 wide) and seconds. */
export const PHYSICS: PhysicsConfig = {
  gravity: 2600,
  /** Substeps per fixed step (fixedStep below). More = stiffer stacks, more CPU. */
  substeps: 4,
  contactHertz: 120,
  contactDampingRatio: 10,
  pushMaxVelocity: 300,
  /** Bounciness (0..1) and the impact speed below which nothing bounces. */
  restitution: 0.22,
  restitutionThreshold: 150,
  friction: 0.6,
  /**
   * Energy lost (per second) while a ball touches something. Higher = rolling and rocking
   * calm down sooner. This is viscous (proportional to speed), so it never stops a ball
   * from rolling off a hump or being pushed; it only slows it.
   */
  contactDamping: 1,
  contactAngularDamping: 3,
  /** Losses that always apply, including in flight. Keep these small. */
  linearDamping: 0.05,
  angularDamping: 0.2,
  /** A group of touching balls that moves slower than this for sleepTime freezes. */
  sleepSpeed: 8,
  sleepTime: 0.5,
  maxSpeed: 4000,
  touchSlop: 1,
  speculativeDistance: 2,
};

export type AbilityId = 'shake' | 'remove' | 'pick' | 'flip';

export interface AbilityRule {
  /** Merges needed to earn one charge (dropping alone earns nothing). */
  mergesPerCharge: number;
  startCharges: number;
  maxCharges: number;
}

export const GAME = {
  title: 'もちもちポン!',
  /** Seconds per physics step. Rendering interpolates between steps. */
  fixedStep: 1 / 120,

  drop: {
    /** Height (local y) of the held ball's centre. Negative = above the box. */
    y: -82,
    /** Seconds before the next ball appears in the claw. */
    cooldown: 0.45,
    /** A freshly dropped ball is ignored by the overflow check for this long. */
    grace: 1.0,
    /** Keyboard aiming speed, units per second. */
    keyboardSpeed: 560,
    /**
     * Each drop lands up to ±jitter/2 units from the aim (well under a pixel). Like a real
     * hand, it means a ball dropped "exactly" on another never balances there forever.
     */
    jitter: 1,
  },

  overflow: {
    /** The danger line sits on the rim of the box. */
    lineY: 0,
    /** Seconds a ball may stay above the line before the game ends. */
    time: 2.0,
    /** The line starts to fade in when the pile is this close to it. */
    warnDistance: 110,
  },

  spawn: {
    /** Highest tier index that can ever be dropped (4 = the 5th ball, like the original game). */
    maxTier: 4,
    /** At the start only tiers 0..startMaxTier are dropped. */
    startMaxTier: 2,
    /**
     * Bigger drops unlock as you build bigger friends: the largest droppable tier is
     * (largest tier created so far - unlockLag), clamped between startMaxTier and maxTier.
     */
    unlockLag: 1,
    /** Relative odds per tier (index 0 = smallest). Missing entries default to 1. */
    weights: [1, 1, 1, 1, 1] as number[],
  },

  merge: {
    /** Seconds a merged ball takes to grow to full size (gentle push instead of an explosion). */
    growTime: 0.12,
  },

  /**
   * Friends pull their shocked face (`shockedImage` in tiers.ts) when something hits them
   * hard, while the box is shaken or flipped, and while they sit above the line. Resting and
   * slow rolling never count, so a settled pile always looks calm.
   */
  shock: {
    /**
     * Closing speed (units/s) that counts as a hard hit. Drops land at about 650-2100 and
     * rolling or settling stays under ~200, so usually just the dropped friend and the one
     * or two it lands on react.
     */
    impactSpeed: 450,
    /** Seconds the face is held: `time` after a hit at impactSpeed, up to `maxTime` at hardSpeed. */
    time: 0.4,
    maxTime: 0.9,
    hardSpeed: 2000,
  },

  scoring: {
    /**
     * Points for merging two balls of each tier: 10, 30, 60, 100, ... 550. The original game's
     * triangular numbers (1, 3, 6, 10, ...) times 10, so scores read big without changing
     * which merges are worth more.
     */
    points: TIERS.map((_, i) => (((i + 1) * (i + 2)) / 2) * 10),
    /** Extra points when two of the largest balls pop. */
    vanishBonus: 0,
  },

  /** A typical game makes about 0.6-0.85 merges per drop. */
  abilities: {
    shake: { mergesPerCharge: 20, startCharges: 1, maxCharges: 2 },
    remove: { mergesPerCharge: 35, startCharges: 1, maxCharges: 2 },
    pick: { mergesPerCharge: 25, startCharges: 1, maxCharges: 2 },
    flip: { mergesPerCharge: 60, startCharges: 1, maxCharges: 1 },
  } satisfies Record<AbilityId, AbilityRule>,

  /**
   * The box rattles left and right `swings` times. On every swing each ball is thrown the
   * opposite way (and upward) with its own random strength, so the pile loosens and
   * neighbours separate instead of hopping as one block.
   */
  shake: {
    swings: 7,
    /** Seconds per swing. */
    swingTime: 0.16,
    /** Sideways and upward kick per swing (units/s), before per-ball randomness. */
    kickX: 420,
    kickY: 480,
    /** How far the box visibly sways (world units). */
    amplitude: 26,
  },

  flip: {
    closeTime: 0.25,
    rotateTime: 1.2,
    openTime: 0.3,
    /** Overflow checks stay off this long after the flip, while balls tumble. */
    grace: 1.6,
  },
};

export type GameConfig = typeof GAME;
