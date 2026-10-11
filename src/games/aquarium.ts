import { Rng } from '../core/rng.ts';
import type { CatchRecord } from '../custom/album.ts';
import { dayKey } from '../game/daily.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { newRect, setRect } from '../render/renderer.ts';
import { bubble, specks, underwater } from '../render/sea.ts';
import type { Context } from '../ui/screen.ts';
import { MiniGame } from './kit.ts';
import { ALBUM_TREASURES } from './treasures.ts';

/** Tuning of the aquarium. */
export const AQUARIUM = {
  /** Most fish in the tank, and copies of one species at most. */
  max: 12,
  copies: 3,
  /** Shells for each extra coral, and the most corals. */
  shellsPerCoral: 10,
  corals: 8,
  flakes: 12,
  /** How long a tapped fish shows its name. */
  card: 2.4,
} as const;

/** Creatures that may visit the tank, one per day. */
export const VISITORS = ['turtle', 'manta', 'octopus', 'seahorse', 'squid', 'jelly', 'star', 'crab', 'dolphin'] as const;

/** Which fish swim in the tank: each species caught, up to a few copies, most caught first. */
export function tankPopulation(caught: ReadonlyMap<string, CatchRecord>): string[] {
  const species = [...caught.entries()].sort((a, b) => b[1].count - a[1].count);
  const out: string[] = [];
  for (let copy = 0; copy < AQUARIUM.copies && out.length < AQUARIUM.max; copy++) {
    for (const [id, rec] of species) {
      if (rec.count > copy && out.length < AQUARIUM.max) out.push(id);
    }
  }
  return out;
}

