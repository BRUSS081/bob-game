import { Rng } from '../core/rng.ts';
import type { AthleteConfig } from '../custom/athlete.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { BOAT_HEADINGS, TOP_SIZE, headingIndex } from '../sprites/topdown.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame, rivalLooks } from './kit.ts';

/**
 * Tuning of the regatta. Pixels and seconds. Angles are clockwise from
 * north (screen up); the wind angle is where it comes from.
 */
export const REGATTA = {
  /** The windward mark is this far up from the start. */
  course: 1000,
  /** The finish line is just below the start, this wide. */
  finishY: 60,
  finishHalf: 70,
  /** Round the mark within this distance. */
  round: 36,
  /** Angle to the wind sailing upwind, and off dead downwind on the run. */
  closeHauled: Math.PI / 4,
  running: Math.PI / 6,
  /** Boat speed upwind and downwind, before puffs. */
  upwind: 46,
  downwind: 56,
  /** A tack or a gybe takes this long and slows the boat to this share. */
  tackTime: 0.9,
  tackSlow: 0.4,
  /** Wind shifts (radians) and puffs (strength inside a puff). */
  shift: [0.26, 0.14] as const,
  puff: 1.28,
  puffs: 6,
  /** Boats tack by themselves at the course boundary. */
  boundary: 560,
  maxTime: 180,
  rivals: [0.93, 0.96, 0.99] as const,
} as const;

export type Leg = 'up' | 'down' | 'done';

export interface Boat {
  x: number;
  y: number;
  /** +1 starboard tack (wind from the right), -1 port tack. */
  tack: number;
  heading: number;
  speed: number;
  leg: Leg;
  /** Seconds left of a tack or gybe in progress. */
  turning: number;
  finish: number;
  /** Rivals: speed factor and seconds until they may tack again. */
  skill: number;
  wait: number;
}

export interface Puff {
  x: number;
  y: number;
  r: number;
}

/** Smallest signed difference between two angles. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Compass bearing from (x, y) to (tx, ty), clockwise from north. */
export function bearing(x: number, y: number, tx: number, ty: number): number {
  return Math.atan2(tx - x, -(ty - y));
}

/** The race without drawing: the wind, the puffs, the player's boat and three rivals. */
export class Race {
  time = 0;
  wind = 0;
  readonly player: Boat = newBoat(1);
  readonly rivals: Boat[] = [];
  readonly puffs: Puff[] = [];
  readonly markY: number = -REGATTA.course;
  private p1 = 0;
  private p2 = 0;
  private readonly rng = new Rng(1);

  constructor() {
    for (const s of REGATTA.rivals) this.rivals.push(newBoat(s));
    for (let i = 0; i < REGATTA.puffs; i++) this.puffs.push({ x: 0, y: 0, r: 0 });
  }

  reset(seed: number): void {
    this.rng.seed(seed);
    this.time = 0;
    this.p1 = this.rng.next() * Math.PI * 2;
    this.p2 = this.rng.next() * Math.PI * 2;
    this.wind = this.windAt(0);
    startBoat(this.player, 0, 1, 1);
    for (let i = 0; i < this.rivals.length; i++) {
      const b = this.rivals[i];
      startBoat(b, (i - 1) * 40 - 60, i % 2 === 0 ? -1 : 1, REGATTA.rivals[i]);
      b.wait = this.rng.range(1, 4);
    }
    for (const p of this.puffs) this.placePuff(p, true);
  }

  windAt(time: number): number {
    return REGATTA.shift[0] * Math.sin(time * 0.21 + this.p1) + REGATTA.shift[1] * Math.sin(time * 0.53 + this.p2);
  }

  get over(): boolean {
    return this.player.leg === 'done' || this.time >= REGATTA.maxTime;
  }

  /** 1 to 4: boats finished before you, or further along when you finish. */
  get place(): number {
    let p = 1;
    for (const b of this.rivals) if (ahead(b, this.player, this.markY)) p++;
    return p;
  }

  /** Where a boat should head next: the mark, then the middle of the finish line. */
  target(b: Boat): number {
    return b.leg === 'up' ? bearing(b.x, b.y, 0, this.markY) : bearing(b.x, b.y, 0, REGATTA.finishY + 20);
  }

  /** The heading a boat sails on a tack (upwind) or a gybe (downwind). */
  headingFor(b: Boat, tack: number): number {
    return b.leg === 'up' ? this.wind + tack * REGATTA.closeHauled : this.wind + Math.PI - tack * REGATTA.running;
  }

