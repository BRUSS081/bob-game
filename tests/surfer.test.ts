import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { SURF } from '../src/game/config.ts';
import { createSurfer, updateSurfer } from '../src/game/surfer.ts';
import { simulateJump } from './helpers/jump.ts';

describe('surfer jump', () => {
  it('a tap is a low, quick jump', () => {
    const tap = simulateJump(0);
    expect(tap.apex).toBeGreaterThan(18);
    expect(tap.apex).toBeLessThan(32);
    expect(tap.airtime).toBeLessThan(0.45);
    expect(tap.landing).toBe('land');
  });

  it('holding makes the jump higher and longer, up to a maximum', () => {
    const apexes = [0, 0.05, 0.1, 0.15, 0.2].map((h) => simulateJump(h).apex);
    for (let i = 1; i < apexes.length; i++) expect(apexes[i]).toBeGreaterThan(apexes[i - 1]);
    const max = simulateJump(SURF.maxHoldTime);
    expect(max.apex).toBeGreaterThan(45);
    expect(max.apex).toBeLessThan(70);
    expect(simulateJump(2).apex).toBeCloseTo(max.apex, 0);
  });

  it('pressing while riding jumps, it does not start a trick', () => {
    const s = createSurfer();
    expect(updateSurfer(s, STEP, true, true, SURF)).toBe('jump');
    expect(s.tricking).toBe(false);
    expect(s.state).toBe('air');
  });
});

describe('surfer trick', () => {
  it('a second tap early in a high jump lands a clean trick', () => {
    expect(simulateJump(0.1, 0.12).landing).toBe('trick');
  });

  it('even a quick double tap on a low jump can land if the rotation is nearly done', () => {
    expect(simulateJump(0, STEP).landing).toBe('trick');
  });

  it('landing mid-rotation is a wipeout', () => {
    const late = simulateJump(0.2, 0.45);
    expect(late.landing).toBe('crash');
  });

  it('only one trick per jump', () => {
    const s = createSurfer();
    updateSurfer(s, STEP, true, true, SURF);
    let t = 0;
    updateSurfer(s, STEP, true, false, SURF); // trick starts
    while (s.tricking) {
      updateSurfer(s, STEP, false, false, SURF);
      t += STEP;
    }
    expect(s.trickDone).toBe(true);
    expect(updateSurfer(s, STEP, true, false, SURF)).not.toBe('trickStart');
    expect(t).toBeGreaterThan(0);
  });

  it('a wiped out surfer ignores input', () => {
    const s = createSurfer();
    s.state = 'crash';
    expect(updateSurfer(s, STEP, true, true, SURF)).toBe('none');
    expect(s.y).toBe(0);
  });
});
