import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { Rng } from '../src/core/rng.ts';
import { WingAthlete } from '../src/game/athletes.ts';
import { FLOW, SCORING, SURF, WING } from '../src/game/config.ts';
import { DOLPHIN_COUNT, Dolphins } from '../src/game/dolphins.ts';
import { Game } from '../src/game/game.ts';
import { KITE_OBSTACLES, Obstacles, SURF_OBSTACLES, WING_OBSTACLES, type Section } from '../src/game/obstacles.ts';

function obstacle(g: Game, name: string, x: number, y = 0) {
  const table = g.sport === 'surf' ? SURF_OBSTACLES : g.sport === 'kite' ? KITE_OBSTACLES : WING_OBSTACLES;
  const o = g.obstacles.items[0];
  o.active = true;
  o.kind = table.find((k) => k.name === name)!;
  o.x = o.prevX = x;
  o.y = y;
  o.closest = Infinity;
  o.over = o.passed = o.hopped = false;
  o.hop = -1;
  return o;
}

/** Wing foil held at a fixed altitude, step by step. */
function holdWing(g: Game, altitude: number, seconds: number): void {
  const a = g.athlete as WingAthlete;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    a.y = a.prevY = altitude;
    a.vy = 0;
    g.update(STEP, false, false);
  }
}

function quietGame(sport: 'surf' | 'kite' | 'wing'): Game {
  const g = new Game(sport, 0, {}, { powerUps: false });
  g.start(11);
  g.obstacles.reset(1e9);
  g.dolphins.active = false;
  return g;
}

describe('near misses', () => {
  it('a foil passing a few pixels over a plank scores a close call', () => {
    const g = quietGame('wing');
    // board underside 4 px above the plank's top edge
    obstacle(g, 'plank', WING.playerX + 30, 0);
    holdWing(g, 8, 0.6);
    expect(g.phase).toBe('running');
    expect(g.stats.closeCalls).toBe(1);
    expect(g.popups.some((p) => p.active && p.kind === 'close' && p.points === SCORING.nearMissPoints)).toBe(true);
  });

  it('a wide pass is not a close call', () => {
    const g = quietGame('wing');
    obstacle(g, 'plank', WING.playerX + 30, 0);
    holdWing(g, 12, 0.6);
    expect(g.stats.closeCalls).toBe(0);
  });

  it('jumping over a rival gives the over bonus', () => {
    const g = quietGame('surf');
    const o = obstacle(g, 'rival', SURF.playerX - 20, 0);
    // the rival was cleared from above, it is now passing behind the player
    o.over = true;
    o.closest = 20;
    o.hopped = true;
    const before = g.points;
    g.update(STEP, false, false);
    expect(g.stats.overs).toBe(1);
    expect(g.points - before).toBeGreaterThanOrEqual(50);
  });
});

describe('wing foil flow', () => {
  it('flying just under the breach limit fills the flow meter and multiplies distance points', () => {
    const low = quietGame('wing');
    holdWing(low, 8, 3);
    const high = quietGame('wing');
    holdWing(high, WING.breach - 2, 3);
    expect(low.flow).toBe(0);
    expect(high.flow).toBe(1);
    expect(high.stats.maxFlow).toBe(1);
    expect(high.flowFactor).toBe(FLOW.maxFactor);
    expect(high.points).toBeGreaterThan(low.points * 1.8);
  });

  it('the flow drains when leaving the band', () => {
    const g = quietGame('wing');
    holdWing(g, WING.breach - 2, 3);
    holdWing(g, 6, 0.5);
    expect(g.flow).toBeLessThan(1);
    expect(g.flow).toBeGreaterThan(0);
  });
});

