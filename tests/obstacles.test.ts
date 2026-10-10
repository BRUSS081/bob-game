import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { Rng } from '../src/core/rng.ts';
import { SURF } from '../src/game/config.ts';
import { KITE_OBSTACLES, Obstacles, SURF_OBSTACLES, WING_OBSTACLES } from '../src/game/obstacles.ts';
import { KITE, WING } from '../src/game/config.ts';
import { KiteAthlete } from '../src/game/athletes.ts';
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
    const pool = new Obstacles(SURF_OBSTACLES, 16);
    const rng = new Rng(3);
    pool.reset(SURF.firstGap);
    let speed: number = SURF.startSpeed;
    let lastEnd = -Infinity;
    let travelled = 0;
    let spawns = 0;
    for (let i = 0; i < 60 * 120; i++) {
      speed = Math.min(SURF.maxSpeed, speed + SURF.acceleration * STEP);
      travelled += speed * STEP;
      const info = pool.update(STEP, speed, 500, SURF.playerX, rng, SURF);
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
    const pool = new Obstacles(SURF_OBSTACLES, 4);
    const rng = new Rng(1);
    pool.reset(0);
    pool.update(STEP, 300, 100, SURF.playerX, rng, SURF);
    expect(pool.items.filter((o) => o.active).length).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) pool.update(STEP, 300, 100, SURF.playerX, rng, SURF);
    for (const o of pool.items) if (o.active) expect(o.x + o.kind.w).toBeGreaterThanOrEqual(-16);
  });
});

describe('kitesurf and wing foil obstacles', () => {
  it('every kite surface obstacle can be cleared by a kite jump at top speed', () => {
    // time the rider spends above each height during one jump
    const a = new KiteAthlete();
    const ys: number[] = [];
    a.update(STEP, true, false);
    while (a.state === 'air') {
      ys.push(a.y);
      a.update(STEP, false, false);
    }
    for (const k of KITE_OBSTACLES.filter((k) => k.minY === 0)) {
      const above = ys.filter((y) => y >= k.h - 1).length * STEP;
      const span = KITE.playerW - 2 * KITE.hitboxInset + k.w - 2 * KITE.hitboxInset;
      expect(above, k.name).toBeGreaterThan(span / Math.max(k.minSpeed, KITE.startSpeed));
    }
  });

  it('kite gaps leave room for a whole kite jump', () => {
    const a = new KiteAthlete();
    a.update(STEP, true, false);
    let t = STEP;
    while (a.state === 'air') {
      a.update(STEP, false, false);
      t += STEP;
    }
    expect(KITE.minGapTime).toBeGreaterThan(t + 0.1);
  });

  it('every wing obstacle leaves an altitude window below the breach height', () => {
    for (const k of WING_OBSTACLES) {
      const top = k.minY + k.h - 1;
      let lo = 0;
      let hi = WING.breach;
      if (k.layer === 1) lo = top;
      if (k.layer === 4) lo = top + WING.mastLength + 1;
      if (k.layer === 2) hi = k.minY - 44;
      expect(hi - lo, k.name).toBeGreaterThanOrEqual(3);
    }
  });

  it('flyers get extra room so they do not catch up with the obstacle ahead', () => {
    const pool = new Obstacles(KITE_OBSTACLES, 16);
    const rng = new Rng(11);
    pool.reset(0, rng, KITE.maxSpeed);
    const passTimes: number[] = [];
    const seen = new Set<object>();
    for (let i = 0; i < 60 * 120; i++) {
      pool.update(STEP, KITE.maxSpeed, 600, KITE.playerX, rng, KITE);
      for (const o of pool.items) {
        if (o.active && !seen.has(o) && o.x < KITE.playerX) {
          seen.add(o);
          passTimes.push(i * STEP);
        }
        if (!o.active) seen.delete(o);
      }
    }
    passTimes.sort((a, b) => a - b);
    for (let i = 1; i < passTimes.length; i++) expect(passTimes[i] - passTimes[i - 1]).toBeGreaterThan(KITE.minGapTime * 0.75);
  });
});
