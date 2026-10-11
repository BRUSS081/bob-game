import { describe, expect, it } from 'vitest';
import { SLALOM, SlalomRun, type Thing } from '../../src/games/slalom.ts';

const DT = 1 / 60;
const AHEAD = 300;

function run(seed = 3): SlalomRun {
  const r = new SlalomRun();
  r.reset(seed);
  return r;
}

/** Steers toward the next gate and around anything hard in the way. */
function pilot(r: SlalomRun): number {
  let target = 0;
  let next: Thing | null = null;
  for (const th of r.things) {
    if (!th.active || th.y < r.y + 4 || th.y > r.y + 160) continue;
    if (th.kind === 'gate' && !th.used && (!next || th.y < next.y)) next = th;
  }
  if (next) target = next.x;
  for (const th of r.things) {
    if (!th.active || th.y < r.y - 2 || th.y > r.y + 70) continue;
    if (th.kind === 'gate' || th.kind === 'ramp' || th.kind === 'kelp') continue;
    const reach = (th.kind === 'log' ? th.half : 12) + 14;
    if (Math.abs(th.x - target) < reach) target = th.x + (target >= th.x ? reach : -reach);
  }
  // aim a little ahead, then straighten up for speed
  const want = Math.max(-0.9, Math.min(0.9, (target - r.x) / 60));
  return Math.abs(want - r.angle) < 0.05 ? 0 : want > r.angle ? 1 : -1;
}

describe('slalom', () => {
  it('steering turns the board, up to the widest angle', () => {
    const r = run();
    for (let i = 0; i < 120; i++) r.step(DT, 1, false, AHEAD);
    expect(r.angle).toBeCloseTo(SLALOM.maxAngle, 5);
    expect(r.x).toBeGreaterThan(0);
  });

  it('straight down is faster than across', () => {
    const a = run();
    const b = run();
    b.angle = SLALOM.maxAngle;
    for (let i = 0; i < 60; i++) {
      a.step(DT, 0, false, AHEAD);
      b.step(DT, 0, false, AHEAD);
      for (const th of a.things) th.active = false;
      for (const th of b.things) th.active = false;
    }
    expect(a.speed).toBeGreaterThan(b.speed);
  });

  it('passing between the flags of a gate scores it', () => {
    const r = run();
    for (const th of r.things) th.active = false;
    r.things[0].active = true;
    r.things[0].kind = 'gate';
    r.things[0].x = 0;
    r.things[0].y = 40;
    r.things[0].half = SLALOM.gateGap / 2;
    r.things[0].used = false;
    let gate = false;
    for (let i = 0; i < 60 && !gate; i++) gate = r.step(DT, 0, false, 0) === 'gate';
    expect(gate).toBe(true);
    expect(r.gates).toBe(1);
  });

  it('the foam catches a surfer who keeps hitting things', () => {
    const r = run();
    let event = null;
    for (let i = 0; i < 60 * 60 && !r.over; i++) {
      // ride across the course into the edge: slow, and the foam comes
      event = r.step(DT, 1, false, AHEAD) ?? event;
    }
    expect(r.over).toBe(true);
    expect(event).toBe('caught');
  });

  it('a good pilot goes far and passes gates', () => {
    for (const seed of [1, 2, 3]) {
      const r = run(seed);
      for (let i = 0; i < 60 * 40 && !r.over; i++) r.step(DT, pilot(r), i % 150 === 0, AHEAD);
      expect(r.meters).toBeGreaterThan(300);
      expect(r.gates).toBeGreaterThan(3);
    }
  });
});
