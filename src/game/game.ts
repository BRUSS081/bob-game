import { Rng } from '../core/rng.ts';
import { AIR, KiteAthlete, SURFACE, WingAthlete, createAthlete, newBoxes, type Athlete } from './athletes.ts';
import { overlaps } from './collision.ts';
import { EARLY_BOOST, FLOW, KITE, SCORING, SPAWN_X, SURF, WING, type RunConfig } from './config.ts';
import { Dolphins } from './dolphins.ts';
import { Obstacles, obstaclesFor } from './obstacles.ts';
import { addBonus, addDistance, createScore, landPlain, landTrick, resetScore, total } from './score.ts';
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

export type PopupKind = 'trick' | 'close' | 'over' | 'dolphin';

/** A short "+points" label rising over the athlete. */
export interface Popup {
  active: boolean;
  kind: PopupKind;
  points: number;
  spins: number;
  /** Seconds left. */
  time: number;
}

export const POPUP_TIME = 0.9;
const POPUPS = 4;
/** Altitude above which a wing foiler counts as jumping with the dolphins. */
const WING_JUMP_ALTITUDE = 12;

/** What happened in a run, for missions and the wipeout screen. */
export interface RunStats {
  tricks: number;
  bestCombo: number;
  maxSpins: number;
  closeCalls: number;
  overs: number;
  powerUps: number;
  /** Highest wing foil flow reached, 0..1. */
  maxFlow: number;
  dolphins: number;
}

export function newStats(): RunStats {
  return { tricks: 0, bestCombo: 0, maxSpins: 0, closeCalls: 0, overs: 0, powerUps: 0, maxFlow: 0, dolphins: 0 };
}

