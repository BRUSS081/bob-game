import { KITE, SURF, WING, type KiteConfig, type WingConfig } from './config.ts';
import type { SportId } from './sport.ts';
import { createSurfer, resetSurfer, updateSurfer, type SurferEvent } from './surfer.ts';

/** Obstacle layers: what each hitbox can be hit by. */
export const SURFACE = 1;
export const AIR = 2;
export const UNDER = 4;
export const HIGH = 8;

/** A hitbox in world space: x to the right, y is the altitude of its bottom edge. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  layers: number;
}

export type AthleteEvent = SurferEvent;
export type AthleteState = 'ride' | 'air' | 'crash';

export interface Athlete {
  readonly sport: SportId;
  readonly state: AthleteState;
  /** Altitude of the board's underside above the surface. */
  readonly y: number;
  readonly prevY: number;
  /** Trick rotation in turns (can pass 1 for multiple spins). */
  readonly rotation: number;
  readonly prevRotation: number;
  /** Full turns of the last clean trick. */
  readonly spins: number;
  /** Seconds since the last state change, for animation. */
  readonly stateTime: number;
  /** Multiplies the run speed (wing foil drags in the water). */
  readonly speedFactor: number;
  reset(): void;
  update(dt: number, pressed: boolean, held: boolean): AthleteEvent;
  /** Writes the hitboxes into `out` (preallocated) and returns how many. */
  boxes(playerX: number, out: Box[]): number;
  /** Forgives a botched landing (power-up active). */
  recover(): void;
  /** Ends the run. */
  crash(): void;
}

export function newBoxes(n = 6): Box[] {
  const out: Box[] = [];
  for (let i = 0; i < n; i++) out.push({ x: 0, y: 0, w: 0, h: 0, layers: 0 });
  return out;
}

function setBox(b: Box, x: number, y: number, w: number, h: number, layers: number): void {
  b.x = x;
  b.y = y;
  b.w = w;
  b.h = h;
  b.layers = layers;
}

// ------------------------------------------------------------------ surf

export class SurfAthlete implements Athlete {
  readonly sport = 'surf' as const;
  private readonly s = createSurfer();
  stateTime = 0;
  spins = 0;
  readonly speedFactor = 1;

  get state(): AthleteState {
    return this.s.state;
  }
  get y(): number {
    return this.s.y;
  }
  get prevY(): number {
    return this.s.prevY;
  }
  get rotation(): number {
    return this.s.rotation;
  }
  get prevRotation(): number {
    return this.s.prevRotation;
  }

  reset(): void {
    resetSurfer(this.s);
    this.stateTime = 0;
    this.spins = 0;
  }

  update(dt: number, pressed: boolean, held: boolean): AthleteEvent {
    const before = this.s.state;
    const ev = updateSurfer(this.s, dt, pressed, held, SURF);
    this.stateTime = before === this.s.state ? this.stateTime + dt : 0;
    if (ev === 'trick') this.spins = 1;
    return ev;
  }

  boxes(playerX: number, out: Box[]): number {
    const i = SURF.hitboxInset;
    setBox(out[0], playerX + i, this.s.y, SURF.playerW - 2 * i, SURF.playerH - i, SURFACE | AIR);
    return 1;
  }

  recover(): void {
    this.s.state = 'ride';
    this.stateTime = 0;
  }

  crash(): void {
    this.s.state = 'crash';
    this.stateTime = 0;
  }
}

// ------------------------------------------------------------------ kitesurf

type Spin = 'none' | 'held' | 'finishing';

export class KiteAthlete implements Athlete {
  readonly sport = 'kite' as const;
  state: AthleteState = 'ride';
  y = 0;
  prevY = 0;
  vy = 0;
  rotation = 0;
  prevRotation = 0;
  spins = 0;
  stateTime = 0;
  spin: Spin = 'none';
  readonly speedFactor = 1;
  private readonly cfg: KiteConfig;

  constructor(cfg: KiteConfig = KITE) {
    this.cfg = cfg;
  }

  reset(): void {
    this.state = 'ride';
    this.y = this.prevY = this.vy = 0;
    this.rotation = this.prevRotation = 0;
    this.spins = 0;
    this.stateTime = 0;
    this.spin = 'none';
  }

  /** Wind gust: a mega jump from the water, or a big lift if already flying. */
  gust(): void {
    if (this.state === 'crash') return;
    if (this.state === 'ride') {
      this.state = 'air';
      this.stateTime = 0;
      this.vy = this.cfg.gustVelocity;
    } else {
      this.vy = Math.max(this.vy, this.cfg.gustVelocity * 0.8);
    }
  }

