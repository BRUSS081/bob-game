import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { MODES, SURF } from '../src/game/config.ts';
import { Game } from '../src/game/game.ts';
import { RUN_MODES, modeBestKey, modeHasSport } from '../src/game/modes.ts';
import { SURF_OBSTACLES } from '../src/game/obstacles.ts';
import { TOUR_SPOTS, starsFor } from '../src/game/tour.ts';

function run(g: Game, seconds: number, pressed = false, held = false): void {
  for (let i = 0; i < Math.round(seconds / STEP) && g.phase === 'running'; i++) g.update(STEP, pressed, held);
}

function rockAhead(g: Game): void {
  const o = g.obstacles.items[0];
  o.active = true;
  o.kind = SURF_OBSTACLES.find((k) => k.name === 'rock')!;
  o.x = o.prevX = g.cfg.playerX + g.cfg.playerW + 2;
  o.y = 0;
  o.closest = Infinity;
  o.over = o.passed = o.hopped = false;
  o.hop = -1;
}

function game(mode: (typeof RUN_MODES)[number], sport: 'surf' | 'kite' | 'wing' = 'surf'): Game {
  const g = new Game(sport, 0, {}, { powerUps: false });
  g.setMode(mode, mode === 'tour' ? 3000 : 0);
  g.start(42);
  return g;
}

describe('60 seconds', () => {
  it('a hit is a fall, not a wipeout: the combo is lost and two seconds go', () => {
    const g = game('sixty');
    run(g, 1);
    rockAhead(g);
    const before = g.time;
    run(g, STEP * 3);
    expect(g.phase).toBe('running');
    expect(g.stumble).toBeGreaterThan(0);
    expect(g.time).toBeGreaterThan(before + MODES.sixty.penalty - 0.1);
    run(g, MODES.stumble.time + 0.1);
    expect(g.athlete.state).toBe('ride');
    expect(g.grace).toBeGreaterThan(0);
  });

  it('ends when the minute is over', () => {
    const g = game('sixty');
    g.obstacles.reset(1e9);
    run(g, 61);
    expect(g.phase).toBe('over');
    expect(g.endReason).toBe('time');
  });
});

describe('world tour', () => {
  it('a spot ends at the finish line, and stars follow the points', () => {
    const g = game('tour');
    g.obstacles.reset(1e9);
    run(g, 30);
    expect(g.phase).toBe('over');
    expect(g.endReason).toBe('finish');
    expect(g.distance).toBeGreaterThanOrEqual(3000);
    const spot = TOUR_SPOTS[0];
    expect(starsFor(spot, 10, false)).toBe(0);
    expect(starsFor(spot, 10, true)).toBe(1);
    expect(starsFor(spot, spot.stars[0], true)).toBe(2);
    expect(starsFor(spot, spot.stars[1], true)).toBe(3);
  });

  it('has twelve spots with every sport and growing finish lines', () => {
    expect(TOUR_SPOTS).toHaveLength(12);
    for (const sport of ['surf', 'kite', 'wing']) expect(TOUR_SPOTS.some((s) => s.sport === sport)).toBe(true);
    for (let i = 1; i < TOUR_SPOTS.length; i++) expect(TOUR_SPOTS[i].finish).toBeGreaterThan(TOUR_SPOTS[i - 1].finish);
    expect(new Set(TOUR_SPOTS.map((s) => s.seed)).size).toBe(12);
  });
});

describe('big wave', () => {
  it('without tricks the wave catches up', () => {
    const g = game('bigwave');
    g.obstacles.reset(1e9);
    run(g, 120);
    expect(g.phase).toBe('over');
    expect(g.endReason).toBe('wave');
  });

  it('a hit slows you down and the wave gains', () => {
    const g = game('bigwave');
    g.obstacles.reset(1e9);
    run(g, 1);
    const gap = g.waveGap;
    rockAhead(g);
    run(g, 0.5);
    expect(g.phase).toBe('running');
    expect(gap - g.waveGap).toBeGreaterThan(40);
  });

  it('tricks push you ahead of the wave', () => {
    const g = game('bigwave');
    g.obstacles.reset(1e9);
    run(g, 1);
    const gap = g.waveGap;
    g.boost = MODES.bigwave.boostTime;
    run(g, MODES.bigwave.boostTime);
    expect(g.waveGap).toBeGreaterThan(gap + 50);
  });
});

describe('triathlon', () => {
  it('goes surf, kitesurf, wing foil, then surf again, keeping the speed level', () => {
    const g = game('triathlon');
    expect(g.sport).toBe('surf');
    g.shield = true;
    run(g, MODES.triathlon.leg + STEP);
    expect(g.sport).toBe('kite');
    const kiteSpeed = g.speed;
    expect(kiteSpeed).toBeGreaterThan(g.cfg.startSpeed);
    run(g, MODES.triathlon.leg + STEP);
    expect(g.sport).toBe('wing');
    run(g, MODES.triathlon.leg + STEP);
    expect(g.sport).toBe('surf');
    expect(g.legs).toBe(3);
  });

  it('a restart begins with surf again', () => {
    const g = game('triathlon');
    g.shield = true;
    run(g, MODES.triathlon.leg + STEP);
    expect(g.sport).toBe('kite');
    g.start(1);
    expect(g.sport).toBe('surf');
  });
});

describe('free ride', () => {
  it('open water: no obstacles, falls do not end the ride, dolphins come often', () => {
    const g = game('freeride');
    let seenDolphins = false;
    for (let i = 0; i < 40 / STEP; i++) {
      g.update(STEP, i % 40 === 0, i % 40 < 3);
      if (g.dolphins.active) seenDolphins = true;
    }
    expect(g.phase).toBe('running');
    expect(g.obstacles.items.some((o) => o.active)).toBe(false);
    expect(seenDolphins).toBe(true);
  });
});

describe('mode keys', () => {
  it('sport choice and saved bests per mode', () => {
    expect(modeHasSport('endless')).toBe(true);
    expect(modeHasSport('triathlon')).toBe(false);
    expect(modeHasSport('tour')).toBe(false);
    expect(modeBestKey('endless', 'kite')).toBe('kite');
    expect(modeBestKey('sixty', 'wing')).toBe('sixty.wing');
    expect(modeBestKey('triathlon', 'surf')).toBe('triathlon');
    expect(modeBestKey('freeride', 'surf')).toBeNull();
    expect(SURF.playerX).toBeGreaterThan(0);
  });
});
