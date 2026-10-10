import { describe, expect, it } from 'vitest';
import { MAX_FRAME, STEP, accumulate } from '../src/core/loop.ts';

describe('accumulate', () => {
  const out = { steps: 0, rest: 0 };

  it('runs one step per 60 Hz frame', () => {
    accumulate(0, STEP, out);
    expect(out.steps).toBe(1);
    expect(out.rest).toBeCloseTo(0, 9);
  });

  it('carries the remainder to the next frame', () => {
    accumulate(0, STEP * 0.6, out);
    expect(out.steps).toBe(0);
    accumulate(out.rest, STEP * 0.6, out);
    expect(out.steps).toBe(1);
    expect(out.rest).toBeCloseTo(STEP * 0.2, 9);
  });

  it('runs two steps on a 30 Hz display', () => {
    accumulate(0, 2 * STEP + 1e-9, out);
    expect(out.steps).toBe(2);
  });

  it('drops time beyond MAX_FRAME instead of spiralling', () => {
    accumulate(0, 5, out);
    expect(out.steps).toBe(Math.floor(MAX_FRAME / STEP + 1e-9));
  });

  it('ignores negative frame times', () => {
    accumulate(0.005, -1, out);
    expect(out.steps).toBe(0);
    expect(out.rest).toBeCloseTo(0.005, 9);
  });
});
