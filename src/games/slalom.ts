import { Rng } from '../core/rng.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { SURFER_HEADINGS, TOP_SIZE, headingIndex } from '../sprites/topdown.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';

/** Tuning of the slalom. Pixels and seconds; y grows down the wave. */
export const SLALOM = {
  /** Width of the course; outside it the water is too deep to ride. */
  width: 300,
  /** Turning speed and the widest angle from straight down. */
  turn: 2.6,
  maxAngle: (70 * Math.PI) / 180,
  /** Speed straight down at the start, growing with the distance. */
  speed: 118,
  speedGain: 1 / 90,
  maxSpeed: 210,
  /** Share of the speed kept at the widest angle. */
  sideways: 0.5,
  /** A pump (Space) gives this much more speed for a moment, then rests. */
  pump: 1.35,
  pumpTime: 0.6,
  pumpRest: 2,
  /** Hitting something: speed kept, seconds without steering, seconds of safety. */
  bump: 0.35,
  stun: 0.55,
  safe: 1.2,
  /** The foam chases at this speed (growing), and never falls further behind than `leash`. */
  foam: 92,
  foamGain: 1 / 70,
  leash: 250,
  startGap: 130,
  /** Through a gate: points and a speed boost. Jumps over foam lips. */
  gatePoints: 25,
  gateBoost: 1.15,
  gateGap: 46,
  jump: 0.8,
  jumpPoints: 15,
  pxPerMeter: 10,
} as const;

export type ThingKind = 'buoy' | 'log' | 'jelly' | 'kelp' | 'gate' | 'ramp';

export interface Thing {
  active: boolean;
  kind: ThingKind;
  x: number;
  y: number;
  /** Half width (logs, kelp, gate gap, ramps). */
  half: number;
  /** Gates and ramps count once. */
  used: boolean;
}

export type SlalomEvent = 'gate' | 'jump' | 'bump' | 'caught' | null;
const POOL = 28;

