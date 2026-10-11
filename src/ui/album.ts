import { CREATURES } from '../games/sealife.ts';
import { ALBUM_TREASURES, treasureRaster } from '../games/treasures.ts';
import { t } from '../i18n/strings.ts';
import { GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, rasterCanvas, setRect, type Rect } from '../render/renderer.ts';
import { seaFloor, specks, underwater } from '../render/sea.ts';
import { silhouette } from '../sprites/fish.ts';
import type { Context, Screen } from './screen.ts';

type Tab = 'fish' | 'photos' | 'treasures';
const TABS: readonly Tab[] = ['fish', 'photos', 'treasures'];

interface Entry {
  id: string;
  treasure: boolean;
  /** 0 unknown, 1 seen, 2 caught / photographed / found. */
  known: number;
  name: string;
  /** Count and size, or nothing. */
  info: string;
  stars: number;
}

/**
 * The shared collection: fish caught (with the biggest size), photos of
 * every creature (with their stars) and treasures found. Unknown entries
 * show as dark silhouettes. Pages of cards, three tabs.
 */
export class AlbumScreen implements Screen {
  private clock = 0;
  private tab: Tab = 'fish';
  private page = 0;
  private pages = 1;
  private readonly entries: Record<Tab, Entry[]> = { fish: [], photos: [], treasures: [] };
  private readonly progress: Record<Tab, string> = { fish: '', photos: '', treasures: '' };
  private shellText = '';
  private readonly tabRects: Rect[] = [newRect(), newRect(), newRect()];
  private readonly prevRect = newRect();
  private readonly nextRect = newRect();
  private readonly done = newRect();
  private readonly cell = newRect();
  private readonly treasureArt = new Map<string, HTMLCanvasElement>();
  private readonly treasureShadow = new Map<string, HTMLCanvasElement>();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  enter(): void {
    const album = this.ctx.album;
    const fish = this.entries.fish;
    const photos = this.entries.photos;
    const treasures = this.entries.treasures;
    fish.length = 0;
    photos.length = 0;
    treasures.length = 0;
    for (const c of CREATURES) {
      const seen = album.seen.has(c.id);
      const stars = album.photos.get(c.id) ?? 0;
      photos.push({ id: c.id, treasure: false, known: stars > 0 ? 2 : seen ? 1 : 0, name: t.creatures[c.id], info: seen && stars === 0 ? t.seen : '', stars });
      if (!c.hookable) continue;
      const rec = album.caught.get(c.id);
      fish.push({
        id: c.id,
        treasure: false,
        known: rec ? 2 : seen ? 1 : 0,
        name: t.creatures[c.id],
        info: rec ? `X${rec.count}  ${rec.best} ${t.cm}` : seen ? t.seen : '',
        stars: 0,
      });
    }
    for (const tr of ALBUM_TREASURES) {
      const n = album.treasures.get(tr.id) ?? 0;
      treasures.push({ id: tr.id, treasure: true, known: n > 0 ? 2 : 0, name: t.treasures[tr.id], info: n > 0 ? `X${n}` : '', stars: 0 });
    }
    for (const tab of TABS) {
      let got = 0;
      for (const e of this.entries[tab]) if (e.known === 2) got++;
      this.progress[tab] = `${got}/${this.entries[tab].length}`;
    }
    this.shellText = `${t.shells} ${album.shells}`;
    this.page = 0;
  }

  blur(): void {}

  key(code: string): void {
    if (code === 'Escape' || code === 'Enter' || code === 'Space') this.ctx.go('home');
    else if (code === 'ArrowRight' || code === 'KeyD') this.turn(1);
    else if (code === 'ArrowLeft' || code === 'KeyA') this.turn(-1);
    else if (code === 'Tab' || code === 'ArrowDown') this.switchTab(1);
    else if (code === 'ArrowUp') this.switchTab(-1);
  }

  private turn(dir: number): void {
    this.page = (this.page + dir + this.pages) % this.pages;
  }

  private switchTab(dir: number): void {
    this.tab = TABS[(TABS.indexOf(this.tab) + dir + TABS.length) % TABS.length];
    this.page = 0;
  }

  tap(x: number, y: number): boolean {
    for (let i = 0; i < TABS.length; i++) {
      if (inside(this.tabRects[i], x, y)) {
        this.tab = TABS[i];
        this.page = 0;
        return true;
      }
    }
    if (inside(this.prevRect, x, y)) {
      this.turn(-1);
      return true;
    }
    if (inside(this.nextRect, x, y)) {
      this.turn(1);
      return true;
    }
    if (inside(this.done, x, y)) {
      this.ctx.go('home');
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.clock += dt;
  }

  render(): void {
    const r = this.ctx.r;
    const { W, H } = r;
    underwater(r, 0, H, this.clock, false, 0.15, 0.85);
    specks(r, 0, H, 0, this.clock);
    seaFloor(r, H - 12, this.clock * 2, this.clock, false, 11);
    const u = r.u;
    const margin = 6;
    const lineH = (GLYPH_H + 4) * u;
    // title, shells and the tabs
    let y = margin;
    r.centered(t.album, W / 2, y, C.white, 2 * u);
    y += (GLYPH_H + 4) * 2 * u;
    const tabH = (GLYPH_H + 7) * u;
    const gap = 3 * u;
    let tabW = 0;
    for (const tab of TABS) tabW = Math.max(tabW, r.font.width(t.albumTabs[tab], u) + 12 * u);
    tabW = Math.min(tabW, Math.floor((W - 2 * margin - 2 * gap) / 3));
    const tx = Math.round((W - (3 * tabW + 2 * gap)) / 2);
    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i];
      r.button(setRect(this.tabRects[i], tx + i * (tabW + gap), y, tabW, tabH), t.albumTabs[tab], tab === this.tab ? 'selected' : 'normal', u, tab === this.tab);
    }
    y += tabH + 2 * u;
    r.centered(this.progress[this.tab], W / 2, y, C.sun, u);
    r.text(this.shellText, W - margin - r.font.width(this.shellText, u), y, C.rose, u);
    y += lineH;

