import type { SurfConfig } from './config.ts';

export type SurferState = 'ride' | 'air' | 'crash';

/** What happened during one update. */
export type SurferEvent = 'none' | 'jump' | 'trickStart' | 'land' | 'trick' | 'crash';

export interface Surfer {
  state: SurferState;
  /** Altitude of the board above the sea surface, ≥ 0. */
  y: number;
  prevY: number;
  /** Vertical speed, upward positive. */
  vy: number;
  /** The jump is still being extended by holding the button. */
  extending: boolean;
  holdTime: number;
  /** A rotation is in progress. */
  tricking: boolean;
  trickTime: number;
  /** A full rotation was completed during this jump. */
  trickDone: boolean;
  /** Rotation progress 0..1 (for rendering). */
  rotation: number;
  prevRotation: number;
}

export function createSurfer(): Surfer {
  return {
    state: 'ride',
    y: 0,
    prevY: 0,
    vy: 0,
    extending: false,
    holdTime: 0,
    tricking: false,
    trickTime: 0,
    trickDone: false,
    rotation: 0,
    prevRotation: 0,
  };
}

export function resetSurfer(s: Surfer): void {
  s.state = 'ride';
  s.y = s.prevY = s.vy = 0;
  s.extending = false;
  s.holdTime = 0;
  s.tricking = false;
  s.trickTime = 0;
  s.trickDone = false;
  s.rotation = s.prevRotation = 0;
}

/**
 * One fixed step of surf movement.
 * Tap: low, quick jump; holding extends it up to a maximum.
 * Second tap in the air: one full rotation. Landing mid-rotation is a crash.
 */
export function updateSurfer(s: Surfer, dt: number, pressed: boolean, held: boolean, cfg: SurfConfig): SurferEvent {
  s.prevY = s.y;
  s.prevRotation = s.rotation;
  let event: SurferEvent = 'none';

  if (s.state === 'crash') return event;

  if (s.state === 'ride') {
    if (!pressed) return event;
    s.state = 'air';
    s.vy = cfg.jumpVelocity;
    s.extending = true;
    s.holdTime = 0;
    s.tricking = false;
    s.trickTime = 0;
    s.trickDone = false;
    event = 'jump';
  } else if (pressed && !s.tricking && !s.trickDone) {
    s.tricking = true;
    s.trickTime = 0;
    event = 'trickStart';
  }

  if (s.extending) {
    if (held && s.holdTime < cfg.maxHoldTime && s.vy > 0) s.holdTime += dt;
    else s.extending = false;
  }
  s.vy -= (s.extending ? cfg.holdGravity : cfg.gravity) * dt;
  s.y += s.vy * dt;

  if (s.tricking) {
    s.trickTime += dt;
    s.rotation = Math.min(1, s.trickTime / cfg.trickDuration);
    if (s.trickTime >= cfg.trickDuration) {
      s.tricking = false;
      s.trickDone = true;
      s.rotation = s.prevRotation = 0;
    }
  }

  if (s.y <= 0) {
    s.y = 0;
    s.vy = 0;
    s.extending = false;
    let landed: SurferEvent;
    if (s.tricking) landed = 1 - s.rotation <= cfg.trickTolerance ? 'trick' : 'crash';
    else landed = s.trickDone ? 'trick' : 'land';
    s.tricking = false;
    s.trickDone = false;
    s.rotation = s.prevRotation = 0;
    s.state = landed === 'crash' ? 'crash' : 'ride';
    event = landed;
  }
  return event;
}
