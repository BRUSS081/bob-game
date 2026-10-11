import { describe, expect, it } from 'vitest';
import { SWELLS, SwellRide } from '../../src/games/swells.ts';

const DT = 1 / 60;

function ride(hold: (r: SwellRide) => boolean, seed = 5, seconds: number = SWELLS.day): SwellRide {
  const r = new SwellRide();
  r.reset(seed);
  for (let i = 0; i < seconds * 60 + 2 && !r.over; i++) r.step(DT, hold(r));
  return r;
}

/** Holds on the way down, lets go on the way up and in the air. */
const surfer = (r: SwellRide) => (r.air ? r.vy < 0 && r.sea.slope(r.x + r.vx * 0.3) < 0 : r.sea.slope(r.x) < 0);

describe('swells', () => {
  it('the day ends after its time', () => {
    const r = ride(() => false);
    expect(r.over).toBe(true);
    expect(r.time).toBeGreaterThanOrEqual(SWELLS.day - DT);
  });

  it('holding down the slopes is faster than never pressing or always pressing', () => {
    for (const seed of [1, 2, 3]) {
      const good = ride(surfer, seed);
      const never = ride(() => false, seed);
      const always = ride(() => true, seed);
      expect(good.x).toBeGreaterThan(never.x * 1.5);
      expect(good.x).toBeGreaterThan(always.x * 1.2);
    }
  });

  it('a good rhythm takes off from crests and lands again', () => {
    const r = new SwellRide();
    r.reset(4);
    let flights = 0;
    let wasAir = false;
    for (let i = 0; i < 60 * 60; i++) {
      r.step(DT, surfer(r));
      if (r.air && !wasAir) flights++;
      wasAir = r.air;
      expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
      if (!r.air) expect(Math.abs(r.y - r.sea.at(r.x))).toBeLessThan(0.5);
    }
    expect(flights).toBeGreaterThan(5);
    expect(r.perfects).toBeGreaterThan(0);
  });

  it('the same seed gives the same sea', () => {
    const a = new SwellRide();
    const b = new SwellRide();
    a.reset(9);
    b.reset(9);
    for (let x = 0; x < 5000; x += 250) expect(a.sea.at(x)).toBe(b.sea.at(x));
  });
});