/** The ride from above, without drawing: steer, pass gates, stay ahead of the foam. */
export class SlalomRun {
  x = 0;
  y = 0;
  angle = 0;
  speed: number = SLALOM.speed;
  foamY = 0;
  stun = 0;
  safe = 0;
  air = 0;
  pumpTime = 0;
  pumpRest = 0;
  gates = 0;
  jumps = 0;
  over = false;
  readonly things: Thing[] = [];
  private nextRow = 0;
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < POOL; i++) this.things.push({ active: false, kind: 'buoy', x: 0, y: 0, half: 0, used: false });
  }

  reset(seed: number): void {
    this.rng.seed(seed);
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.speed = SLALOM.speed;
    this.foamY = -SLALOM.startGap;
    this.stun = 0;
    this.safe = 0;
    this.air = 0;
    this.pumpTime = 0;
    this.pumpRest = 0;
    this.gates = 0;
    this.jumps = 0;
    this.over = false;
    for (const th of this.things) th.active = false;
    this.nextRow = 160;
  }

  get meters(): number {
    return Math.floor(this.y / SLALOM.pxPerMeter);
  }

  get score(): number {
    return this.meters + this.gates * SLALOM.gatePoints + this.jumps * SLALOM.jumpPoints;
  }

  /** How close the foam is, 0 far .. 1 on your tail. */
  get danger(): number {
    return Math.max(0, Math.min(1, 1 - (this.y - this.foamY) / SLALOM.leash));
  }

  /** `steer` is -1 (left), 0 or 1 (right); `pump` asks for a boost. */
  step(dt: number, steer: number, pump: boolean, ahead: number): SlalomEvent {
    if (this.over) return null;
    while (this.nextRow < this.y + ahead) this.row();
    this.stun = Math.max(0, this.stun - dt);
    this.safe = Math.max(0, this.safe - dt);
    this.air = Math.max(0, this.air - dt);
    this.pumpTime = Math.max(0, this.pumpTime - dt);
    this.pumpRest = Math.max(0, this.pumpRest - dt);
    if (pump && this.pumpRest <= 0) {
      this.pumpTime = SLALOM.pumpTime;
      this.pumpRest = SLALOM.pumpRest;
    }
    if (this.stun <= 0) this.angle = Math.max(-SLALOM.maxAngle, Math.min(SLALOM.maxAngle, this.angle + steer * SLALOM.turn * dt));
    const top = Math.min(SLALOM.maxSpeed, SLALOM.speed * (1 + this.y * SLALOM.speedGain * 0.01));
    const want = top * (SLALOM.sideways + (1 - SLALOM.sideways) * Math.cos(this.angle)) * (this.pumpTime > 0 ? SLALOM.pump : 1);
    this.speed += (want - this.speed) * Math.min(1, (this.stun > 0 ? 0.5 : 2) * dt);
    this.x += Math.sin(this.angle) * this.speed * dt;
    this.y += Math.cos(this.angle) * this.speed * dt;
    const edge = SLALOM.width / 2 - 8;
    if (Math.abs(this.x) > edge) {
      this.x = Math.sign(this.x) * edge;
      this.speed *= 1 - dt;
    }
    // the foam rolls down behind
    this.foamY += SLALOM.foam * (1 + this.y * SLALOM.foamGain * 0.01) * dt;
    this.foamY = Math.max(this.foamY, this.y - SLALOM.leash);
    if (this.foamY >= this.y - 6) {
      this.over = true;
      return 'caught';
    }
    return this.touch();
  }

  private touch(): SlalomEvent {
    for (const th of this.things) {
      if (!th.active) continue;
      if (th.y < this.y - 300) {
        th.active = false;
        continue;
      }
      const dy = this.y - th.y;
      const dx = this.x - th.x;
      switch (th.kind) {
        case 'gate':
          if (!th.used && dy >= 0 && dy < 8) {
            th.used = true;
            if (Math.abs(dx) < th.half) {
              this.gates++;
              this.speed *= SLALOM.gateBoost;
              return 'gate';
            }
          }
          break;
        case 'ramp':
          if (!th.used && Math.abs(dy) < 5 && Math.abs(dx) < th.half) {
            th.used = true;
            this.air = SLALOM.jump;
            this.jumps++;
            return 'jump';
          }
          break;
        case 'kelp':
          // kelp only slows you down
          if (this.air <= 0 && Math.abs(dy) < 10 && Math.abs(dx) < th.half) this.speed *= 0.985;
          break;
        default: {
          if (this.air > 0 || this.safe > 0) break;
          const hx = th.kind === 'log' ? th.half : th.kind === 'jelly' ? 11 : 5;
          const hy = th.kind === 'log' ? 4 : th.kind === 'jelly' ? 9 : 5;
          if (Math.abs(dx) < hx + 3 && Math.abs(dy) < hy + 5) {
            this.speed *= SLALOM.bump;
            this.stun = SLALOM.stun;
            this.safe = SLALOM.safe;
            return 'bump';
          }
        }
      }
    }
    return null;
  }

  private add(kind: ThingKind, x: number, y: number, half: number): void {
    for (const th of this.things) {
      if (th.active) continue;
      th.active = true;
      th.kind = kind;
      th.x = x;
      th.y = y;
      th.half = half;
      th.used = false;
      return;
    }
  }

  /** A new row down the course: a gate, a few buoys, a log, jellyfish, kelp or a foam lip. */
  private row(): void {
    const y = this.nextRow;
    const w = SLALOM.width / 2 - 24;
    const roll = this.rng.next();
    const x = this.rng.range(-w, w);
    if (roll < 0.3) {
      this.add('gate', x, y, SLALOM.gateGap / 2);
    } else if (roll < 0.52) {
      const n = 2 + Math.floor(this.rng.next() * 2);
      for (let i = 0; i < n; i++) this.add('buoy', Math.max(-w, Math.min(w, x + (i - n / 2) * 34)), y + this.rng.range(-8, 8), 5);
    } else if (roll < 0.66) {
      this.add('log', x, y, this.rng.range(16, 30));
    } else if (roll < 0.78) {
      this.add('jelly', x, y, 11);
    } else if (roll < 0.9) {
      this.add('kelp', x, y, this.rng.range(20, 34));
    } else {
      this.add('ramp', x, y, 16);
    }
    this.nextRow += this.rng.range(58, 100);
  }
}

// ------------------------------------------------------------------ screen

const TRAIL = 24;

export class SlalomScreen extends MiniGame {
  readonly id = 'slalom' as const;

  protected get outdoors(): boolean {
    return false;
  }
  private readonly run = new SlalomRun();
  private readonly rng = new Rng(Date.now() >>> 0);
  private prevX = 0;
  private prevY = 0;
  private readonly trailX = new Float32Array(TRAIL);
  private readonly trailY = new Float32Array(TRAIL);
  private trailHead = 0;
  private trailTime = 0;

  constructor(ctx: Context) {
    super(ctx);
  }

