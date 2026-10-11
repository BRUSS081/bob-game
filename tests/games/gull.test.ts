import { describe, expect, it } from 'vitest';
import { GULL, GullFlight, hits, inCrate, type Hazard } from '../../src/games/gull.ts';

const DT = 1 / 60;
const GULL_X = 110;
const VIEW = 480;

/**
 * Flaps to stay in the way through the next two hazards: above sails,
 * under kites, low over the crates of fishing boats.
 */
function pilot(f: GullFlight): boolean {
  const gx = f.distance + GULL_X;
  let floor = 0;
  let roof = GULL.ceiling + 30;
  let crate = false;
  for (const h of f.hazards) {
    if (!h.active || h.x + 70 < gx - 20 || h.x > gx + 170) continue;
    if (h.kind === 'sail') floor = Math.max(floor, h.height + 6);
    else if (h.kind === 'kite') {
      roof = Math.min(roof, h.height - 24);
      if (gx < h.x + 26) floor = Math.max(floor, 30);
    }
    else if (gx < h.x + 24) floor = Math.max(floor, 18);
    else if (h.fish > 0 && gx < h.x + 54) crate = true;
  }
  // a flap lifts the gull about 29 px: flap low in the way through
  const target = crate ? 22 : Math.min(floor + 8, roof - 36);
  return f.alt + f.vy * 0.05 < target && f.vy < 0;
}

describe('gull', () => {
  it('falls into the sea without flapping', () => {
    const f = new GullFlight();
    let t = 0;
    while (!f.crashed && t < 5) {
      f.step(DT, false, GULL_X, VIEW);
      t += DT;
    }
    expect(f.crashed).toBe('water');
    expect(t).toBeLessThan(2);
  });

  it('a flap lifts the gull, and the ceiling stops it', () => {
    const f = new GullFlight();
    f.step(DT, true, GULL_X, VIEW);
    expect(f.vy).toBeGreaterThan(0);
    for (let i = 0; i < 600; i++) f.step(DT, i % 10 === 0, GULL_X, VIEW);
    expect(f.alt).toBeLessThanOrEqual(GULL.ceiling);
  });

  it('flying through a full crate steals a fish', () => {
    const h: Hazard = { active: true, kind: 'fishing', x: 1000, height: 0, fish: 2, look: 0 };
    expect(inCrate(h, 1035, 18)).toBe(true);
    expect(hits(h, 1035, 18)).toBe(false);
    expect(hits(h, 1012, 10)).toBe(true);
  });

  it('a careful pilot flies a long way and steals fish on every seed', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const f = new GullFlight();
      f.reset(seed);
      let t = 0;
      while (!f.crashed && t < 90) {
        f.step(DT, pilot(f), GULL_X, VIEW);
        t += DT;
      }
      expect(f.crashed, `seed ${seed} at ${t.toFixed(1)} s`).toBeNull();
      expect(f.fish).toBeGreaterThan(3);
    }
  });
});
