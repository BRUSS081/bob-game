import { describe, expect, it } from 'vitest';
import { REGATTA, Race, angleDiff } from '../../src/games/regatta.ts';

const DT = 1 / 60;

function race(seed = 3): Race {
  const r = new Race();
  r.reset(seed);
  return r;
}

/** Tacks onto whichever tack points closer to the next mark. */
function smart(r: Race): boolean {
  const p = r.player;
  if (p.turning > 0) return false;
  const want = r.target(p);
  const now = Math.abs(angleDiff(r.headingFor(p, p.tack), want));
  const other = Math.abs(angleDiff(r.headingFor(p, -p.tack), want));
  return other + 0.1 < now;
}

describe('regatta', () => {
  it('tacking flips the heading through the wind', () => {
    const r = race();
    for (let i = 0; i < 60; i++) r.step(DT, false);
    const before = r.player.heading - r.wind;
    r.step(DT, true);
    for (let i = 0; i < 120; i++) r.step(DT, false);
    const after = r.player.heading - r.wind;
    expect(Math.sign(before)).not.toBe(Math.sign(after));
    expect(Math.abs(Math.abs(after) - REGATTA.closeHauled)).toBeLessThan(0.01);
  });

  it('a wind shift turns the boat with it', () => {
    const r = race();
    for (let i = 0; i < 60 * 3; i++) r.step(DT, false);
    expect(Math.abs(angleDiff(r.player.heading, r.wind + r.player.tack * REGATTA.closeHauled))).toBeLessThan(1e-6);
  });

  it('a sailor who reads the wind finishes, and the rivals do too', () => {
    for (const seed of [1, 2, 3]) {
      const r = race(seed);
      while (!r.over) r.step(DT, smart(r));
      expect(r.player.leg).toBe('done');
      expect(r.player.finish).toBeLessThan(REGATTA.maxTime);
      for (let i = 0; i < 60 * 60; i++) r.step(DT, false);
    }
  });

  it('reading the wind beats never tacking', () => {
    let smartTime = 0;
    let lazyTime = 0;
    for (const seed of [1, 2, 3, 4]) {
      const a = race(seed);
      while (!a.over) a.step(DT, smart(a));
      smartTime += a.player.leg === 'done' ? a.player.finish : REGATTA.maxTime;
      const b = race(seed);
      while (!b.over) b.step(DT, false);
      lazyTime += b.player.leg === 'done' ? b.player.finish : REGATTA.maxTime;
    }
    expect(smartTime).toBeLessThan(lazyTime);
  });
});