  step(dt: number, pressed: boolean): boolean {
    if (this.over) return false;
    this.time += dt;
    this.wind = this.windAt(this.time);
    for (const p of this.puffs) {
      // puffs ride the wind down the course
      p.x -= Math.sin(this.wind) * 16 * dt;
      p.y += Math.cos(this.wind) * 16 * dt;
      if (p.y > this.player.y + 500) this.placePuff(p, false);
    }
    let tacked = false;
    if (pressed && this.player.turning <= 0) {
      this.turn(this.player);
      tacked = true;
    }
    this.sail(this.player, dt);
    for (const b of this.rivals) {
      if (b.leg !== 'done') this.think(b, dt);
      this.sail(b, dt);
    }
    return tacked;
  }

  turn(b: Boat): void {
    b.tack = -b.tack;
    b.turning = REGATTA.tackTime;
  }

  private think(b: Boat, dt: number): void {
    b.wait -= dt;
    if (b.turning > 0) return;
    const want = this.target(b);
    const now = Math.abs(angleDiff(this.headingFor(b, b.tack), want));
    const other = Math.abs(angleDiff(this.headingFor(b, -b.tack), want));
    if (b.wait <= 0 && other + 0.14 < now) {
      this.turn(b);
      b.wait = this.rng.range(2.5, 5);
    }
  }

  private sail(b: Boat, dt: number): void {
    if (b.leg === 'done') return;
    // the course boundary makes everyone come back
    if (b.turning <= 0 && Math.abs(b.x) > REGATTA.boundary && Math.sign(Math.sin(this.headingFor(b, b.tack))) === Math.sign(b.x)) this.turn(b);
    const goal = this.headingFor(b, b.tack);
    let speed = (b.leg === 'up' ? REGATTA.upwind : REGATTA.downwind) * b.skill * this.strength(b.x, b.y);
    if (b.turning > 0) {
      // swinging through the wind: slow, the heading turning
      b.turning = Math.max(0, b.turning - dt);
      speed *= REGATTA.tackSlow;
      b.heading += angleDiff(goal, b.heading) * Math.min(1, 4 * dt);
    } else {
      b.heading = goal;
    }
    b.speed += (speed - b.speed) * Math.min(1, 1.5 * dt);
    b.x += Math.sin(b.heading) * b.speed * dt;
    b.y -= Math.cos(b.heading) * b.speed * dt;
    if (b.leg === 'up' && b.y < this.markY && Math.hypot(b.x, b.y - this.markY) < REGATTA.round) {
      b.leg = 'down';
      // bear away onto the run, on the gybe that points at the finish
      const left = Math.abs(angleDiff(this.headingFor(b, 1), this.target(b)));
      const right = Math.abs(angleDiff(this.headingFor(b, -1), this.target(b)));
      b.tack = left < right ? 1 : -1;
      b.turning = REGATTA.tackTime;
    } else if (b.leg === 'down' && b.y >= REGATTA.finishY && Math.abs(b.x) <= REGATTA.finishHalf) {
      b.leg = 'done';
      b.finish = this.time;
    }
  }

  /** Wind strength at a place: 1, more inside a puff. */
  strength(x: number, y: number): number {
    for (const p of this.puffs) if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < p.r * p.r) return REGATTA.puff;
    return 1;
  }

  private placePuff(p: Puff, anywhere: boolean): void {
    p.r = this.rng.range(40, 75);
    p.x = this.rng.range(-REGATTA.boundary, REGATTA.boundary);
    p.y = anywhere ? this.rng.range(this.markY - 200, 200) : this.player.y - this.rng.range(400, 700);
  }
}

function newBoat(skill: number): Boat {
  return { x: 0, y: 0, tack: 1, heading: 0, speed: 0, leg: 'up', turning: 0, finish: 0, skill, wait: 0 };
}

function startBoat(b: Boat, x: number, tack: number, skill: number): void {
  b.x = x;
  b.y = 0;
  b.tack = tack;
  b.heading = 0;
  b.speed = REGATTA.upwind * 0.6;
  b.leg = 'up';
  b.turning = 0;
  b.finish = 0;
  b.skill = skill;
}

/** Is boat a further along the course than boat b? */
function ahead(a: Boat, b: Boat, markY: number): boolean {
  if (a.leg === 'done' && b.leg === 'done') return a.finish < b.finish;
  if (a.leg !== b.leg) return a.leg === 'done' || (a.leg === 'down' && b.leg === 'up');
  // same leg: closer to where it is going
  return a.leg === 'up' ? Math.hypot(a.x, a.y - markY) < Math.hypot(b.x, b.y - markY) : Math.hypot(a.x, a.y - REGATTA.finishY) < Math.hypot(b.x, b.y - REGATTA.finishY);
}

