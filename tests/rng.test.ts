import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('stays in [0, 1) and in the requested range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const x = r.range(3, 5);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThan(5);
    }
  });

  it('reseeding restarts the sequence', () => {
    const r = new Rng(9);
    const first = r.next();
    r.next();
    r.seed(9);
    expect(r.next()).toBe(first);
  });
});
