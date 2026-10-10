import { Rng } from '../core/rng.ts';
import { AIR, KiteAthlete, SURFACE, WingAthlete, createAthlete, newBoxes, type Athlete } from './athletes.ts';
import { overlaps } from './collision.ts';
import { KITE, SURF, WING, type RunConfig } from './config.ts';
import { Obstacles, obstaclesFor } from './obstacles.ts';
import { addDistance, createScore, landPlain, landTrick, resetScore, total } from './score.ts';
import type { SportId } from './sport.ts';

export type Phase = 'ready' | 'running' | 'paused' | 'over';
export type PowerKind = 'wave' | 'gust';

export interface PowerUp {
  active: boolean;
  kind: PowerKind;
  x: number;
  prevX: number;
  /** Altitude of the bottom edge above the surface. */
  y: number;
}

export interface GameEvents {
  onJump?(): void;
  onGameOver?(score: number, best: number): void;
}

export interface GameOptions {
  /** Power-ups on (default). Tests turn them off to check raw obstacle sequences. */
  powerUps?: boolean;
}

export function configFor(sport: SportId): RunConfig {
  return sport === 'surf' ? SURF : sport === 'kite' ? KITE : WING;
}

/** Where the power-up floats, per sport: high enough to need a jump (or a climb). */
const POWER_ALTITUDE: Record<SportId, readonly [number, number]> = {
  surf: [26, 40],
  kite: [30, 60],
  // the rider's head is about 44 px above the board: this asks for a climb near the breach limit
  wing: [58, 62],
};

/**
 * One run of one sport: phases, speed ramp, obstacles, power-ups, scoring
 * and wipeouts. Knows nothing about the DOM or rendering; the view width
 * only decides where new obstacles appear.
 */
export class Game {
  readonly sport: SportId;
  readonly cfg: RunConfig;
  readonly athlete: Athlete;
  phase: Phase = 'ready';
  /** Base speed of the run (before drag and boosts). */
  speed = 0;
  /** Speed things actually move at this step. */
  effectiveSpeed = 0;
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
  /** Seconds left of the perfect wave (double points, untouchable). */
  perfectWave = 0;
  /** Seconds left of the wing-foil wind gust. */
  gustTime = 0;
  /** Kitesurf wind-gust jump in progress (untouchable until landing). */
  gustJump = false;
  /** Seconds of protection after a power-up ended. */
  grace = 0;
  /** Last trick points and spins, shown for a moment. */
  popupPoints = 0;
  popupSpins = 0;
  popupTime = 0;

  readonly obstacles: Obstacles;
  readonly power: PowerUp = { active: false, kind: 'wave', x: 0, prevX: 0, y: 0 };
  readonly score = createScore();

  private viewWidth = 480;
  private sincePower = 0;
  private readonly rng = new Rng(1);
  private readonly events: GameEvents;
  private readonly boxes = newBoxes();
  private readonly powerUps: boolean;

  constructor(sport: SportId, best: number, events: GameEvents = {}, options: GameOptions = {}) {
    this.sport = sport;
    this.cfg = configFor(sport);
    this.athlete = createAthlete(sport);
    this.obstacles = new Obstacles(obstaclesFor(sport));
    this.best = best;
    this.events = events;
    this.powerUps = options.powerUps ?? true;
  }

  setViewWidth(width: number): void {
    this.viewWidth = width;
  }

  get points(): number {
    return total(this.score);
  }

  get boosted(): boolean {
    return this.perfectWave > 0;
  }

  get invulnerable(): boolean {
    return this.perfectWave > 0 || this.gustTime > 0 || this.gustJump || this.grace > 0;
  }

  /** Pauses a running game (tab hidden, window blurred, pause button). */
  pause(): void {
    if (this.phase === 'running') this.phase = 'paused';
  }

  resume(): void {
    if (this.phase === 'paused') this.phase = 'running';
  }

