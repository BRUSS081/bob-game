import { Rng } from '../core/rng.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { newRect, setRect } from '../render/renderer.ts';
import { bubble, seaFloor, specks, underwater } from '../render/sea.ts';
import { SWIM_SIZE, swimIndex } from '../sprites/actor.ts';
import { creatureRaster } from '../sprites/fish.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';
import { CREATURES, RARITY_POINTS, type Creature } from './sealife.ts';

/** Tuning of the photo safari. Pixels and seconds. */
export const SNAP = {
  roll: 12,
  /** Seconds between new creatures. */
  every: [0.9, 1.8] as const,
  /** Length of a creature's special moment. */
  action: 0.8,
  /** How long the photo stays up. */
  show: 1.5,
  /** Star thresholds of the photo score (0..1). */
  stars: [0.42, 0.72] as const,
  acts: 7,
  school: 6,
} as const;

export type ActKind = 'cross' | 'school' | 'leap';

export interface Act {
  active: boolean;
  creature: Creature | null;
  kind: ActKind;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  /** 1 far, 2 near: near ones look twice as big. */
  scale: number;
  age: number;
  /** When its special moment starts (seconds of age). */
  actionAt: number;
}

export interface Photo {
  creature: Creature | null;
  stars: number;
  points: number;
  centered: number;
  close: number;
  action: boolean;
}

const SIZES = new Map<string, { w: number; h: number }>();

/** Sprite size of a creature (from its drawing), so scoring matches what you see. */
export function creatureSize(id: string): { w: number; h: number } {
  let s = SIZES.get(id);
  if (!s) {
    const c = CREATURES.find((k) => k.id === id) as Creature;
    const r = creatureRaster(c, 0);
    s = { w: r.w, h: r.h };
    SIZES.set(id, s);
  }
  return s;
}

/** The safari without drawing: creatures pass, the button takes a photo in the viewfinder. */
export class Safari {
  width = 480;
  top = 60;
  bottom = 250;
  night = false;
  shots: number = SNAP.roll;
  score = 0;
  readonly acts: Act[] = [];
  readonly photo: Photo = { creature: null, stars: 0, points: 0, centered: 0, close: 0, action: false };
  /** Best photo of the roll. */
  bestStars = 0;
  bestId = '';
  private wait = 0.4;
  private readonly rng = new Rng(1);

  constructor() {
    for (let i = 0; i < SNAP.acts; i++) {
      this.acts.push({ active: false, creature: null, kind: 'cross', x: 0, y: 0, baseY: 0, vx: 0, scale: 1, age: 0, actionAt: 0 });
    }
  }

  reset(seed: number, width: number, top: number, bottom: number, night: boolean): void {
    this.rng.seed(seed);
    this.layout(width, top, bottom);
    this.night = night;
    this.shots = SNAP.roll;
    this.score = 0;
    this.bestStars = 0;
    this.bestId = '';
    this.wait = 0.4;
    for (const a of this.acts) a.active = false;
  }

  layout(width: number, top: number, bottom: number): void {
    this.width = width;
    this.top = top;
    this.bottom = bottom;
  }

  /** The viewfinder, in the middle of the water. */
  get vfW(): number {
    return Math.round(Math.min(130, this.width * 0.34));
  }

  get vfH(): number {
    return Math.round(this.vfW * 0.68);
  }

  get vfX(): number {
    return Math.round(this.width / 2);
  }

  get vfY(): number {
    return Math.round((this.top + this.bottom) / 2);
  }

  get over(): boolean {
    return this.shots <= 0;
  }

  /** Is this act in its special moment now? */
  inAction(a: Act): boolean {
    return a.age >= a.actionAt && a.age < a.actionAt + SNAP.action;
  }

  step(dt: number): void {
    this.wait -= dt;
    if (this.wait <= 0) {
      this.spawn();
      this.wait = this.rng.range(SNAP.every[0], SNAP.every[1]);
    }
    for (const a of this.acts) {
      if (!a.active) continue;
      a.age += dt;
      const action = this.inAction(a);
      a.x += a.vx * dt * (action && a.kind === 'cross' ? 0.5 : 1);
      if (a.kind === 'leap' && action) {
        // a dolphin arcs up through the water
        const k = (a.age - a.actionAt) / SNAP.action;
        a.y = a.baseY - Math.sin(k * Math.PI) * 34;
      } else {
        a.y = a.baseY + Math.sin(a.age * 2 + a.baseY) * 2;
      }
      if (a.x < -80 || a.x > this.width + 80) a.active = false;
    }
  }