// ------------------------------------------------------------------ screen

export class RegattaScreen extends MiniGame {
  readonly id = 'regatta' as const;

  protected get outdoors(): boolean {
    return false;
  }
  private readonly race = new Race();
  private readonly rng = new Rng(Date.now() >>> 0);
  private looks: AthleteConfig[] = [];
  private prevX = 0;
  private prevY = 0;
  private roundedShown = false;

  constructor(ctx: Context) {
    super(ctx);
  }

  protected reset(): void {
    this.race.reset((this.rng.next() * 0xffffffff) >>> 0);
    this.looks = rivalLooks(3, this.rng);
    this.prevX = this.race.player.x;
    this.prevY = this.race.player.y;
    this.roundedShown = false;
  }

  protected step(dt: number, pressed: boolean): void {
    const race = this.race;
    const p = race.player;
    this.prevX = p.x;
    this.prevY = p.y;
    const turned = race.step(dt, pressed);
    this.score = race.time;
    const words = t.gameText.regatta;
    const r = this.ctx.r;
    if (turned) this.popup(p.leg === 'up' ? words.tack : words.gybe, r.W / 2, this.boatY - 24, C.white);
    if (p.leg === 'down' && !this.roundedShown) {
      this.roundedShown = true;
      this.popup(words.rounded, r.W / 2, this.boatY - 40, C.gold);
    }
    if (race.over) {
      const place = race.place;
      this.score = p.leg === 'done' ? p.finish : REGATTA.maxTime;
      this.overLines.push({ text: `${t.gameText.sup.places[place - 1]} ${t.gameText.sup.of}`, color: place === 1 ? C.gold : C.white });
      this.finish(p.leg === 'done' ? t.finish : t.timeUp);
    }
  }

  /** The player's boat sits a little low on the screen: the course is ahead, upwind. */
  private get boatY(): number {
    return Math.round(this.ctx.r.H * 0.62);
  }

  protected draw(alpha: number): void {
    const r = this.ctx.r;
    const race = this.race;
    const p = race.player;
    const px = this.prevX + (p.x - this.prevX) * alpha;
    const py = this.prevY + (p.y - this.prevY) * alpha;
    const ox = Math.round(r.W / 2 - px);
    const oy = Math.round(this.boatY - py);
    this.water(ox, oy);
    for (const puff of race.puffs) this.puff(puff, ox, oy);
    // the windward mark and the finish line
    this.mark(ox, oy + race.markY, p.leg === 'up');
    this.mark(ox - REGATTA.finishHalf, oy + REGATTA.finishY, p.leg === 'down');
    this.mark(ox + REGATTA.finishHalf, oy + REGATTA.finishY, p.leg === 'down');
    for (let x = -REGATTA.finishHalf + 6; x < REGATTA.finishHalf - 4; x += 8) r.fill(C.white, ox + x, oy + REGATTA.finishY, 4, 1);
    for (let i = 0; i < race.rivals.length; i++) this.boat(race.rivals[i], ox + race.rivals[i].x, oy + race.rivals[i].y, this.looks[i]);
    this.boat(p, Math.round(r.W / 2), this.boatY);
  }

  /** Ripples running with the wind. */
  private water(ox: number, oy: number): void {
    const r = this.ctx.r;
    r.fill(C.sea, 0, 0, r.W, r.H);
    const wx = -Math.sin(this.race.wind) * this.clock * 14;
    const wy = Math.cos(this.race.wind) * this.clock * 14;
    for (let k = -1; k < r.H / 18 + 1; k++) {
      const y = Math.round(((((k * 18 + oy + wy) % 18) + 18) % 18) + k * 18);
      for (let i = 0; i < 8; i++) {
        const x = Math.round(((((i * 61 + k * 23 + ox + wx) % (r.W + 40)) + r.W + 40) % (r.W + 40)) - 20);
        r.fill(C.turquoise, x, y, 7, 1);
      }
    }
  }

  /** A puff: darker, rippled water. */
  private puff(p: Puff, ox: number, oy: number): void {
    const r = this.ctx.r;
    const cx = ox + p.x;
    const cy = oy + p.y;
    if (cy < -p.r || cy > r.H + p.r || cx < -p.r || cx > r.W + p.r) return;
    for (let dy = -p.r; dy <= p.r; dy += 3) {
      const half = Math.round(Math.sqrt(p.r * p.r - dy * dy));
      const shift = (Math.round(dy / 3) & 1) * 3;
      for (let dx = -half + shift; dx < half; dx += 6) r.fill(C.teal, Math.round(cx + dx), Math.round(cy + dy), 3, 1);
    }
  }