  protected reset(): void {
    this.run.reset((this.rng.next() * 0xffffffff) >>> 0);
    this.prevX = 0;
    this.prevY = 0;
    this.trailX.fill(0);
    this.trailY.fill(-1000);
  }

  /** Steering: arrows or A/D, or holding on the left or right half of the screen. */
  private steer(): number {
    const input = this.ctx.input;
    let s = (input.rightHeld ? 1 : 0) - (input.leftHeld ? 1 : 0);
    if (s === 0 && input.pointerHeld) s = this.ctx.pointer().x < this.ctx.r.W / 2 ? -1 : 1;
    return s;
  }

  protected step(dt: number, pressed: boolean): void {
    const run = this.run;
    this.prevX = run.x;
    this.prevY = run.y;
    // a tap steers on touch screens; only the key pumps
    const pump = pressed && !this.ctx.input.pointerHeld;
    const event = run.step(dt, this.steer(), pump, this.ctx.r.H);
    this.score = run.score;
    this.trailTime += dt;
    if (this.trailTime > 0.04) {
      this.trailTime = 0;
      this.trailHead = (this.trailHead + 1) % TRAIL;
      this.trailX[this.trailHead] = run.x;
      this.trailY[this.trailHead] = run.y;
    }
    const sx = this.originX + Math.round(run.x);
    const sy = this.surferY - 20;
    const words = t.gameText.slalom;
    if (event === 'gate') this.popup(`+${SLALOM.gatePoints}`, sx, sy, C.gold);
    else if (event === 'jump') this.popup(words.jump, sx, sy, C.white);
    else if (event === 'bump') this.popup(words.bump, sx, sy, C.coral);
    else if (event === 'caught') {
      this.overLines.push({ text: `${run.meters} M`, color: C.white });
      this.overLines.push({ text: `${words.gates} ${run.gates}`, color: C.gold });
      this.finish(words.caught);
    }
  }

  private get originX(): number {
    return Math.round(this.ctx.r.W / 2);
  }

  /** The surfer sits in the upper part of the screen, to see what comes. */
  private get surferY(): number {
    return Math.round(this.ctx.r.H * 0.3);
  }

  protected draw(alpha: number): void {
    const r = this.ctx.r;
    const run = this.run;
    const y = this.prevY + (run.y - this.prevY) * alpha;
    const x = this.prevX + (run.x - this.prevX) * alpha;
    const cam = y - this.surferY;
    const ox = this.originX;
    this.water(cam, ox);
    for (const th of run.things) {
      if (!th.active) continue;
      const sy = Math.round(th.y - cam);
      if (sy < -30 || sy > r.H + 30) continue;
      this.thing(th, ox + Math.round(th.x), sy);
    }
    // the wake
    for (let i = 0; i < TRAIL; i++) {
      const ty = Math.round(this.trailY[i] - cam);
      if (ty < -4 || ty > r.H) continue;
      const age = (this.trailHead - i + TRAIL) % TRAIL;
      if (age % 2 === 1) continue;
      r.fill(age < 8 ? C.white : C.foamShadow, ox + Math.round(this.trailX[i]) - 1, ty, age < 6 ? 2 : 1, 1);
    }
    // the surfer, with a shadow when jumping
    const frames = this.ctx.actor('top');
    const f = frames[headingIndex(Math.PI - run.angle, SURFER_HEADINGS)];
    const lift = run.air > 0 ? Math.round(Math.sin((1 - run.air / SLALOM.jump) * Math.PI) * 8) : 0;
    const blink = run.safe > 0 && Math.floor(this.clock * 12) % 2 === 0;
    if (lift > 0) r.fill(C.teal, ox + Math.round(x) - 5, this.surferY + 2, 10, 4);
    if (!blink) r.ctx.drawImage(f, ox + Math.round(x) - TOP_SIZE / 2, this.surferY - TOP_SIZE / 2 - lift);
    this.foam(run.foamY - cam);
  }

  /** The sea from above: the course in turquoise, deep water outside, wave lines moving with it. */
  private water(cam: number, ox: number): void {
    const r = this.ctx.r;
    const half = SLALOM.width / 2;
    r.fill(C.deep, 0, 0, r.W, r.H);
    r.fill(C.sea, ox - half, 0, SLALOM.width, r.H);
    for (let k = Math.floor(cam / 22) - 1; k < Math.floor((cam + r.H) / 22) + 1; k++) {
      const sy = Math.round(k * 22 - cam);
      for (let i = 0; i < 9; i++) {
        const sx = ox - half + ((i * 37 + k * 13) % SLALOM.width);
        r.fill(C.turquoise, sx, sy, 10 + ((i + k) % 3) * 4, 1);
      }
      if (k % 2 === 0) {
        // floats along the edges of the course
        r.fill(C.orange, ox - half - 2, sy, 3, 3);
        r.fill(C.orange, ox + half - 1, sy, 3, 3);
      }
    }
  }