  private spawn(): void {
    let slot: Act | null = null;
    for (const a of this.acts) if (!a.active) slot = a;
    if (!slot) return;
    const c = this.pick();
    const dir = this.rng.next() < 0.5 ? -1 : 1;
    slot.active = true;
    slot.creature = c;
    slot.kind = c.id === 'dolphin' ? 'leap' : c.id === 'sardine' ? 'school' : 'cross';
    slot.scale = c.kind === 'fish' && c.look && c.look.len < 16 ? (this.rng.next() < 0.6 ? 2 : 1) : this.rng.next() < 0.35 ? 2 : 1;
    const speed = Math.max(26, c.speed * 0.7) * (slot.scale === 2 ? 1.3 : 1);
    slot.vx = dir * speed;
    slot.x = dir > 0 ? -60 : this.width + 60;
    const band = (this.bottom - this.top) * 0.26;
    slot.baseY = this.vfY + this.rng.range(-band, band);
    slot.y = slot.baseY;
    slot.age = 0;
    // the special moment happens somewhere near the middle of the screen
    const where = this.vfX + this.rng.range(-this.width * 0.12, this.width * 0.12);
    slot.actionAt = Math.abs(where - slot.x) / speed;
  }

  private pick(): Creature {
    const depth = this.rng.next();
    let total = 0;
    for (const c of CREATURES) if (this.can(c, depth)) total += WEIGHT[c.rarity];
    let roll = this.rng.next() * total;
    for (const c of CREATURES) {
      if (!this.can(c, depth)) continue;
      roll -= WEIGHT[c.rarity];
      if (roll <= 0) return c;
    }
    return CREATURES[0];
  }

  private can(c: Creature, depth: number): boolean {
    if (c.speed <= 0 || c.id === 'crab') return false;
    if (c.night === true && !this.night) return false;
    if (c.night === false && this.night) return false;
    return depth >= c.depth[0] - 0.3 && depth <= c.depth[1] + 0.3;
  }

  /** Takes a photo: the subject is what is closest to the middle of the viewfinder. */
  shoot(): Photo {
    const p = this.photo;
    p.creature = null;
    p.stars = 0;
    p.points = 0;
    p.centered = 0;
    p.close = 0;
    p.action = false;
    if (this.shots <= 0) return p;
    this.shots--;
    let best: Act | null = null;
    let bestD = Infinity;
    const hw = this.vfW / 2;
    const hh = this.vfH / 2;
    for (const a of this.acts) {
      if (!a.active || !a.creature) continue;
      const dx = Math.abs(a.x - this.vfX);
      const dy = Math.abs(a.y - this.vfY);
      if (dx > hw || dy > hh) continue;
      const d = Math.hypot(dx / hw, dy / hh);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (!best || !best.creature) return p;
    const c = best.creature;
    const size = creatureSize(c.id);
    const area = size.w * size.h * best.scale * best.scale * (best.kind === 'school' ? SNAP.school * 0.6 : 1);
    p.creature = c;
    p.centered = Math.max(0, 1 - bestD);
    p.close = Math.min(1, area / (this.vfW * this.vfH * 0.22));
    p.action = this.inAction(best);
    const k = p.centered * 0.4 + p.close * 0.3 + (p.action ? 0.3 : 0);
    p.stars = k >= SNAP.stars[1] ? 3 : k >= SNAP.stars[0] ? 2 : 1;
    p.points = Math.round((RARITY_POINTS[c.rarity] * p.stars) / 2) + 5;
    this.score += p.points;
    if (p.stars > this.bestStars || (p.stars === this.bestStars && this.bestId === '')) {
      this.bestStars = p.stars;
      this.bestId = c.id;
    }
    return p;
  }
}

const WEIGHT: Record<1 | 2 | 3 | 4, number> = { 1: 10, 2: 6, 3: 3, 4: 1.2 };

// ------------------------------------------------------------------ screen

export class SnapScreen extends MiniGame {
  readonly id = 'snap' as const;
  private readonly safari = new Safari();
  private readonly rng = new Rng(Date.now() >>> 0);
  /** The last photo, copied from the screen when it was taken. */
  private readonly film: HTMLCanvasElement;
  private readonly filmRect = newRect();
  private pendingShot = false;
  private showing = 0;
  private flash = 0;
  private fresh = false;
  private label = '';

