import { describe, expect, it, vi } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { SURF } from '../src/game/config.ts';
import { Game } from '../src/game/game.ts';
import { SURF_OBSTACLES } from '../src/game/obstacles.ts';
import { Bot } from './helpers/bot.ts';

function run(g: Game, seconds: number, pressed = false, held = false): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) g.update(STEP, pressed, held);
}

/** Places a rock right in front of the player. */
function rockAhead(g: Game): void {
  const o = g.obstacles.items[0];
  o.active = true;
  o.kind = SURF_OBSTACLES.find((k) => k.name === 'rock')!;
  o.x = o.prevX = SURF.playerX + SURF.playerW + 4;
}

describe('game flow', () => {
  it('waits on the start screen until the first press', () => {
    const g = new Game(0);
    run(g, 1);
    expect(g.phase).toBe('ready');
    g.update(STEP, true, true);
    expect(g.phase).toBe('running');
    expect(g.surfer.state).toBe('ride');
    expect(g.speed).toBeCloseTo(SURF.startSpeed, 0);
  });

  it('distance raises the score and the speed grows over time', () => {
    const g = new Game(0);
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
    const g = new Game(0, { onGameOver });
    g.start(1);
    g.obstacles.reset(1e9);
    run(g, 3);
    rockAhead(g);
    run(g, 0.5);
    expect(g.phase).toBe('over');
    expect(g.newBest).toBe(true);
    expect(g.best).toBe(g.points);
    expect(onGameOver).toHaveBeenCalledWith(g.points, g.best);
  });

  it('restarts with one press, but not by accident right after a wipeout', () => {
    const g = new Game(0);
    g.start(1);
    g.obstacles.reset(1e9);
    rockAhead(g);
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
    const g = new Game(5000);
    g.start(1);
    g.obstacles.reset(1e9);
    rockAhead(g);
    run(g, 0.5);
    expect(g.best).toBe(5000);
    expect(g.newBest).toBe(false);
  });

  it('pauses, and the press that resumes does not jump', () => {
    const g = new Game(0);
    g.start(1);
    run(g, 1);
    g.pause();
    expect(g.phase).toBe('paused');
    const d = g.distance;
    run(g, 2);
    expect(g.distance).toBe(d);
    g.update(STEP, true, true);
    expect(g.phase).toBe('running');
    expect(g.surfer.state).toBe('ride');
  });

  it('the perfect wave makes the surfer invulnerable and doubles points', () => {
    const g = new Game(0);
    g.start(1);
    g.obstacles.reset(1e9);
    g.perfectWave = SURF.perfectWaveTime;
    rockAhead(g);
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
    const g = new Game(0);
    g.start(1);
    g.obstacles.reset(1e9);
    g.perfectWave = STEP;
    g.update(STEP, false, false);
    rockAhead(g);
    g.obstacles.items[0].x = SURF.playerX;
    g.update(STEP, false, false);
    expect(g.phase).toBe('running');
  });

  it('a clean trick scores and shows its points', () => {
    const g = new Game(0);
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

describe('every generated run is playable', () => {
  it.each([1, 2, 3, 42, 1234, 99991])('seed %i: a perfect player survives 150 s up to top speed', (seed) => {
    const g = new Game(0);
    const bot = new Bot();
    g.start(seed);
    let maxSpeed = 0;
    for (let i = 0; i < 150 / STEP && g.phase === 'running'; i++) {
      const [pressed, held] = bot.decide(g);
      g.update(STEP, pressed, held);
      maxSpeed = Math.max(maxSpeed, g.speed);
    }
    expect(g.phase, `wiped out at ${g.time.toFixed(1)}s, speed ${g.speed.toFixed(0)}`).toBe('running');
    expect(maxSpeed).toBe(SURF.maxSpeed);
  });
});
