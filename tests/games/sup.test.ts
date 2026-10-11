import { describe, expect, it } from 'vitest';
import { SUP, SupRace } from '../../src/games/sup.ts';

const DT = 1 / 60;

/** Plays a whole race; `tap` decides each step whether to press. */
function play(tap: (race: SupRace) => boolean, seed = 7): SupRace {
  const race = new SupRace();
  race.reset(seed);
  while (!race.finished) race.step(DT, tap(race));
  return race;
}

describe('SUP race', () => {
  it('a perfect paddler wins in under a minute', () => {
    for (const seed of [1, 2, 3]) {
      const race = play((r) => r.quality() === 'perfect', seed);
      expect(race.pos).toBeGreaterThanOrEqual(SUP.length);
      expect(race.time).toBeLessThan(60);
      expect(race.place).toBe(1);
    }
  });

  it('good strokes finish the race but lose to the fastest rival', () => {
    const race = play((r) => r.meter >= SUP.good[0] && r.meter < SUP.perfect[0]);
    expect(race.pos).toBeGreaterThanOrEqual(SUP.length);
    expect(race.place).toBeGreaterThan(1);
  });

  it('mashing the button is slower than timing it', () => {
    let n = 0;
    const mash = play(() => ++n % 9 === 0);
    const timed = play((r) => r.quality() === 'perfect');
    expect(mash.time).toBeGreaterThan(timed.time + 15);
  });

  it('a stroke resets the timing bar', () => {
    const race = new SupRace();
    for (let i = 0; i < 30; i++) race.step(DT, false);
    expect(race.meter).toBeGreaterThan(0.5);
    expect(race.step(DT, true)).not.toBeNull();
    expect(race.meter).toBe(0);
  });
});