  constructor(ctx: Context) {
    super(ctx);
    this.film = document.createElement('canvas');
  }

  private get waterTop(): number {
    const r = this.ctx.r;
    return Math.max(40 + 12 * r.u, Math.round(r.H * 0.16));
  }

  private get floorY(): number {
    return this.ctx.r.H - Math.max(18, Math.round(this.ctx.r.H * 0.07));
  }

  protected reset(): void {
    const r = this.ctx.r;
    this.safari.reset((this.rng.next() * 0xffffffff) >>> 0, r.W, this.waterTop, this.floorY, r.env.night);
    this.showing = 0;
    this.flash = 0;
    this.pendingShot = false;
  }

  protected idle(dt: number): void {
    if (this.phase === 'ready') this.safari.step(dt);
    if (this.flash > 0) this.flash -= dt;
  }

  protected step(dt: number, pressed: boolean): void {
    const s = this.safari;
    const r = this.ctx.r;
    s.layout(r.W, this.waterTop, this.floorY);
    s.step(dt);
    if (this.flash > 0) this.flash -= dt;
    if (this.showing > 0) {
      this.showing -= dt;
      if (this.showing <= 0 && s.over) {
        if (s.bestId) this.overLines.push({ text: `${t.gameText.snap.best} ${t.creatures[s.bestId]}`, color: C.gold });
        this.finish(t.gameText.snap.rollDone);
      }
      return;
    }
    if (!pressed || s.over) return;
    const p = s.shoot();
    this.score = s.score;
    this.flash = 0.18;
    this.pendingShot = true;
    this.showing = SNAP.show;
    if (p.creature) {
      this.fresh = this.ctx.album.photo(p.creature.id, p.stars);
      this.label = t.creatures[p.creature.id];
    } else {
      this.fresh = false;
      this.label = t.gameText.snap.missed;
    }
  }

  protected draw(): void {
    const r = this.ctx.r;
    const s = this.safari;
    const top = this.waterTop;
    const floor = this.floorY;
    r.seaY = top;
    r.backdrop(this.clock * 3);
    underwater(r, top, floor, this.clock, s.night, 0.05, 0.75);
    specks(r, top + 4, floor, 0, this.clock);
    seaFloor(r, floor, this.clock * 2, this.clock, s.night, 3);
    // far ones first, near ones in front
    for (let pass = 1; pass <= 2; pass++) {
      for (const a of s.acts) if (a.active && a.creature && a.scale === pass) this.drawAct(a);
    }
    r.surfaceFront(this.clock * 3);
    if (this.pendingShot) {
      // keep what is in the viewfinder now, without the brackets: that is the photo
      this.capture();
      this.pendingShot = false;
    }
    this.viewfinder();
    // the diver holding the camera, bottom left
    const frames = this.ctx.actor('photo');
    const f = frames[swimIndex(-0.15, Math.floor(this.clock * 3))];
    r.ctx.drawImage(f, Math.round(r.W * 0.1) - SWIM_SIZE / 2, Math.round(floor - 30) - SWIM_SIZE / 2);
  }

  private drawAct(a: Act): void {
    const r = this.ctx.r;
    const c = a.creature as Creature;
    const left = a.vx < 0;
    const action = this.safari.inAction(a);
    const frame = Math.floor(this.clock * (action ? 10 : 4) + a.baseY) & 1;
    if (a.kind === 'school') {
      // a school turning together, tighter in its moment
      for (let i = 0; i < SNAP.school; i++) {
        const ang = i * 1.05 + a.age * (action ? 5 : 1.5);
        const rad = action ? 8 * a.scale : 14 * a.scale;
        r.creature(c.id, a.x + Math.cos(ang) * rad, a.y + Math.sin(ang) * rad * 0.5, (frame + i) & 1, left, a.scale);
      }
      return;
    }
    if (action && c.id === 'octopus') {
      // an ink cloud behind
      const k = (a.age - a.actionAt) / SNAP.action;
      const rad = Math.round(4 + k * 10) * a.scale;
      r.fill(C.ink, Math.round(a.x - rad / 2 + (left ? 8 : -8) * a.scale), Math.round(a.y - rad / 3), rad, Math.round(rad * 0.7));
      r.fill(C.navy, Math.round(a.x - rad / 3 + (left ? 10 : -10) * a.scale), Math.round(a.y - rad / 2), Math.round(rad * 0.7), Math.round(rad * 0.5));
    }
    r.creature(c.id, a.x, a.y, frame, left, a.scale);
    if (action) {
      for (let i = 0; i < 3; i++) {
        const k = ((a.age - a.actionAt) * 2 + i / 3) % 1;
        bubble(r, a.x + (left ? -1 : 1) * (6 + i * 4) * a.scale, a.y - k * 16 - 4, i === 1 ? 2 : 1);
      }
    }
  }