  update(dt: number, pressed: boolean, held: boolean): AthleteEvent {
    const c = this.cfg;
    this.prevY = this.y;
    this.prevRotation = this.rotation;
    this.stateTime += dt;
    if (this.state === 'crash') return 'none';
    let ev: AthleteEvent = 'none';

    if (this.state === 'ride') {
      if (!pressed) return 'none';
      this.state = 'air';
      this.stateTime = 0;
      this.vy = c.jumpVelocity;
      this.rotation = this.prevRotation = 0;
      this.spin = 'none';
      ev = 'jump';
    } else if (pressed && this.spin !== 'held') {
      // a new press in the air spins; another press later adds more turns
      this.spin = 'held';
      ev = 'trickStart';
    }

    if (this.spin === 'held') {
      if (held) this.rotation += dt / c.spinTime;
      else this.spin = 'finishing';
    }
    if (this.spin === 'finishing') {
      const target = Math.ceil(this.rotation - 1e-6);
      this.rotation = Math.min(target, this.rotation + dt / c.spinTime);
      if (this.rotation >= target) this.spin = 'none';
    }

    this.vy -= c.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      const turns = Math.round(this.rotation);
      const off = Math.abs(this.rotation - turns);
      let landed: AthleteEvent;
      if (off > c.spinTolerance) landed = 'crash';
      else if (turns >= 1) landed = 'trick';
      else landed = 'land';
      this.spins = landed === 'trick' ? turns : 0;
      this.rotation = this.prevRotation = 0;
      this.spin = 'none';
      this.state = landed === 'crash' ? 'crash' : 'ride';
      this.stateTime = 0;
      ev = landed;
    }
    return ev;
  }

  boxes(playerX: number, out: Box[]): number {
    const c = this.cfg;
    const i = c.hitboxInset;
    setBox(out[0], playerX + i, this.y, c.playerW - 2 * i, c.playerH - i, SURFACE | AIR);
    setBox(out[1], playerX + c.kiteX, this.y + c.kiteY, c.kiteW, c.kiteH, HIGH);
    return 2;
  }

  recover(): void {
    this.state = 'ride';
    this.stateTime = 0;
  }

  crash(): void {
    this.state = 'crash';
    this.stateTime = 0;
  }
}

// ------------------------------------------------------------------ wing foil

export class WingAthlete implements Athlete {
  readonly sport = 'wing' as const;
  state: AthleteState = 'ride';
  y = 0;
  prevY = 0;
  vy = 0;
  readonly rotation = 0;
  readonly prevRotation = 0;
  readonly spins = 0;
  stateTime = 0;
  speedFactor = 1;
  /** The board is dragging in the water. */
  touching = false;
  /** Altitude above which the foil breaches; raised by the wind gust. */
  breachLimit: number;
  private readonly cfg: WingConfig;

  constructor(cfg: WingConfig = WING) {
    this.cfg = cfg;
    this.breachLimit = cfg.breach;
    this.reset();
  }

  reset(): void {
    this.state = 'ride';
    this.y = this.prevY = this.cfg.startAltitude;
    this.vy = 0;
    this.stateTime = 0;
    this.speedFactor = 1;
    this.touching = false;
    this.breachLimit = this.cfg.breach;
  }

  update(dt: number, _pressed: boolean, held: boolean): AthleteEvent {
    const c = this.cfg;
    this.prevY = this.y;
    this.stateTime += dt;
    if (this.state === 'crash') return 'none';
    this.vy += (held ? c.lift : -c.sink) * dt;
    this.vy = Math.max(-c.maxClimb, Math.min(c.maxClimb, this.vy));
    this.y += this.vy * dt;
    const wasTouching = this.touching;
    if (this.y <= 0) {
      this.y = 0;
      if (this.vy < 0) this.vy = 0;
      this.touching = true;
      this.speedFactor = c.dragFactor;
    } else {
      this.touching = false;
      this.speedFactor = Math.min(1, this.speedFactor + c.dragRecovery * dt);
    }
    if (this.touching !== wasTouching) this.stateTime = 0;
    if (this.y > this.breachLimit) {
      this.crash();
      return 'crash';
    }
    return 'none';
  }

  boxes(playerX: number, out: Box[]): number {
    const c = this.cfg;
    const i = c.hitboxInset;
    const y = this.y;
    // rider and wing above the board, the board itself, then mast and foil in the water
    setBox(out[0], playerX + i, y + 4, c.playerW - 2 * i, 40, SURFACE | AIR);
    setBox(out[1], playerX + 14, y + 18, 14, 24, AIR);
    setBox(out[2], playerX - 8, y, 32, 4, SURFACE);
    setBox(out[3], playerX + 9, y - c.mastLength, 2, c.mastLength, UNDER);
    setBox(out[4], playerX - 2, y - c.mastLength - 1, 20, 3, UNDER);
    return 5;
  }

  recover(): void {
    this.state = 'ride';
    this.y = Math.min(this.y, this.cfg.breach - 4);
    this.vy = 0;
    this.stateTime = 0;
  }

  crash(): void {
    this.state = 'crash';
    this.stateTime = 0;
  }
}

export function createAthlete(sport: SportId): Athlete {
  return sport === 'surf' ? new SurfAthlete() : sport === 'kite' ? new KiteAthlete() : new WingAthlete();
}
