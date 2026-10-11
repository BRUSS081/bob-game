import { describe, expect, it } from 'vitest';
import { HELPER, REEF, ReefDefense, type ReefEvent } from '../../src/games/reef.ts';

const DT = 1 / 60;

function field(seed = 3): ReefDefense {
  const f = new ReefDefense();
  f.reset(seed);
  return f;
}

/** Plays until the end; `plan` may build each step. */
function play(f: ReefDefense, plan: (f: ReefDefense) => void): ReefEvent {
  let last: ReefEvent = null;
  for (let i = 0; i < 60 * 600 && !f.over; i++) {
    plan(f);
    const e = f.step(DT, false);
    if (e) last = e;
  }
  return last;
}

describe('reef guard', () => {
  it('building costs shells, upgrading costs more', () => {
    const f = field();
    expect(f.build(0, 'diver')).toBe(true);
    expect(f.shells).toBe(REEF.startShells - HELPER.diver.cost);
    expect(f.build(1, 'diver')).toBe(false);
    f.shells = 100;
    expect(f.upgrade(0)).toBe(true);
    expect(f.helpers[0].level).toBe(2);
    expect(f.upgrade(0)).toBe(false);
  });

  it('trash moves along its lane and hurts the reef', () => {
    const f = field();
    const event = play(f, () => {});
    expect(event).toBe('lost');
    expect(f.health).toBe(0);
    expect(f.won).toBe(false);
  });

  it('a net stops small trash crossing it', () => {
    const f = field();
    f.build(0, 'net');
    const tr = f.trash[0];
    tr.active = true;
    tr.kind = 'bag';
    tr.lane = 0;
    tr.x = REEF.slots[0] + 30;
    tr.hp = 1;
    tr.speed = 50;
    let stopped = false;
    for (let i = 0; i < 120 && !stopped; i++) stopped = f.step(DT, false) === 'stopped';
    expect(stopped).toBe(true);
    expect(f.stopped).toBe(1);
  });

  it('a press starts the next wave', () => {
    const f = field();
    f.step(DT, true);
    expect(f.wave).toBe(1);
  });

  it('a sensible builder saves the reef; building nothing loses it', () => {
    for (const seed of [1, 2, 3]) {
      const f = field(seed);
      // a net at the front of each lane, then a turtle in each lane, then divers
      const order: [number, 'net' | 'turtle' | 'diver'][] = [];
      for (let lane = 0; lane < 3; lane++) order.push([lane * 3 + 2, 'net']);
      for (let lane = 0; lane < 3; lane++) order.push([lane * 3 + 1, 'turtle']);
      for (let lane = 0; lane < 3; lane++) order.push([lane * 3 + 0, 'diver']);
      const event = play(f, (g) => {
        for (const [spot, kind] of order) {
          if (!g.helpers[spot].kind) {
            g.build(spot, kind);
            return;
          }
        }
        for (const [spot] of order) if (g.upgrade(spot)) return;
      });
      expect(event, `seed ${seed}: wave ${f.wave}, health ${f.health}`).toBe('won');
      expect(f.health).toBeGreaterThan(0);
    }
  });
});
