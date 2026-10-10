import { describe, expect, it } from 'vitest';
import { digitCount, splitPoint } from '../src/render/font.ts';

describe('font helpers', () => {
  it('counts digits', () => {
    expect([0, 9, 10, 99, 100, 12345, 100000].map(digitCount)).toEqual([1, 1, 2, 2, 3, 5, 6]);
  });

  it('splits long lines at the space closest to the middle', () => {
    const text = 'TAP AGAIN IN THE AIR FOR A TRICK';
    const cut = splitPoint(text);
    expect(text[cut]).toBe(' ');
    expect(text.slice(0, cut)).toBe('TAP AGAIN IN THE');
    expect(splitPoint('NOSPACES')).toBe(-1);
  });
});
