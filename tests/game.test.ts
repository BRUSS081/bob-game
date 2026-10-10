import { describe, expect, it, vi } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { KiteAthlete, WingAthlete } from '../src/game/athletes.ts';
import { KITE, SURF, WING } from '../src/game/config.ts';
import { Game } from '../src/game/game.ts';
import { KITE_OBSTACLES, SURF_OBSTACLES, WING_OBSTACLES } from '../src/game/obstacles.ts';
import { SPORTS } from '../src/game/sport.ts';
import { Bot } from './helpers/bot.ts';

function run(g: Game, seconds: number, pressed = false, held = false): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) g.update(STEP, pressed, held);
}

/** Places an obstacle right in front of the player. */
function ahead(g: Game, name: string, y = 0): void {
  const table = g.sport === 'surf' ? SURF_OBSTACLES : g.sport === 'kite' ? KITE_OBSTACLES : WING_OBSTACLES;
  const o = g.obstacles.items[0];
  o.active = true;
  o.kind = table.find((k) => k.name === name)!;
  o.x = o.prevX = g.cfg.playerX + g.cfg.playerW + 4;
  o.y = y;
}

describe('game flow', () => {
  it('waits on the start screen until the first press', () => {
    const g = new Game('surf', 0);
    run(g, 1);
    expect(g.phase).toBe('ready');
    g.update(STEP, true, true);
    expect(g.phase).toBe('running');
    expect(g.athlete.state).toBe('ride');
    expect(g.speed).toBeCloseTo(SURF.startSpeed, 0);
  });

  it('distance raises the score and the speed grows over time', () => {
    const g = new Game('surf', 0);
    g.start(5);
    g.obstacles.reset(1e9);
    run(g, 10);
    expect(g.points).toBeGreaterThan(150);
    expect(g.speed).toBeGreaterThan(SURF.startSpeed);
    run(g, 200);
    expect(g.speed).toBe(SURF.maxSpeed);
  });

  it('hitting an obstacle ends the run and records the best score', () => {
    const onGameOver = vi.fn();
    const g = new Game('surf', 0, { onGameOver });
    g.start(1);
    g.obstacles.reset(1e9);
    run(g, 3);
    ahead(g, 'rock');
    run(g, 0.5);
    expect(g.phase).toBe('over');
    expect(g.newBest).toBe(true);
    expect(g.best).toBe(g.points);
    expect(onGameOver).toHaveBeenCalledWith(g.points, g.best);
  });

  it('restarts with one press, but not by accident right after a wipeout', () => {
    const g = new Game('surf', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    ahead(g, 'rock');
    run(g, 0.5);
    expect(g.phase).toBe('over');
    g.update(STEP, true, true);
    expect(g.phase).toBe('over');
    run(g, SURF.restartDelay);
    g.update(STEP, true, true);
    expect(g.phase).toBe('running');
    expect(g.points).toBe(0);
  });

  it('a lower score does not replace the best', () => {
    const g = new Game('surf', 5000);
    g.start(1);
    g.obstacles.reset(1e9);
    ahead(g, 'rock');
    run(g, 0.5);
    expect(g.best).toBe(5000);
    expect(g.newBest).toBe(false);
  });

  it('pauses, and the press that resumes does not jump', () => {
    const g = new Game('surf', 0);
    g.start(1);
    run(g, 1);
    g.pause();
    expect(g.phase).toBe('paused');
    const d = g.distance;
    run(g, 2);
    expect(g.distance).toBe(d);
    g.update(STEP, true, true);
    expect(g.phase).toBe('running');
    expect(g.athlete.state).toBe('ride');
  });

  it('the perfect wave makes the surfer invulnerable and doubles points', () => {
    const g = new Game('surf', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    g.perfectWave = SURF.perfectWaveTime;
    ahead(g, 'rock');
    const before = g.points;
    run(g, 1);
    expect(g.phase).toBe('running');
    expect(g.points - before).toBeGreaterThan(1.9 * g.speed * 0.1);
    run(g, SURF.perfectWaveTime - 1 + 0.1);
    expect(g.perfectWave).toBe(0);
    expect(g.invulnerable).toBe(true);
    run(g, SURF.powerGrace);
    expect(g.invulnerable).toBe(false);
  });

  it('an obstacle overlapping when the perfect wave ends is not an instant wipeout', () => {
    const g = new Game('surf', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    g.perfectWave = STEP;
    g.update(STEP, false, false);
    ahead(g, 'rock');
    g.obstacles.items[0].x = SURF.playerX;
    g.update(STEP, false, false);
    expect(g.phase).toBe('running');
  });

  it('a clean trick scores and shows its points', () => {
    const g = new Game('surf', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    g.update(STEP, true, true);
    run(g, 0.08, false, true);
    g.update(STEP, true, false);
    run(g, 1);
    expect(g.score.trickPoints).toBe(100);
    expect(g.score.combo).toBe(1);
  });
});

describe('kitesurf in the game', () => {
  it('a high gull hits the kite while riding', () => {
    const g = new Game('kite', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    const o = g.obstacles.items[0];
    o.active = true;
    o.kind = KITE_OBSTACLES.find((k) => k.name === 'gull' && k.minY >= 80)!;
    o.x = o.prevX = KITE.playerX + KITE.kiteX + 10;
    o.y = 86;
    g.update(STEP, false, false);
    expect(g.phase).toBe('over');
  });

  it('double spins score twice the trick points', () => {
    const g = new Game('kite', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    g.update(STEP, true, false);
    run(g, 0.05);
    g.update(STEP, true, true);
    run(g, KITE.spinTime * 1.6, false, true);
    run(g, 1.5);
    expect(g.phase).toBe('running');
    expect(g.score.trickPoints).toBe(200);
  });

  it('the wind gust launches a mega jump and protects until landing', () => {
    const g = new Game('kite', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    g.power.active = true;
    g.power.kind = 'gust';
    g.power.x = g.power.prevX = KITE.playerX;
    g.power.y = 10;
    g.update(STEP, false, false);
    expect(g.gustJump).toBe(true);
    let apex = 0;
    for (let i = 0; i < 200 && g.athlete.state === 'air'; i++) {
      g.update(STEP, false, false);
      apex = Math.max(apex, g.athlete.y);
    }
    expect(apex).toBeGreaterThan(100);
    expect(g.gustJump).toBe(false);
  });
});

describe('wing foil in the game', () => {
  it('flying too high breaches the foil', () => {
    const g = new Game('wing', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    run(g, 2, false, true);
    expect(g.phase).toBe('over');
  });

  it('dragging the board in the water slows the run down', () => {
    const g = new Game('wing', 0);
    g.start(1);
    g.obstacles.reset(1e9);
    run(g, 1.5);
    expect((g.athlete as WingAthlete).touching).toBe(true);
    expect(g.effectiveSpeed).toBeLessThan(g.speed * 0.7);
    expect(g.phase).toBe('running');
  });

  it('kelp catches a foil flying low but not one flying high', () => {
    const low = new Game('wing', 0);
    low.start(1);
    low.obstacles.reset(1e9);
    ahead(low, 'kelp', -32);
    run(low, 0.4);
    expect(low.phase).toBe('over');

    const high = new Game('wing', 0);
    high.start(1);
    high.obstacles.reset(1e9);
    (high.athlete as WingAthlete).y = 16;
    ahead(high, 'kelp', -32);
    for (let i = 0; i < 24; i++) {
      const a = high.athlete as WingAthlete;
      high.update(STEP, false, a.vy < 0 || a.y < 16);
    }
    expect(high.phase).toBe('running');
  });
});

describe('every generated run is playable', () => {
  for (const sport of SPORTS) {
    it.each([1, 2, 3, 42, 1234, 99991])(`${sport}, seed %i: a perfect player survives 150 s up to top speed`, (seed) => {
      const g = new Game(sport, 0, {}, { powerUps: false });
      const bot = new Bot();
      g.start(seed);
      let maxSpeed = 0;
      for (let i = 0; i < 150 / STEP && g.phase === 'running'; i++) {
        const [pressed, held] = bot.decide(g);
        g.update(STEP, pressed, held);
        maxSpeed = Math.max(maxSpeed, g.speed);
      }
      expect(g.phase, `${sport} wiped out at ${g.time.toFixed(1)}s, speed ${g.speed.toFixed(0)}`).toBe('running');
      expect(maxSpeed).toBe(g.cfg.maxSpeed);
    });
  }
});

void KiteAthlete;
void WING;
