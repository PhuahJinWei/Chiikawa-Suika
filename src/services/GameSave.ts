import type { SavedGame } from '../game/types';
import { browserStore, readJson, type KeyValueStore } from './storage';

const KEY = 'mochi-pon.save.v1';

/** The game in progress, kept on this device so closing the page never loses it. */
export class GameSave {
  constructor(private readonly store: KeyValueStore = browserStore) {}

  load(): SavedGame | null {
    const s = readJson<SavedGame | null>(this.store, KEY, null);
    return s && typeof s === 'object' && s.v === 1 ? s : null;
  }

  get exists(): boolean {
    return this.load() !== null;
  }

  save(game: SavedGame): void {
    this.store.set(KEY, JSON.stringify(game));
  }

  clear(): void {
    this.store.remove(KEY);
  }
}
