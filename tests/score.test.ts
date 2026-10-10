import { describe, expect, it } from 'vitest';
import { SCORING } from '../src/game/config.ts';
import { addDistance, createScore, landPlain, landTrick, nextMultiplier, total } from '../src/game/score.ts';

describe('score', () => {
  it('counts distance', () => {
    const s = createScore();
    addDistance(s, 1000, false);
    expect(total(s)).toBe(1000 * SCORING.pointsPerPx);
  });

  it('floors fractional distance points', () => {
    const s = createScore();
    addDistance(s, 15, false);
    expect(total(s)).toBe(1);
  });

  it('raises the multiplier for consecutive clean tricks, up to the cap', () => {
    const s = createScore();
    const awarded: number[] = [];
    for (let i = 0; i < 7; i++) awarded.push(landTrick(s, false));
    const base = SCORING.trickBase;
    expect(awarded).toEqual([1, 2, 3, 4, 5, 5, 5].map((m) => m * base));
    expect(total(s)).toBe(awarded.reduce((a, b) => a + b, 0));
  });

  it('a jump without a trick resets the combo', () => {
    const s = createScore();
    landTrick(s, false);
    landTrick(s, false);
    expect(nextMultiplier(s)).toBe(3);
    landPlain(s);
    expect(nextMultiplier(s)).toBe(1);
    expect(landTrick(s, false)).toBe(SCORING.trickBase);
  });

  it('the perfect wave doubles distance and tricks', () => {
    const s = createScore();
    addDistance(s, 1000, true);
    expect(total(s)).toBe(1000 * SCORING.pointsPerPx * SCORING.powerFactor);
    expect(landTrick(s, true)).toBe(SCORING.trickBase * SCORING.powerFactor);
  });
});
