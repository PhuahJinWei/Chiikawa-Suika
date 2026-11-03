export interface Rng {
  /** Next float in [0, 1). */
  (): number;
  /** Internal state: read it to save a game, set it to continue the same sequence. */
  state: number;
}

/** Small, fast seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function createRng(seed: number): Rng {
  const rng = (() => {
    rng.state = (rng.state + 0x6d2b79f5) >>> 0;
    let t = rng.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.state = seed >>> 0;
  return rng;
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
