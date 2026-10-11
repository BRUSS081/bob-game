import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { MISSIONS, MissionLog, type Mission, type RunResult } from '../src/custom/missions.ts';
import { Profile } from '../src/custom/profile.ts';
import { dailySeed, dayKey } from '../src/game/daily.ts';
import { Game, newStats } from '../src/game/game.ts';
import { GHOST_AIR, GHOST_RIDE, GhostTrack, newGhostSample } from '../src/game/ghost.ts';
import { BASE_GEAR_COUNT, GEAR_COLORS } from '../src/sprites/ramps.ts';

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const g = globalThis as unknown as { window?: unknown };
beforeEach(() => {
  g.window = { localStorage: new MemoryStorage() };
});
afterEach(() => {
  delete g.window;
});

describe('daily challenge', () => {
  it('the day follows the local calendar', () => {
    expect(dayKey(new Date(2026, 9, 11, 23, 59))).toBe('2026-10-11');
    expect(dayKey(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });

  it('the seed is the same for a day and sport, different otherwise', () => {
    expect(dailySeed('2026-10-11', 'surf')).toBe(dailySeed('2026-10-11', 'surf'));
    expect(dailySeed('2026-10-11', 'surf')).not.toBe(dailySeed('2026-10-12', 'surf'));
    expect(dailySeed('2026-10-11', 'surf')).not.toBe(dailySeed('2026-10-11', 'kite'));
    expect(dailySeed('2026-10-11', 'wing')).toBeGreaterThan(0);
  });

  it('a daily run restarts on the same seed', () => {
    const game = new Game('surf', 0);
    const seed = dailySeed('2026-10-11', 'surf');
    game.restartSeed = seed;
    game.start(seed);
    // crash into the first obstacle, then restart
    for (let i = 0; i < 30 / STEP && game.phase === 'running'; i++) game.update(STEP, false, false);
    expect(game.phase).toBe('over');
    for (let i = 0; i < 60; i++) game.update(STEP, false, false);
    game.update(STEP, true, true);
    expect(game.phase).toBe('running');
    expect(game.seed).toBe(seed);
  });

  it("keeps today's best and ghost, forgets other days", () => {
    const p = new Profile();
    expect(p.daily('surf', '2026-10-11').best).toBe(0);
    p.saveDaily('surf', { day: '2026-10-11', best: 420, ghost: 'abc' });
    const q = new Profile();
    expect(q.daily('surf', '2026-10-11')).toEqual({ day: '2026-10-11', best: 420, ghost: 'abc' });
    expect(q.daily('surf', '2026-10-12').best).toBe(0);
    expect(q.daily('kite', '2026-10-11').best).toBe(0);
  });
});

describe('ghost', () => {
  it('records at a fixed rate and interpolates', () => {
    const t = new GhostTrack();
    for (let i = 1; i <= 120; i++) t.record(i * STEP, i * 5, i < 60 ? 0 : 10, 0, i < 60 ? GHOST_RIDE : GHOST_AIR);
    expect(t.count).toBe(41);
    expect(t.duration).toBeCloseTo(2.05, 2);
    const s = newGhostSample();
    t.sample(1, s);
    expect(s.distance).toBeGreaterThan(290);
    expect(s.distance).toBeLessThan(310);
    expect(s.state).toBe(GHOST_AIR);
    t.sample(99, s);
    expect(s.distance).toBe(600);
  });

  it('survives encoding for storage', () => {
    const t = new GhostTrack();
    for (let i = 1; i <= 600; i++) t.record(i * STEP, i * 3.25, Math.sin(i / 10) * 30 + 30, (i % 40) / 40, i % 3);
    const text = t.encode();
    expect(text.length).toBeLessThan(5000);
    const u = new GhostTrack();
    expect(u.decode(text)).toBe(true);
    expect(u.count).toBe(t.count);
    for (let i = 0; i < t.count; i++) {
      expect(u.distance[i]).toBeCloseTo(t.distance[i], 0);
      expect(u.y[i]).toBeCloseTo(t.y[i], 0);
      expect(u.state[i]).toBe(t.state[i]);
    }
    expect(u.decode('not base64 !!')).toBe(false);
    expect(u.decode(123)).toBe(false);
    expect(u.count).toBe(0);
  });
});

describe('missions', () => {
  function result(patch: Partial<RunResult> = {}, stats: Partial<ReturnType<typeof newStats>> = {}): RunResult {
    return { sport: 'surf', points: 0, daily: false, stats: { ...newStats(), ...stats }, ...patch };
  }

  it('each mission unlocks one special color, all of them distinct', () => {
    const rewards = MISSIONS.map((m) => m.reward);
    expect(new Set(rewards).size).toBe(MISSIONS.length);
    for (const r of rewards) expect(r).toBeGreaterThanOrEqual(BASE_GEAR_COUNT);
    expect(BASE_GEAR_COUNT + MISSIONS.length).toBe(GEAR_COLORS.length);
  });

  it('three missions are open; completing one opens the next and is remembered', () => {
    const log = new MissionLog();
    expect(log.active.map((m) => m.id)).toEqual(['score500', 'close3', 'combo3']);
    const out: Mission[] = [];
    expect(log.check(result({ points: 100 }), out)).toBe(0);
    expect(log.check(result({ points: 650 }), out)).toBe(1);
    expect(out[0].id).toBe('score500');
    expect(log.unlocked.has(out[0].reward)).toBe(true);
    expect(log.active.map((m) => m.id)).toEqual(['close3', 'combo3', 'daily']);
    const again = new MissionLog();
    expect(again.done.has('score500')).toBe(true);
    expect(again.active[0].id).toBe('close3');
  });

  it('sport missions only count in their sport', () => {
    const log = new MissionLog();
    const flow = MISSIONS.find((m) => m.id === 'flow')!;
    expect(log.progress(flow, result({ sport: 'surf' }, { maxFlow: 1 }))).toBe(0);
    expect(log.progress(flow, result({ sport: 'wing' }, { maxFlow: 1 }))).toBe(1);
  });
});