describe('dolphins', () => {
  it('a pod shows up after a while and leaves again', () => {
    const d = new Dolphins();
    const rng = new Rng(2);
    d.reset(rng);
    let seen = 0;
    let t = 0;
    for (; t < 60 && seen === 0; t += STEP) {
      d.update(STEP, rng);
      if (d.active) seen = t;
    }
    expect(seen).toBeGreaterThanOrEqual(20);
    expect(seen).toBeLessThanOrEqual(35);
    for (let i = 0; i < 12 / STEP; i++) d.update(STEP, rng);
    expect(d.active).toBe(false);
  });

  it('dolphins jump in turns and overtake the athlete', () => {
    const d = new Dolphins();
    d.active = true;
    for (let i = 0; i < DOLPHIN_COUNT; i++) {
      expect(d.offset(i, 0)).toBeLessThan(0);
      expect(d.offset(i, 10)).toBeGreaterThan(0);
    }
    const heights = [0, 0.2, 0.35, 0.5, 0.65].map((t) => d.altitude(0, t));
    expect(Math.max(...heights)).toBeGreaterThan(15);
    expect(d.altitude(0, 1)).toBeLessThan(0);
  });

  it('jumping next to a jumping dolphin gives the bonus once per pod', () => {
    const g = quietGame('wing');
    const d = g.dolphins;
    d.active = true;
    d.scored = false;
    // a moment when dolphin 0 is mid-air right next to the athlete
    d.time = 1;
    while (!(d.altitude(0) > 4 && Math.abs(d.offset(0)) < 70)) d.time += 0.01;
    holdWing(g, 14, STEP);
    expect(g.stats.dolphins).toBe(1);
    holdWing(g, 14, 0.5);
    expect(g.stats.dolphins).toBe(1);
  });
});

describe('rhythm', () => {
  it('runs alternate normal stretches, dense sets and calm breathers', () => {
    const pool = new Obstacles(SURF_OBSTACLES, 16);
    const rng = new Rng(4);
    const speed = 320;
    pool.reset(SURF.firstGap, rng, speed);
    const gaps: Record<Section, number[]> = { normal: [], set: [], calm: [] };
    const order: Section[] = [];
    for (let i = 0; i < 60 * 240; i++) {
      const info = pool.update(STEP, speed, 648, SURF.playerX, rng, SURF);
      if (order[order.length - 1] !== pool.section) order.push(pool.section);
      if (info.spawned) gaps[pool.section].push(info.gap / speed);
    }
    expect(order.slice(0, 4)).toEqual(['normal', 'set', 'calm', 'normal']);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(gaps.set)).toBeLessThan(mean(gaps.normal));
    expect(mean(gaps.calm)).toBeGreaterThan(mean(gaps.normal));
    // every section keeps the minimum gap, so nothing becomes impossible
    for (const s of ['normal', 'set', 'calm'] as const) for (const gap of gaps[s]) expect(gap).toBeGreaterThanOrEqual(SURF.minGapTime - 1e-9);
  });

  it('the speed ramp is quicker at the start than near the top', () => {
    const g = quietGame('surf');
    const s0 = g.speed;
    for (let i = 0; i < 10 / STEP; i++) g.update(STEP, false, false);
    const early = g.speed - s0;
    for (let i = 0; i < 50 / STEP; i++) g.update(STEP, false, false);
    const s1 = g.speed;
    for (let i = 0; i < 10 / STEP; i++) g.update(STEP, false, false);
    expect(early).toBeGreaterThan((g.speed - s1) * 1.5);
  });
});

describe('rivals', () => {
  it('a rival hops once far ahead and is back on the water long before the player', () => {
    const pool = new Obstacles(SURF_OBSTACLES, 4);
    const rng = new Rng(1);
    pool.reset(1e9, rng, 300);
    const o = pool.items[0];
    o.active = true;
    o.kind = SURF_OBSTACLES.find((k) => k.name === 'rival')!;
    o.x = o.prevX = 648;
    o.y = 0;
    o.hop = -1;
    o.hopped = false;
    let peak = 0;
    for (let speed = 450; o.x > SURF.playerX; ) {
      pool.update(STEP, speed, 648, SURF.playerX, rng, SURF);
      peak = Math.max(peak, o.y);
      if (o.x < SURF.playerX + 150) expect(o.y).toBe(0);
    }
    expect(peak).toBeGreaterThan(10);
    expect(o.hopped).toBe(true);
  });
});

describe('determinism', () => {
  it('the same seed and the same inputs play the same run', () => {
    const a = new Game('kite', 0);
    const b = new Game('kite', 0);
    a.start(1234);
    b.start(1234);
    // stop at the first wipeout: a restart picks a fresh random seed
    for (let i = 0; i < 20 / STEP && a.phase === 'running'; i++) {
      const press = i % 50 === 0;
      a.update(STEP, press, press);
      b.update(STEP, press, press);
    }
    expect(a.points).toBe(b.points);
    expect(a.phase).toBe(b.phase);
    expect(a.obstacles.items.map((o) => [o.active, o.x, o.y])).toEqual(b.obstacles.items.map((o) => [o.active, o.x, o.y]));
  });
});
