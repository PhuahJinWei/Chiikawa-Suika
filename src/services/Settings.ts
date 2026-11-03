import { browserStore, readJson, type KeyValueStore } from './storage';

export interface Settings {
  sound: boolean;
  /** Background music (plays at the sound-effects volume). */
  music: boolean;
  volume: number;
  /** Keep faces upright instead of rolling with the ball. */
  uprightFaces: boolean;
  guideLine: boolean;
  reduceMotion: boolean;
}

const KEY = 'mochi-pon.settings.v1';

function defaults(): Settings {
  const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { sound: true, music: true, volume: 0.7, uprightFaces: false, guideLine: true, reduceMotion: prefersReduced };
}

export class SettingsStore {
  private current: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor(private readonly store: KeyValueStore = browserStore) {
    this.current = { ...defaults(), ...readJson<Partial<Settings>>(store, KEY, {}) };
  }

  get value(): Readonly<Settings> {
    return this.current;
  }

  update(patch: Partial<Settings>): void {
    this.current = { ...this.current, ...patch };
    this.store.set(KEY, JSON.stringify(this.current));
    for (const fn of this.listeners) fn(this.current);
  }

  onChange(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