  private thing(th: Thing, x: number, y: number): void {
    const r = this.ctx.r;
    switch (th.kind) {
      case 'buoy':
        r.fill(C.ink, x - 5, y - 5, 11, 11);
        r.fill(C.red, x - 4, y - 4, 9, 9);
        r.fill(C.white, x - 4, y - 1, 9, 3);
        r.fill(C.coral, x - 2, y - 3, 2, 1);
        break;
      case 'log':
        r.fill(C.ink, x - th.half - 1, y - 4, th.half * 2 + 2, 9);
        r.fill(C.brown, x - th.half, y - 3, th.half * 2, 7);
        r.fill(C.tan, x - th.half, y - 3, th.half * 2, 1);
        r.fill(C.tan, x - th.half + 1, y - 2, 2, 5);
        r.fill(C.tan, x + th.half - 3, y - 2, 2, 5);
        break;
      case 'jelly':
        for (let i = 0; i < 4; i++) {
          const jx = x - 8 + (i % 2) * 10 + (i > 1 ? 4 : 0);
          const jy = y - 6 + (i > 1 ? 8 : 0);
          r.fill(C.mauve, jx, jy, 6, 5);
          r.fill(C.rose, jx + 1, jy + 1, 3, 2);
        }
        break;
      case 'kelp':
        for (let i = -th.half; i < th.half; i += 4) {
          r.fill(C.forest, x + i, y - 6 + ((i * 7) & 7), 3, 2);
          r.fill(C.green, x + i + 1, y - 2 + ((i * 3) & 5), 2, 2);
        }
        break;
      case 'gate': {
        // a dashed line on the water between two flag buoys
        if (!th.used) for (let i = -th.half + 4; i < th.half - 3; i += 6) r.fill(C.white, x + i, y, 3, 1);
        for (const side of GATE_SIDES) {
          const gx = x + side * th.half;
          const flag = th.used ? C.slate : side < 0 ? C.red : C.blue;
          r.fill(C.ink, gx - 3, y - 3, 7, 7);
          r.fill(flag, gx - 2, y - 2, 5, 5);
          r.fill(C.white, gx - 2, y - 2, 2, 1);
          r.fill(C.ink, gx - 1, y - 14, 3, 12);
          r.fill(C.white, gx, y - 13, 1, 11);
          r.fill(C.ink, gx + 1, y - 15, 8, 6);
          r.fill(th.used ? C.grey : C.gold, gx + 1, y - 14, 7, 4);
        }
        break;
      }
      case 'ramp':
        // a foam lip to jump from
        for (let i = -th.half; i <= th.half; i++) {
          const h = Math.round(Math.cos((i / th.half) * 1.4) * 3);
          r.fill(C.white, x + i, y - h, 1, 2);
          r.fill(C.aqua, x + i, y - h + 2, 1, 2);
        }
        break;
    }
  }

  /** The wall of whitewater coming down the wave. */
  private foam(edge: number): void {
    const r = this.ctx.r;
    const e = Math.round(edge);
    if (e < -10) return;
    r.fill(C.white, 0, 0, r.W, Math.max(0, e - 6));
    for (let x = 0; x < r.W; x += 3) {
      const wob = Math.round(Math.sin(x * 0.21 + this.clock * 5) * 3 + Math.sin(x * 0.07 - this.clock * 3) * 3);
      r.fill(C.white, x, e - 8, 3, 8 + wob);
      r.fill(C.foamShadow, x, e + wob, 3, 2);
      if ((x + Math.floor(this.clock * 20)) % 9 === 0) r.fill(C.white, x, e + wob + 4, 1, 1);
    }
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const run = this.run;
    if (this.time < 4) r.centered(r.touch ? t.gameText.slalom.touchHint : t.gameText.slalom.keyHint, r.W / 2, r.H - (GLYPH_H + 10) * u, C.navy, u);
    if (run.danger > 0.7 && Math.floor(this.clock * 6) % 2 === 0) r.centered(t.gameText.slalom.foam, r.W / 2, 6 + (GLYPH_H + 6) * u, C.coral, u);
  }
}

const GATE_SIDES = [-1, 1] as const;