function clearStats(s: RunStats): void {
  s.tricks = s.bestCombo = s.maxSpins = s.closeCalls = s.overs = s.powerUps = s.maxFlow = s.dolphins = 0;
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
  /** Wing foil flow meter, 0..1. */
  flow = 0;
  /** Seed of the current run (daily challenges replay the same one). */
  seed = 0;
  readonly popups: Popup[] = [];
  readonly stats: RunStats = newStats();
  readonly dolphins = new Dolphins();

  readonly obstacles: Obstacles;
  readonly power: PowerUp = { active: false, kind: 'wave', x: 0, prevX: 0, y: 0 };
  readonly score = createScore();

  private sincePower = 0;
  private readonly rng = new Rng(1);
  /** Separate stream for harmless events, so they never change the obstacles. */
  private readonly eventRng = new Rng(1);
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
    for (let i = 0; i < POPUPS; i++) this.popups.push({ active: false, kind: 'trick', points: 0, spins: 0, time: 0 });
  }

  /** Wing foil distance multiplier from the flow meter. */
  get flowFactor(): number {
    return 1 + (FLOW.maxFactor - 1) * this.flow;
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
    this.seed = seed;
    this.rng.seed(seed);
    this.eventRng.seed(seed ^ 0x5bd1e995);
    this.speed = this.effectiveSpeed = this.cfg.startSpeed;
    this.distance = this.prevDistance = 0;
    this.time = 0;
    this.newBest = false;
    this.perfectWave = 0;
    this.gustTime = 0;
    this.gustJump = false;
    this.grace = 0;
    this.flow = 0;
    this.sincePower = 0;
    for (let i = 0; i < this.popups.length; i++) this.popups[i].active = false;
    clearStats(this.stats);
    this.dolphins.reset(this.eventRng);
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
    const progress = (this.speed - cfg.startSpeed) / (cfg.maxSpeed - cfg.startSpeed);
    const accel = cfg.acceleration * (1 + EARLY_BOOST * (1 - 2 * Math.min(1, Math.max(0, progress))));
    this.speed = Math.min(cfg.maxSpeed, this.speed + accel * dt);
    this.tickPowers(dt);
    this.tickPopups(dt);

    let factor = a.speedFactor;
    if (this.gustTime > 0) factor *= WING.gustSpeed;
    this.effectiveSpeed = this.speed * factor;
    const dx = this.effectiveSpeed * dt;
    this.prevDistance = this.distance;
    this.distance += dx;
    const boosted = this.boosted;
    addDistance(this.score, dx, boosted, this.flowFactor);

    if (a instanceof WingAthlete) a.breachLimit = this.gustTime > 0 ? WING.gustBreach : WING.breach;
    switch (a.update(dt, pressed, held)) {
      case 'jump':
        this.events.onJump?.();
        break;
      case 'trick': {
        const st = this.stats;
        this.popup('trick', landTrick(this.score, boosted, a.spins), a.spins);
        st.tricks++;
        st.bestCombo = Math.max(st.bestCombo, this.score.combo);
        st.maxSpins = Math.max(st.maxSpins, a.spins);
        this.endGustJump();
        break;
      }
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

    if (a instanceof WingAthlete) this.tickFlow(a, dt);
    this.dolphins.update(dt, this.eventRng);

    const spawn = this.obstacles.update(dt, this.effectiveSpeed, SPAWN_X, cfg.playerX, this.rng, cfg);
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
    this.scorePasses(n);
    this.dolphinBonus(boosted);
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

  private popup(kind: PopupKind, points: number, spins = 0): void {
    // reuse a free slot, or the oldest one
    let slot = this.popups[0];
    for (let i = 0; i < this.popups.length; i++) {
      const q = this.popups[i];
      if (!q.active) {
        slot = q;
        break;
      }
      if (q.time < slot.time) slot = q;
    }
    slot.active = true;
    slot.kind = kind;
    slot.points = points;
    slot.spins = spins;
    slot.time = POPUP_TIME;
  }

  private tickPopups(dt: number): void {
    for (let i = 0; i < this.popups.length; i++) {
      const q = this.popups[i];
      if (!q.active) continue;
      q.time -= dt;
      if (q.time <= 0) q.active = false;
    }
  }

  private tickFlow(a: WingAthlete, dt: number): void {
    const inBand = a.state === 'ride' && !a.touching && a.y >= a.breachLimit - FLOW.band;
    this.flow = inBand ? Math.min(1, this.flow + FLOW.rise * dt) : Math.max(0, this.flow - FLOW.fall * dt);
    if (this.flow > this.stats.maxFlow) this.stats.maxFlow = this.flow;
  }

  /**
   * Near misses and rivals jumped: while an obstacle passes the athlete,
   * remember the smallest gap to the hitboxes it could hit; once it is
   * behind, score it. Surf and kite count only while in the air, so riding
   * under a gull is not a free bonus.
   */
  private scorePasses(n: number): void {
    const cfg = this.cfg;
    const a = this.athlete;
    const flying = a.state === 'air' || a.sport === 'wing';
    const inset = cfg.hitboxInset;
    const items = this.obstacles.items;
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (!o.active || o.passed) continue;
      const k = o.kind;
      const ox = o.x + inset;
      const ow = k.w - 2 * inset;
      const top = o.y + k.h - 1;
      if (flying) {
        for (let b = 0; b < n; b++) {
          const box = this.boxes[b];
          if ((box.layers & k.layer) === 0 || box.x >= ox + ow || box.x + box.w <= ox) continue;
          let gap = 0;
          if (box.y >= top) {
            gap = box.y - top;
            o.over = true;
          } else if (box.y + box.h <= o.y) {
            gap = o.y - (box.y + box.h);
          }
          if (gap < o.closest) o.closest = gap;
        }
      }
      if (o.x + k.w >= cfg.playerX) continue;
      o.passed = true;
      if (this.invulnerable) continue;
      if (k.bonus > 0 && o.over) {
        addBonus(this.score, k.bonus);
        this.popup('over', k.bonus);
        this.stats.overs++;
      }
      if (o.closest <= SCORING.nearMissDistance) {
        addBonus(this.score, SCORING.nearMissPoints);
        this.popup('close', SCORING.nearMissPoints);
        this.stats.closeCalls++;
      }
    }
  }

  /** Jumping while a dolphin jumps next to you, once per pod. */
  private dolphinBonus(boosted: boolean): void {
    const d = this.dolphins;
    if (!d.active || d.scored) return;
    const a = this.athlete;
    const jumping = a.state === 'air' || (a instanceof WingAthlete && a.y >= WING_JUMP_ALTITUDE);
    if (!jumping || !d.jumpingNear(70)) return;
    d.scored = true;
    const points = SCORING.dolphinPoints * (boosted ? SCORING.powerFactor : 1);
    addBonus(this.score, points);
    this.popup('dolphin', points);
    this.stats.dolphins++;
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
    this.stats.powerUps++;
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
