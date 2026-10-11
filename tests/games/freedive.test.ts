import { describe, expect, it } from 'vitest';
import { FREEDIVE, Freedive, type DiveEvent } from '../../src/games/freedive.ts';

const DT = 1 / 60;
const VIEW = 480;

function diver(seed = 3): Freedive {
  const d = new Freedive();
  d.reset(seed, false);
  return d;
}

describe('freedive', () => {
  it('holding dives, letting go floats back up, the surface refills the oxygen', () => {
    const d = diver();
    for (let i = 0; i < 120; i++) d.step(DT, true, VIEW);
    expect(d.y).toBeGreaterThan(40);
    expect(d.oxygen).toBeLessThan(1);
    expect(d.diving).toBe(true);
    let banked = false;
    for (let i = 0; i < 60 * 20 && !banked; i++) banked = d.step(DT, false, VIEW) === 'banked';
    expect(banked).toBe(true);
    const o = d.oxygen;
    for (let i = 0; i < 60; i++) d.step(DT, false, VIEW);
    expect(d.oxygen).toBeGreaterThan(o);
  });

  it('staying down too long blacks out and loses the dive', () => {
    const d = diver();
    let event: DiveEvent = null;
    for (let i = 0; i < 60 * 60 && event !== 'blackout'; i++) {
      const e = d.step(DT, true, VIEW);
      if (e) event = e;
    }
    expect(event).toBe('blackout');
    expect(d.divePoints).toBe(0);
    for (let i = 0; i < 60 * 4; i++) d.step(DT, false, VIEW);
    expect(d.y).toBe(0);
    expect(d.score).toBe(0);
  });

  it('three dives and the run is over', () => {
    const d = diver();
    let dives = 0;
    for (let i = 0; i < 60 * 200 && !d.over; i++) {
      const e = d.step(DT, d.diving ? d.y < 120 : d.oxygen > 0.95 || d.y > 0, VIEW);
      if (e === 'banked' || e === 'blackout') dives++;
    }
    expect(d.over).toBe(true);
    expect(dives).toBe(FREEDIVE.dives);
  });

  it('a careful diver brings back points and sees creatures', () => {
    for (const seed of [1, 2, 3]) {
      const d = diver(seed);
      for (let i = 0; i < 60 * 200 && !d.over; i++) {
        // breathe up, dive while there is air for the way back, rise in time
        const back = (d.y / FREEDIVE.float) * FREEDIVE.use * (1 + FREEDIVE.deepUse);
        const air = d.oxygen > back * 1.3 + 0.08;
        const hold = d.diving ? air : d.oxygen > 0.97 || d.y > 0;
        d.step(DT, hold, VIEW);
      }
      expect(d.over).toBe(true);
      expect(d.score).toBeGreaterThan(40);
      expect(d.seenIds.size).toBeGreaterThan(0);
    }
  });
});