    // the grid: as many cards as fit, smaller cards on short screens
    const footer = tabH + 2 * margin;
    let gu = u;
    let cols = 0;
    let rows = 0;
    let cw = 0;
    let ch = 0;
    for (;;) {
      cw = 82 * gu;
      ch = 40 * gu + 3 * (GLYPH_H + 3) * gu + 6 * gu;
      cols = Math.max(1, Math.floor((W - 2 * margin + gap) / (cw + gap)));
      rows = Math.floor((H - y - footer + gap) / (ch + gap));
      if (rows >= 1 || gu === 1) break;
      gu--;
    }
    rows = Math.max(1, rows);
    const per = cols * rows;
    const list = this.entries[this.tab];
    this.pages = Math.max(1, Math.ceil(list.length / per));
    if (this.page >= this.pages) this.page = this.pages - 1;
    const gx = Math.round((W - (cols * cw + (cols - 1) * gap)) / 2);
    for (let i = 0; i < per; i++) {
      const e = list[this.page * per + i];
      if (!e) break;
      const cx = gx + (i % cols) * (cw + gap);
      const cy = y + Math.floor(i / cols) * (ch + gap);
      this.card(e, setRect(this.cell, cx, cy, cw, ch), gu);
    }

    // pages and DONE at the bottom
    const by = H - margin - tabH;
    const bw = r.font.width(t.done, u) + 16 * u;
    r.button(setRect(this.done, (W - bw) / 2, by, bw, tabH), t.done, 'primary', u, true);
    if (this.pages > 1) {
      const aw = tabH;
      r.arrowButton(setRect(this.prevRect, (W - bw) / 2 - gap - aw, by, aw, tabH), -1, u);
      r.arrowButton(setRect(this.nextRect, (W + bw) / 2 + gap, by, aw, tabH), 1, u);
      // page 1/3
      const px = Math.round((W + bw) / 2 + 2 * gap + aw);
      const py = by + Math.round((tabH - GLYPH_H * u) / 2);
      const adv = r.font.widthOf(1, u);
      const d1 = digitCount(this.page + 1);
      r.number(this.page + 1, d1, px, py, C.white, u);
      r.text('/', px + d1 * adv, py, C.white, u);
      r.number(this.pages, digitCount(this.pages), px + (d1 + 1) * adv, py, C.white, u);
    } else {
      setRect(this.prevRect, 0, 0, 0, 0);
      setRect(this.nextRect, 0, 0, 0, 0);
    }
  }

  /** One card: the art (or its silhouette), the name and what you know. */
  private card(e: Entry, rect: Rect, gu: number): void {
    const r = this.ctx.r;
    r.panel(rect, e.known === 2 ? C.navy : C.indigo);
    const artH = 40 * gu;
    const midX = rect.x + rect.w / 2;
    const midY = rect.y + 3 * gu + artH / 2;
    if (e.treasure) {
      const art = this.treasureCanvas(e.id, e.known > 0);
      const s = Math.max(1, Math.min(gu * 2, Math.floor((rect.w - 8) / art.width), Math.floor((artH - 4) / art.height)));
      r.ctx.drawImage(art, Math.round(midX - (art.width * s) / 2), Math.round(midY - (art.height * s) / 2), art.width * s, art.height * s);
    } else {
      const art = r.creatures.get(e.id);
      const s = Math.max(1, Math.min(gu * 2, Math.floor((rect.w - 8) / art.w), Math.floor((artH - 2) / art.h)));
      if (e.known > 0) {
        r.creature(e.id, midX, midY, Math.floor(this.clock * 2) & 1, false, s);
      } else {
        const sh = r.creatures.shadow(e.id, C.navy);
        r.ctx.drawImage(sh, Math.round(midX - (sh.width * s) / 2), Math.round(midY - (sh.height * s) / 2), sh.width * s, sh.height * s);
      }
    }
    let ty = rect.y + 3 * gu + artH + 2 * gu;
    if (e.known === 0) {
      r.centered(t.unknown, midX, ty, C.slate, gu);
      return;
    }
    ty += r.centered(e.name, midX, ty, e.known === 2 ? C.sun : C.white, gu, rect.w - 4 * gu);
    if (e.stars > 0) r.stars(midX, ty, e.stars, gu);
    else if (e.info) r.centered(e.info, midX, ty, C.skyPale, gu, rect.w - 4 * gu);
  }

  private treasureCanvas(id: string, known: boolean): HTMLCanvasElement {
    const cache = known ? this.treasureArt : this.treasureShadow;
    let c = cache.get(id);
    if (!c) {
      const raster = treasureRaster(id);
      c = rasterCanvas(known ? raster : silhouette(raster, C.navy));
      cache.set(id, c);
    }
    return c;
  }
}
