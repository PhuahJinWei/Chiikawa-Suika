import { describe, expect, it } from 'vitest';
import { HighScore } from '../src/services/HighScore';
import { MemoryStore } from '../src/services/storage';

describe('personal high score', () => {
  it('only records a score that beats the best', () => {
    const hs = new HighScore(new MemoryStore());
    expect(hs.best).toBe(0);
    expect(hs.record(0)).toBe(false);
    expect(hs.record(120)).toBe(true);
    expect(hs.record(80)).toBe(false);
    expect(hs.record(120)).toBe(false);
    expect(hs.best).toBe(120);
  });

  it('persists, survives bad data, and can be cleared', () => {
    const store = new MemoryStore();
    new HighScore(store).record(300);
    expect(new HighScore(store).best).toBe(300);
    store.set('mochi-pon.best.v2', 'oops');
    expect(new HighScore(store).best).toBe(0);
    const hs = new HighScore(store);
    hs.record(50);
    hs.clear();
    expect(hs.best).toBe(0);
  });

  it('carries over the top score from the old ranking list once, on the new x10 scale', () => {
    const store = new MemoryStore();
    store.set('mochi-pon.scores.v1', JSON.stringify([{ name: 'a', score: 594 }, { name: 'b', score: 288 }]));
    expect(new HighScore(store).best).toBe(5940);
    expect(store.get('mochi-pon.scores.v1')).toBeNull();
  });

  it('carries over a best saved before points were multiplied by 10, once', () => {
    const store = new MemoryStore();
    store.set('mochi-pon.best.v1', '594');
    expect(new HighScore(store).best).toBe(5940);
    expect(store.get('mochi-pon.best.v1')).toBeNull();
    expect(new HighScore(store).best).toBe(5940);
  });
});
