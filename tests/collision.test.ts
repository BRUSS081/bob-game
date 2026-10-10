import { describe, expect, it } from 'vitest';
import { overlaps } from '../src/game/collision.ts';

describe('overlaps', () => {
  it('detects intersecting boxes', () => {
    expect(overlaps(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
    expect(overlaps(0, 0, 10, 10, 2, 2, 2, 2)).toBe(true);
  });

  it('touching edges are not a hit', () => {
    expect(overlaps(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
    expect(overlaps(0, 0, 10, 10, 0, 10, 10, 10)).toBe(false);
  });

  it('separated boxes do not overlap', () => {
    expect(overlaps(0, 0, 10, 10, 20, 0, 5, 5)).toBe(false);
    expect(overlaps(0, 20, 10, 10, 0, 0, 10, 10)).toBe(false);
  });

  it('is symmetric', () => {
    expect(overlaps(3, 4, 6, 7, 8, 1, 2, 9)).toBe(overlaps(8, 1, 2, 9, 3, 4, 6, 7));
  });
});
