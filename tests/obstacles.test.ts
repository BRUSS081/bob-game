import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { Rng } from '../src/core/rng.ts';
import { SURF } from '../src/game/config.ts';
import { Obstacles, SURF_OBSTACLES } from '../src/game/obstacles.ts';
import { simulateJump, timeAbove } from './helpers/jump.ts';

const best = [0, 0.05, 0.1, 0.15, 0.2].map((h) => simulateJump(h));

describe('obstacles are fair', () => {
  it.each(SURF_OBSTACLES.map((k) => [k.name, k] as const))('%s can be cleared at every speed it appears', (_n, kind) => {
    const inset = SURF.hitboxInset;
    // horizontal overlap span of the two (shrunk) hitboxes
    const span = SURF.playerW - 2 * inset + kind.w - 2 * inset;
    for (const speed of [Math.max(SURF.startSpeed, kind.minSpeed), SURF.maxSpeed]) {
      const needed = span / speed;
      const available = Math.max(...best.map((p) => timeAbove(p, kind.h - 1)));
      expect(available, `${kind.name} at ${speed}px/s`).toBeGreaterThan(needed + 2 * STEP);
    }
  });

  it('the minimum gap leaves time to land and jump again', () => {
    const longest = Math.max(...best.map((p) => p.airtime));
    expect(SURF.minGapTime).toBeGreaterThan(longest + 0.15);
  });
});

describe('obstacle pool', () => {
  it('spawns by distance, keeps gaps and never grows', () => {
    const pool = new Obstacles(16);
    const rng = new Rng(3);
    pool.reset(SURF.firstGap);
    let speed: number = SURF.startSpeed;
    let lastEnd = -Infinity;
    let travelled = 0;
    let spawns = 0;
    for (let i = 0; i < 60 * 120; i++) {
      speed = Math.min(SURF.maxSpeed, speed + SURF.acceleration * STEP);
      travelled += speed * STEP;
      const info = pool.update(STEP, speed, 500, rng, SURF);
      if (info.spawned) {
        spawns++;
        // distance between this group's start and the previous group's end
        const start = travelled;
        if (lastEnd > -Infinity) expect(start - lastEnd).toBeGreaterThanOrEqual(speed * SURF.minGapTime - speed * STEP * 2);
        lastEnd = travelled + (info.groupEnd - 500);
        for (const o of pool.items) if (o.active && o.x >= 500) expect(speed).toBeGreaterThanOrEqual(o.kind.minSpeed);
      }
      expect(pool.items.length).toBe(16);
    }
    expect(spawns).toBeGreaterThan(50);
  });

  it('recycles obstacles that leave the screen', () => {
    const pool = new Obstacles(4);
    const rng = new Rng(1);
    pool.reset(0);
    pool.update(STEP, 300, 100, rng, SURF);
    expect(pool.items.filter((o) => o.active).length).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) pool.update(STEP, 300, 100, rng, SURF);
    for (const o of pool.items) if (o.active) expect(o.x + o.kind.w).toBeGreaterThanOrEqual(-16);
  });
});
