import { Rng } from '../core/rng.ts';
import { overlaps } from './collision.ts';
import { SURF } from './config.ts';
import { Obstacles } from './obstacles.ts';
import { addDistance, createScore, landPlain, landTrick, resetScore, total } from './score.ts';
import { createSurfer, resetSurfer, updateSurfer } from './surfer.ts';

export type Phase = 'ready' | 'running' | 'paused' | 'over';

export interface PowerUp {
  active: boolean;
  x: number;
  prevX: number;
  /** Altitude of the bottom edge above the surface. */
  y: number;
}

export interface GameEvents {
  onJump?(): void;
  onGameOver?(score: number, best: number): void;
}

/**
 * Surf run: phases, speed ramp, obstacles, power-up, scoring and wipeouts.
 * Knows nothing about the DOM or rendering; the view width only decides
 * where new obstacles appear.
 */
export class Game {
  phase: Phase = 'ready';
  speed = 0;
  distance = 0;
  prevDistance = 0;
  /** Seconds since the run started. */
  time = 0;
  /** Always-running clock for idle animations. */
  clock = 0;
  best: number;
  newBest = false;
  /** Seconds since the wipeout. */
  overTime = 0;
  /** Seconds left of the perfect wave power-up. */
  perfectWave = 0;
  /** Seconds of protection left after the perfect wave ended. */
  grace = 0;
  /** Last trick points, shown for a moment. */
  popupPoints = 0;
  popupTime = 0;

  readonly surfer = createSurfer();
  readonly obstacles = new Obstacles();
  readonly power: PowerUp = { active: false, x: 0, prevX: 0, y: 0 };
  readonly score = createScore();

  private viewWidth = 480;
  private sincePower = 0;
  private readonly rng = new Rng(1);
  private readonly events: GameEvents;

  constructor(best: number, events: GameEvents = {}) {
    this.best = best;
    this.events = events;
  }

  setViewWidth(width: number): void {
    this.viewWidth = width;
  }

  get points(): number {
    return total(this.score);
  }

  get invulnerable(): boolean {
    return this.perfectWave > 0 || this.grace > 0;
  }

  /** Pauses a running game (tab hidden or window blurred). */
  pause(): void {
    if (this.phase === 'running') this.phase = 'paused';
  }

  start(seed = (Math.random() * 0x7fffffff) | 0): void {
    this.phase = 'running';
    this.rng.seed(seed);
    this.speed = SURF.startSpeed;
    this.distance = this.prevDistance = 0;
    this.time = 0;
    this.newBest = false;
    this.perfectWave = 0;
    this.grace = 0;
    this.popupTime = 0;
    this.sincePower = 0;
    this.power.active = false;
    resetSurfer(this.surfer);
    resetScore(this.score);
    this.obstacles.reset(SURF.firstGap);
  }

  update(dt: number, pressed: boolean, held: boolean): void {
    switch (this.phase) {
      case 'ready':
        this.clock += dt;
        if (pressed) this.start();
        return;
      case 'paused':
        this.settle();
        if (pressed) this.phase = 'running';
        return;
      case 'over':
        this.clock += dt;
        this.overTime += dt;
        this.settle();
        if (pressed && this.overTime >= SURF.restartDelay) this.start();
        return;
      case 'running':
        this.clock += dt;
        this.step(dt, pressed, held);
    }
  }

  private step(dt: number, pressed: boolean, held: boolean): void {
    this.time += dt;
    this.speed = Math.min(SURF.maxSpeed, this.speed + SURF.acceleration * dt);
    const dx = this.speed * dt;
    this.prevDistance = this.distance;
    this.distance += dx;
    const boosted = this.perfectWave > 0;
    addDistance(this.score, dx, boosted);
    if (this.perfectWave > 0) {
      this.perfectWave -= dt;
      if (this.perfectWave <= 0) {
        this.perfectWave = 0;
        this.grace = SURF.powerGrace;
      }
    } else if (this.grace > 0) {
      this.grace = Math.max(0, this.grace - dt);
    }
    if (this.popupTime > 0) this.popupTime = Math.max(0, this.popupTime - dt);

    const s = this.surfer;
    switch (updateSurfer(s, dt, pressed, held, SURF)) {
      case 'jump':
        this.events.onJump?.();
        break;
      case 'trick':
        this.popupPoints = landTrick(this.score, boosted);
        this.popupTime = 0.9;
        break;
      case 'land':
        landPlain(this.score);
        break;
      case 'crash':
        if (boosted) {
          // the perfect wave forgives a botched trick, but the combo is lost
          s.state = 'ride';
          landPlain(this.score);
        } else {
          this.wipeout();
          return;
        }
        break;
    }

    const spawn = this.obstacles.update(dt, this.speed, this.viewWidth + 8, this.rng, SURF);
    this.updatePower(dt, dx, spawn.spawned, spawn.groupEnd, spawn.gap);

    const inset = SURF.hitboxInset;
    const px = SURF.playerX + inset;
    const pw = SURF.playerW - 2 * inset;
    const ph = SURF.playerH - inset;
    if (!this.invulnerable) {
      const items = this.obstacles.items;
      for (let i = 0; i < items.length; i++) {
        const o = items[i];
        if (!o.active) continue;
        if (overlaps(px, s.y, pw, ph, o.x + inset, 0, o.kind.w - 2 * inset, o.kind.h - 1)) {
          this.wipeout();
          return;
        }
      }
    }
    const p = this.power;
    if (p.active && overlaps(px, s.y, pw, ph, p.x, p.y, SURF.powerUpSize, SURF.powerUpSize)) {
      p.active = false;
      this.perfectWave = SURF.perfectWaveTime;
    }
  }

  private updatePower(dt: number, dx: number, spawned: boolean, groupEnd: number, gap: number): void {
    const p = this.power;
    this.sincePower += dt;
    if (p.active) {
      p.prevX = p.x;
      p.x -= dx;
      if (p.x + SURF.powerUpSize < -16) p.active = false;
    }
    if (
      spawned &&
      !p.active &&
      this.perfectWave === 0 &&
      this.sincePower >= SURF.powerUpMinInterval &&
      gap >= this.speed * 1.1 &&
      this.rng.next() < SURF.powerUpChance
    ) {
      p.active = true;
      p.x = p.prevX = groupEnd + gap * 0.5;
      p.y = 26 + Math.floor(this.rng.next() * 14);
      this.sincePower = 0;
    }
  }

  /** Freezes interpolation when nothing moves. */
  private settle(): void {
    const s = this.surfer;
    s.prevY = s.y;
    s.prevRotation = s.rotation;
    this.prevDistance = this.distance;
    const items = this.obstacles.items;
    for (let i = 0; i < items.length; i++) items[i].prevX = items[i].x;
    this.power.prevX = this.power.x;
  }

  private wipeout(): void {
    this.phase = 'over';
    this.overTime = 0;
    this.surfer.state = 'crash';
    this.settle();
    const final = this.points;
    if (final > this.best) {
      this.best = final;
      this.newBest = true;
    }
    this.events.onGameOver?.(final, this.best);
  }
}