  start(seed = (Math.random() * 0x7fffffff) | 0): void {
    this.phase = 'running';
    this.rng.seed(seed);
    this.speed = this.effectiveSpeed = this.cfg.startSpeed;
    this.distance = this.prevDistance = 0;
    this.time = 0;
    this.newBest = false;
    this.perfectWave = 0;
    this.gustTime = 0;
    this.gustJump = false;
    this.grace = 0;
    this.popupTime = 0;
    this.sincePower = 0;
    this.power.active = false;
    this.athlete.reset();
    resetScore(this.score);
    this.obstacles.reset(this.cfg.firstGap, this.rng, this.speed);
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
        this.athlete.update(dt, false, false);
        this.settle();
        if (pressed && this.overTime >= this.cfg.restartDelay) this.start();
        return;
      case 'running':
        this.clock += dt;
        this.step(dt, pressed, held);
    }
  }

  private step(dt: number, pressed: boolean, held: boolean): void {
    const cfg = this.cfg;
    const a = this.athlete;
    this.time += dt;
    this.speed = Math.min(cfg.maxSpeed, this.speed + cfg.acceleration * dt);
    this.tickPowers(dt);

    let factor = a.speedFactor;
    if (this.gustTime > 0) factor *= WING.gustSpeed;
    this.effectiveSpeed = this.speed * factor;
    const dx = this.effectiveSpeed * dt;
    this.prevDistance = this.distance;
    this.distance += dx;
    const boosted = this.boosted;
    addDistance(this.score, dx, boosted);
    if (this.popupTime > 0) this.popupTime = Math.max(0, this.popupTime - dt);

    if (a instanceof WingAthlete) a.breachLimit = this.gustTime > 0 ? WING.gustBreach : WING.breach;
    switch (a.update(dt, pressed, held)) {
      case 'jump':
        this.events.onJump?.();
        break;
      case 'trick':
        this.popupSpins = a.spins;
        this.popupPoints = landTrick(this.score, boosted, a.spins);
        this.popupTime = 0.9;
        this.endGustJump();
        break;
      case 'land':
        landPlain(this.score);
        this.endGustJump();
        break;
      case 'crash':
        if (this.invulnerable) {
          // a power-up forgives a botched landing or a breach, but the combo is lost
          a.recover();
          landPlain(this.score);
          this.endGustJump();
        } else {
          this.wipeout();
          return;
        }
        break;
    }

    const spawn = this.obstacles.update(dt, this.effectiveSpeed, this.viewWidth + 8, cfg.playerX, this.rng, cfg);
    this.updatePower(dt, dx, spawn.spawned, spawn.groupEnd, spawn.gap);

    const n = a.boxes(cfg.playerX, this.boxes);
    if (!this.invulnerable) {
      const inset = cfg.hitboxInset;
      const items = this.obstacles.items;
      for (let i = 0; i < items.length; i++) {
        const o = items[i];
        if (!o.active) continue;
        const k = o.kind;
        for (let b = 0; b < n; b++) {
          const box = this.boxes[b];
          if ((box.layers & k.layer) === 0) continue;
          if (overlaps(box.x, box.y, box.w, box.h, o.x + inset, o.y, k.w - 2 * inset, k.h - 1)) {
            this.wipeout();
            return;
          }
        }
      }
    }
    const p = this.power;
    if (p.active) {
      for (let b = 0; b < n; b++) {
        const box = this.boxes[b];
        if ((box.layers & (SURFACE | AIR)) === 0) continue;
        if (overlaps(box.x, box.y, box.w, box.h, p.x, p.y, cfg.powerUpSize, cfg.powerUpSize)) {
          p.active = false;
          this.collect(p.kind);
          break;
        }
      }
    }
  }

  private tickPowers(dt: number): void {
    const was = this.perfectWave > 0 || this.gustTime > 0;
    if (this.perfectWave > 0) this.perfectWave = Math.max(0, this.perfectWave - dt);
    if (this.gustTime > 0) this.gustTime = Math.max(0, this.gustTime - dt);
    if (was && this.perfectWave === 0 && this.gustTime === 0) this.grace = this.cfg.powerGrace;
    else if (this.grace > 0) this.grace = Math.max(0, this.grace - dt);
  }

  private endGustJump(): void {
    if (!this.gustJump) return;
    this.gustJump = false;
    this.grace = this.cfg.powerGrace;
  }

  private collect(kind: PowerKind): void {
    if (kind === 'wave') {
      this.perfectWave = this.cfg.perfectWaveTime;
    } else if (this.athlete instanceof KiteAthlete) {
      this.athlete.gust();
      this.gustJump = true;
    } else {
      this.gustTime = WING.gustTime;
    }
  }

  private updatePower(dt: number, dx: number, spawned: boolean, groupEnd: number, gap: number): void {
    const p = this.power;
    this.sincePower += dt;
    if (p.active) {
      p.prevX = p.x;
      p.x -= dx;
      if (p.x + this.cfg.powerUpSize < -16) p.active = false;
    }
    if (
      this.powerUps &&
      spawned &&
      !p.active &&
      !this.invulnerable &&
      this.sincePower >= this.cfg.powerUpMinInterval &&
      gap >= this.effectiveSpeed * 1.1 &&
      this.rng.next() < this.cfg.powerUpChance
    ) {
      const [lo, hi] = POWER_ALTITUDE[this.sport];
      p.active = true;
      p.kind = this.sport === 'surf' ? 'wave' : this.sport === 'kite' ? 'gust' : this.rng.next() < 0.5 ? 'wave' : 'gust';
      p.x = p.prevX = groupEnd + gap * 0.5;
      p.y = lo + Math.floor(this.rng.next() * (hi - lo + 1));
      this.sincePower = 0;
    }
  }

  /** Freezes interpolation when nothing moves. */
  private settle(): void {
    this.prevDistance = this.distance;
    const items = this.obstacles.items;
    for (let i = 0; i < items.length; i++) items[i].prevX = items[i].x;
    this.power.prevX = this.power.x;
  }

  private wipeout(): void {
    this.phase = 'over';
    this.overTime = 0;
    this.athlete.crash();
    this.settle();
    const final = this.points;
    if (final > this.best) {
      this.best = final;
      this.newBest = true;
    }
    this.events.onGameOver?.(final, this.best);
  }
}