  private mark(x: number, y: number, next: boolean): void {
    const r = this.ctx.r;
    if (y < -20 || y > r.H + 20) return;
    r.fill(C.ink, x - 5, y - 5, 11, 11);
    r.fill(C.orange, x - 4, y - 4, 9, 9);
    r.fill(C.gold, x - 4, y - 4, 9, 2);
    if (next && Math.floor(this.clock * 3) % 2 === 0) {
      r.fill(C.white, x - 8, y - 8, 17, 1);
      r.fill(C.white, x - 8, y + 8, 17, 1);
      r.fill(C.white, x - 8, y - 8, 1, 17);
      r.fill(C.white, x + 8, y - 8, 1, 17);
    }
  }

  private boat(b: Boat, x: number, y: number, look?: AthleteConfig): void {
    const r = this.ctx.r;
    if (x < -30 || x > r.W + 30 || y < -30 || y > r.H + 30) return;
    const frames = this.ctx.actor('boat', look);
    const f = frames[headingIndex(b.heading, BOAT_HEADINGS)];
    r.ctx.drawImage(f, Math.round(x) - TOP_SIZE / 2, Math.round(y) - TOP_SIZE / 2);
    // the sail from the mast, on the side away from the wind; flapping while turning
    const s = Math.sin(b.heading);
    const c = Math.cos(b.heading);
    const mx = Math.round(x + 3 * s);
    const my = Math.round(y - 3 * c);
    const off = angleDiff(this.race.wind, b.heading);
    const out = b.leg === 'up' ? 0.5 : 1.3;
    const flap = b.turning > 0 ? Math.sin(this.clock * 40) * 0.5 : 0;
    const boom = b.heading + Math.PI + (off > 0 ? out : -out) + flap;
    const ex = Math.round(mx + Math.sin(boom) * 16);
    const ey = Math.round(my - Math.cos(boom) * 16);
    // the sail filled by the wind: an outlined double line
    r.line(mx - 1, my, ex - 1, ey, C.ink);
    r.line(mx + 2, my, ex + 2, ey, C.ink);
    r.line(mx, my - 1, ex, ey - 1, C.ink);
    r.line(mx, my + 2, ex, ey + 2, C.ink);
    r.line(mx, my, ex, ey, C.white);
    r.line(mx + 1, my, ex + 1, ey, C.white);
    r.line(mx, my + 1, ex, ey + 1, C.mist);
    r.fill(C.brown, mx, my, 2, 2);
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const race = this.race;
    // wind: an arrow blowing the way the wind goes
    const cx = Math.round(r.W / 2);
    const cy = 6 + 12 * u;
    const len = 9 * u;
    const dx = -Math.sin(race.wind);
    const dy = Math.cos(race.wind);
    const x0 = cx - dx * len;
    const y0 = cy - dy * len;
    const x1 = cx + dx * len;
    const y1 = cy + dy * len;
    r.fill(C.ink, cx - 12 * u, cy - 12 * u, 24 * u, 24 * u);
    r.fill(C.navy, cx - 12 * u + 1, cy - 12 * u + 1, 24 * u - 2, 24 * u - 2);
    for (let w = 0; w < u; w++) r.line(x0 + w, y0, x1 + w, y1, C.white);
    r.fill(C.gold, Math.round(x1) - u, Math.round(y1) - u, 3 * u, 3 * u);
    r.centered(t.gameText.regatta.wind, cx, cy + 13 * u, C.white, u);
    r.text(t.gameText.sup.places[race.place - 1], 6, 6 + (GLYPH_H + 9) * u, race.place === 1 ? C.gold : C.white, u);
    // a little arrow around the boat pointing to the next mark
    const p = race.player;
    const want = race.target(p);
    const s = Math.sin(want);
    const c = Math.cos(want);
    const bx = r.W / 2;
    const by = this.boatY;
    const tipX = bx + s * 34;
    const tipY = by - c * 34;
    for (let k = 24; k <= 34; k++) r.fill(C.gold, Math.round(bx + s * k), Math.round(by - c * k), 2, 2);
    for (const side of ARROW_SIDES) {
      const a = want + Math.PI + side * 0.6;
      for (let k = 1; k <= 6; k++) r.fill(C.gold, Math.round(tipX + Math.sin(a) * k), Math.round(tipY - Math.cos(a) * k), 2, 2);
    }
    if (this.time < 4) r.centered(r.touch ? t.gameText.regatta.touchHint : t.gameText.regatta.keyHint, r.W / 2, r.H - (GLYPH_H + 10) * u, C.white, u);
  }
}

const ARROW_SIDES = [-1, 1] as const;
