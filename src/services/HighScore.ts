import { browserStore, type KeyValueStore } from './storage';

const KEY = 'mochi-pon.best.v2';
/**
 * Older saves, scored before merge points were multiplied by 10: the v1 best, and the even
 * older top-10 list. Each is carried over once, times 10, so it stays comparable.
 */
const V1_KEY = 'mochi-pon.best.v1';
const LEGACY_LIST_KEY = 'mochi-pon.scores.v1';
const OLD_SCALE = 10;

/** The player's personal high score, stored on this device. */
export class HighScore {
  constructor(private readonly store: KeyValueStore = browserStore) {
    this.migrate();
  }

  get best(): number {
    const n = Number(this.store.get(KEY) ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Saves the score if it beats the best. Returns true for a new best. */
  record(score: number): boolean {
    if (!(score > this.best)) return false;
    this.store.set(KEY, String(Math.floor(score)));
    return true;
  }

  clear(): void {
    this.store.remove(KEY);
  }

  private migrate(): void {
    const v1 = this.store.get(V1_KEY);
    if (v1 !== null) {
      const n = Number(v1);
      if (Number.isFinite(n)) this.record(n * OLD_SCALE);
      this.store.remove(V1_KEY);
    }
    const raw = this.store.get(LEGACY_LIST_KEY);
    if (raw === null) return;
    try {
      const list = JSON.parse(raw) as { score?: unknown }[];
      const top = Math.max(0, ...list.map((e) => Number(e?.score) || 0));
      this.record(top * OLD_SCALE);
    } catch {
      /* unreadable old data: ignore */
    }
    this.store.remove(LEGACY_LIST_KEY);
  }
}