/** The visitor of the day: the same for everyone on the same day. */
export function dailyVisitor(day: string): string {
  let h = 0x811c9dc5;
  const text = `bob:tank:${day}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return VISITORS[h % VISITORS.length];
}

interface Swimmer {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  left: boolean;
  /** Seconds until it picks a new place to swim to. */
  wander: number;
}

interface Flake {
  active: boolean;
  x: number;
  y: number;
}

/**
 * A calm tank: the fish you caught swim around, the treasures you found
 * rest on the sand, shells grow the corals. Tap a fish for its name, tap
 * the water to feed them. Each day a different visitor comes by.
 */
export class AquariumScreen extends MiniGame {
  readonly id = 'aquarium' as const;
  private readonly rng = new Rng(Date.now() >>> 0);
  private readonly fish: Swimmer[] = [];
  private readonly flakes: Flake[] = [];
  private visitor: Swimmer | null = null;
  private visitorSeen = false;
  private treasures: string[] = [];
  private corals = 0;
  private cardId = '';
  private cardText = '';
  private cardTime = 0;
  private readonly cardRect = newRect();

  constructor(ctx: Context) {
    super(ctx);
    for (let i = 0; i < AQUARIUM.flakes; i++) this.flakes.push({ active: false, x: 0, y: 0 });
  }

  protected get scored(): boolean {
    return false;
  }

  private get top(): number {
    return 6 + (GLYPH_H + 8) * this.ctx.r.u;
  }

  private get sand(): number {
    const r = this.ctx.r;
    return r.H - Math.max(20, Math.round(r.H * 0.1));
  }

  private swimmer(id: string): Swimmer {
    const r = this.ctx.r;
    const s: Swimmer = { id, x: 0, y: 0, tx: 0, ty: 0, speed: 0, left: false, wander: 0 };
    s.x = this.rng.range(30, r.W - 30);
    s.y = this.rng.range(this.top + 20, this.sand - 20);
    this.retarget(s);
    return s;
  }

  private retarget(s: Swimmer): void {
    const r = this.ctx.r;
    s.tx = this.rng.range(24, r.W - 24);
    s.ty = this.rng.range(this.top + 16, this.sand - 14);
    s.speed = this.rng.range(10, 24);
    s.wander = this.rng.range(2, 6);
  }

  protected reset(): void {
    const album = this.ctx.album;
    this.fish.length = 0;
    const ids = tankPopulation(album.caught);
    // an empty tank still has a few sardines passing by
    if (ids.length === 0) ids.push('sardine', 'sardine', 'sardine');
    for (const id of ids) this.fish.push(this.swimmer(id));
    this.treasures = ALBUM_TREASURES.filter((tr) => (album.treasures.get(tr.id) ?? 0) > 0).map((tr) => tr.id);
    this.corals = Math.min(AQUARIUM.corals, 2 + Math.floor(album.shells / AQUARIUM.shellsPerCoral));
    const visitorId = dailyVisitor(dayKey(new Date()));
    this.visitor = this.swimmer(visitorId);
    this.visitor.x = -30;
    this.visitorSeen = album.seen.has(visitorId);
    for (const f of this.flakes) f.active = false;
    this.cardTime = 0;
  }

  protected step(dt: number, pressed: boolean): void {
    if (pressed) this.feed(this.rng.range(40, this.ctx.r.W - 40));
    for (const f of this.flakes) {
      if (!f.active) continue;
      f.y += 12 * dt;
      f.x += Math.sin(this.clock * 2 + f.y * 0.1) * 6 * dt;
      if (f.y > this.sand - 2) f.active = false;
    }
    for (const s of this.fish) this.swim(s, dt, true);
    if (this.visitor) this.swim(this.visitor, dt, false);
    if (this.cardTime > 0) this.cardTime -= dt;
  }

  private swim(s: Swimmer, dt: number, hungry: boolean): void {
    // food first: the nearest flake
    let food: Flake | null = null;
    let best = 90;
    if (hungry) {
      for (const f of this.flakes) {
        if (!f.active) continue;
        const d = Math.hypot(f.x - s.x, f.y - s.y);
        if (d < best) {
          best = d;
          food = f;
        }
      }
    }
    const tx = food ? food.x : s.tx;
    const ty = food ? food.y : s.ty;
    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    const v = (food ? 40 : s.speed) * dt;
    if (d > 1) {
      s.x += (dx / d) * Math.min(v, d);
      s.y += (dy / d) * Math.min(v, d) * 0.6;
      if (Math.abs(dx) > 2) s.left = dx < 0;
    }
    if (food && d < 5) {
      food.active = false;
      this.popup('+', s.x, s.y - 10, C.rose);
    }
    s.wander -= dt;
    if (!food && (s.wander <= 0 || d < 2)) this.retarget(s);
  }

  private feed(x: number): void {
    let n = 0;
    for (const f of this.flakes) {
      if (f.active || n >= 3) continue;
      f.active = true;
      f.x = x + (n - 1) * 5;
      f.y = this.top + 4 + n * 3;
      n++;
    }
  }

  protected onTap(x: number, y: number): boolean {
    const r = this.ctx.r;
    // a creature under the finger shows its name
    const k = r.u;
    const hit = (s: Swimmer) => {
      const art = r.creatures.get(s.id);
      return Math.abs(s.x - x) < (art.w * k) / 2 + 4 && Math.abs(s.y - y) < (art.h * k) / 2 + 4;
    };
    if (this.visitor && hit(this.visitor)) {
      const id = this.visitor.id;
      if (this.ctx.album.see(id)) this.popup(`${t.newItem} ${t.creatures[id]}`, x, y - 16, C.gold);
      this.visitorSeen = true;
      this.showCard(id, t.gameText.aquarium.visitor);
      return true;
    }
    for (const s of this.fish) {
      if (!hit(s)) continue;
      const rec = this.ctx.album.caught.get(s.id);
      this.showCard(s.id, rec ? `${t.gameText.aquarium.biggest} ${rec.best} ${t.cm}` : '');
      return true;
    }
    if (y > this.top) {
      this.feed(x);
      return true;
    }
    return false;
  }

  private showCard(id: string, text: string): void {
    this.cardId = id;
    this.cardText = text;
    this.cardTime = AQUARIUM.card;
  }

  protected draw(): void {
    const r = this.ctx.r;
    const top = this.top;
    const sand = this.sand;
    underwater(r, 0, sand, this.clock, false, 0.1, 0.6);
    specks(r, top, sand, 0, this.clock);
    this.decor(sand);
    for (const f of this.flakes) if (f.active) r.fill(C.gold, Math.round(f.x), Math.round(f.y), 2, 1);
    // on phones everything in the tank is twice as big
    const k = r.u;
    for (const s of this.fish) r.creature(s.id, s.x, s.y, Math.floor(this.clock * 3 + s.tx) & 1, s.left, k);
    const v = this.visitor;
    if (v) {
      r.creature(v.id, v.x, v.y, Math.floor(this.clock * 2) & 1, v.left, k);
      if (!this.visitorSeen && Math.floor(this.clock * 2) % 2 === 0) r.fill(C.sun, Math.round(v.x), Math.round(v.y - 14), 2, 4);
    }
    // bubbles from the corner, and the glass
    for (let i = 0; i < 4; i++) {
      const k = (this.clock * 0.3 + i / 4) % 1;
      bubble(r, r.W - 18 + Math.sin(k * 8 + i) * 2, sand - 6 - k * (sand - top), i % 2 ? 1 : 2);
    }
    r.fill(C.aqua, 2, top, 1, sand - top);
    r.fill(C.aqua, r.W - 3, top, 1, sand - top);
    r.fill(C.white, 4, top + 6, 1, 18);
  }

  /** Sand, rocks, corals (more with shells) and the treasures found. */
  private decor(sand: number): void {
    const r = this.ctx.r;
    const W = r.W;
    r.fill(C.tan, 0, sand, W, r.H - sand);
    for (let x = 3; x < W; x += 9) r.fill(C.brown, x, sand + 4 + (x % 3), 3, 1);
    r.fill(C.ink, 0, sand - 1, W, 1);
    for (let i = 0; i < this.corals; i++) {
      const x = Math.round(((i + 0.5) / this.corals) * W);
      this.coral(x, sand, i);
    }
    for (let i = 0; i < this.treasures.length; i++) {
      const x = Math.round(((i + 1) / (this.treasures.length + 1)) * W + 9);
      r.treasure(this.treasures[i], x, sand - 6 * r.u, r.u);
    }
  }

  private coral(x: number, y: number, i: number): void {
    const r = this.ctx.r;
    const k = r.u;
    const c = i % 3 === 0 ? C.coral : i % 3 === 1 ? C.mauve : C.rose;
    const h = (14 + ((i * 7) % 12)) * k;
    const sway = Math.round(Math.sin(this.clock + i) * k);
    r.fill(c, x, y - h, 2 * k, h);
    r.fill(c, x - 4 * k + sway, y - h + 4 * k, 4 * k, 2 * k);
    r.fill(c, x - 4 * k + sway, y - h - 2 * k, 2 * k, 6 * k);
    r.fill(c, x + 2 * k + sway, y - h + 7 * k, 4 * k, 2 * k);
    r.fill(c, x + 4 * k + sway, y - h + k, 2 * k, 6 * k);
    if (i % 2 === 0) {
      // kelp next to it
      for (let j = 0; j < h + 8 * k; j += 2 * k) r.fill(C.green, x + 10 * k + Math.round(Math.sin(this.clock * 1.3 + j * 0.2) * 2 * k), y - j - 2 * k, 2 * k, 2 * k);
    }
  }

  protected hud(): void {
    const r = this.ctx.r;
    const u = r.u;
    r.centered(t.games.aquarium.name, r.W / 2, 6 + u, C.white, u);
    if (this.ctx.album.caught.size === 0) r.centered(t.gameText.aquarium.empty, r.W / 2, Math.round(r.H * 0.3), C.sun, u, r.W - 24);
    if (this.cardTime <= 0 || !this.cardId) return;
    const name = t.creatures[this.cardId];
    const w = Math.max(r.font.width(name, u), r.font.width(this.cardText, u)) + 12 * u;
    const lineH = (GLYPH_H + 4) * u;
    const h = (this.cardText ? 2 : 1) * lineH + 6 * u;
    const x = Math.round((r.W - w) / 2);
    const y = this.top + 4 * u;
    r.panel(setRect(this.cardRect, x, y, w, h));
    r.centered(name, r.W / 2, y + 3 * u, C.sun, u);
    if (this.cardText) r.centered(this.cardText, r.W / 2, y + 3 * u + lineH, C.white, u);
  }
}
