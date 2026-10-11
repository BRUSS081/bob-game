import { describe, expect, it } from 'vitest';
import { FISHING, FishingTrip, type FishEvent } from '../../src/games/fishing.ts';

const DT = 1 / 60;
const W = 480;
const DEPTH = 180;

function trip(seed = 2, night = false): FishingTrip {
  const f = new FishingTrip();
  f.reset(seed, W, DEPTH, night);
  return f;
}

/** Hooks a fish by hand: puts one right on the lure and waits for the bite. */
function hookOne(f: FishingTrip): void {
  while (f.power < 0.7) f.step(DT, false, false);
  f.step(DT, true, false);
  while (f.phase === 'cast') f.step(DT, false, false);
  const s = f.swimmers[0];
  s.active = true;
  for (let i = 0; i < 600 && f.phase === 'sink'; i++) {
    s.x = f.lureX;
    s.y = f.lureY;
    f.step(DT, false, f.lureY < 60);
  }
  expect(f.phase).toBe('fight');
}

describe('fishing', () => {
  it('more power casts further', () => {
    const f = trip();
    expect(f.castX(1)).toBeGreaterThan(f.castX(0.5));
    expect(f.castX(0.5)).toBeGreaterThan(f.castX(0));
    expect(f.castX(1)).toBeLessThan(W);
  });

  it('holding sinks the hook, letting go brings it back for another cast', () => {
    const f = trip();
    f.step(DT, true, false);
    while (f.phase === 'cast') f.step(DT, false, false);
    expect(f.phase).toBe('sink');
    for (let i = 0; i < 60; i++) f.step(DT, false, true);
    const deep = f.lureY;
    expect(deep).toBeGreaterThan(DEPTH * 0.3);
    let event: FishEvent = null;
    for (let i = 0; i < 60 * 10 && f.phase === 'sink'; i++) {
      // keep the fish and jellies away for this test
      for (const s of f.swimmers) s.active = false;
      for (const j of f.jellies) j.y = -100;
      event = f.step(DT, false, false) ?? event;
    }
    expect(f.phase).toBe('aim');
    expect(event).toBe('empty');
  });

  it('reeling without pause snaps the line', () => {
    const f = trip();
    hookOne(f);
    let event: FishEvent = null;
    for (let i = 0; i < 600 && f.phase === 'fight'; i++) event = f.step(DT, false, true) ?? event;
    expect(event).toBe('snap');
  });

  it('never reeling lets the fish escape', () => {
    const f = trip();
    hookOne(f);
    let event: FishEvent = null;
    for (let i = 0; i < 60 * 30 && f.phase === 'fight'; i++) event = f.step(DT, false, false) ?? event;
    expect(event).toBe('escape');
  });

  it('reeling while the tension is low lands the fish', () => {
    for (const seed of [1, 2, 3, 4]) {
      const f = trip(seed);
      hookOne(f);
      let event: FishEvent = null;
      for (let i = 0; i < 60 * 30 && f.phase === 'fight'; i++) event = f.step(DT, false, f.tension < 0.6) ?? event;
      expect(event).toBe('catch');
      expect(f.score).toBeGreaterThan(0);
      expect(f.caught).not.toBeNull();
    }
  });

  it('a session ends after its time', () => {
    const f = trip();
    for (let i = 0; i < 60 * (FISHING.session + 30) && !f.over; i++) f.step(DT, i % 120 === 0, false);
    expect(f.over).toBe(true);
  });

  it('a patient player catches fish in a session, by day and by night', () => {
    for (const night of [false, true]) {
      const f = trip(5, night);
      for (let i = 0; i < 60 * (FISHING.session + 30) && !f.over; i++) {
        const press = f.phase === 'aim' ? f.power > 0.6 : f.phase === 'card';
        const hold = f.phase === 'sink' ? f.lureY < DEPTH * 0.6 || i % 90 < 30 : f.phase === 'fight' ? f.tension < 0.6 : false;
        f.step(DT, press, hold);
      }
      expect(f.catches).toBeGreaterThan(2);
    }
  });
});