  /** Corner brackets and a center mark. */
  private viewfinder(): void {
    const r = this.ctx.r;
    const s = this.safari;
    const x0 = s.vfX - s.vfW / 2;
    const y0 = s.vfY - s.vfH / 2;
    const x1 = x0 + s.vfW;
    const y1 = y0 + s.vfH;
    const l = 10;
    const c = C.white;
    r.fill(c, x0, y0, l, 1);
    r.fill(c, x0, y0, 1, l);
    r.fill(c, x1 - l, y0, l, 1);
    r.fill(c, x1 - 1, y0, 1, l);
    r.fill(c, x0, y1 - 1, l, 1);
    r.fill(c, x0, y1 - l, 1, l);
    r.fill(c, x1 - l, y1 - 1, l, 1);
    r.fill(c, x1 - 1, y1 - l, 1, l);
    r.fill(c, s.vfX - 3, s.vfY, 7, 1);
    r.fill(c, s.vfX, s.vfY - 3, 1, 7);
  }

  /** Copies the viewfinder from the screen into the film canvas. */
  private capture(): void {
    const r = this.ctx.r;
    const s = this.safari;
    const fc = this.film;
    if (fc.width !== s.vfW || fc.height !== s.vfH) {
      fc.width = s.vfW;
      fc.height = s.vfH;
    }
    const g = fc.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.drawImage(r.ctx.canvas, s.vfX - s.vfW / 2, s.vfY - s.vfH / 2, s.vfW, s.vfH, 0, 0, s.vfW, s.vfH);
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    const s = this.safari;
    // film left: one little frame per shot
    const size = 4 * u;
    const gap = 2 * u;
    const total = SNAP.roll * (size + gap) - gap;
    const x = Math.round((r.W - total) / 2);
    const y = 6 + 2 * u;
    for (let i = 0; i < SNAP.roll; i++) {
      r.fill(C.ink, x + i * (size + gap) - 1, y - 1, size + 2, size + 2);
      r.fill(i < s.shots ? C.sun : C.slate, x + i * (size + gap), y, size, size);
    }
    if (this.flash > 0) r.fill(C.white, 0, 0, r.W, r.H);
    if (this.showing > 0 && !this.pendingShot) this.polaroid();
  }

  /** The photo just taken, in a white frame with its stars and the creature's name. */
  private polaroid(): void {
    const r = this.ctx.r;
    const u = r.u;
    const s = this.safari;
    const p = s.photo;
    const scale = s.vfW * 2 <= r.W - 20 && s.vfH * 2 + 60 * u <= r.H - 40 ? 2 : 1;
    const w = s.vfW * scale;
    const h = s.vfH * scale;
    const pad = 4 * u;
    const lineH = (GLYPH_H + 4) * u;
    const fw = w + 2 * pad;
    const fh = h + pad + 2 * lineH + 10 * u;
    const x = Math.round((r.W - fw) / 2);
    const y = Math.round(Math.max(20 * u, (r.H - fh) / 2));
    r.fill(C.ink, x - 1, y - 1, fw + 2, fh + 2);
    r.fill(C.white, x, y, fw, fh);
    setRect(this.filmRect, x + pad, y + pad, w, h);
    r.ctx.drawImage(this.film, x + pad, y + pad, w, h);
    let cy = y + pad + h + 3 * u;
    if (p.creature) {
      r.stars(r.W / 2, cy, p.stars, u);
      cy += 9 * u;
    }
    const color = p.creature ? (this.fresh ? C.coral : C.navy) : C.grey;
    r.font.draw(r.ctx, this.label, Math.round(r.W / 2 - r.font.width(this.label, u) / 2), cy, color, u);
    if (this.fresh) r.centered(t.newItem, r.W / 2, y - lineH, C.gold, u);
  }
}
