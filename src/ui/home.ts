import { CHARACTERS } from '../custom/athlete.ts';
import { GAME_IDS, LOWER_IS_BETTER, type GameId } from '../games/registry.ts';
import { t } from '../i18n/strings.ts';
import { ADVANCE, GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type Rect } from '../render/renderer.ts';
import { ICON, type IconName } from '../sprites/icons.ts';
import { DemoPilot, type Context, type Screen } from './screen.ts';

/** Focus rows for the keyboard, top to bottom. */
const CAROUSEL = 0;
const PLAY = 1;
const BOTTOM = 2;
const RIDER = 3;
const ROWS = 4;
const BOTTOM_ITEMS: readonly { icon: IconName; label: 'look' | 'missions' | 'album' }[] = [
  { icon: 'look', label: 'look' },
  { icon: 'missions', label: 'missions' },
  { icon: 'album', label: 'album' },
];

/**
 * Sizes of the home block in UI units, largest first: title, game icon,
 * game name, card text, gap. A title of 0 leaves it out.
 */
const FITS: readonly (readonly [number, number, number, number, number])[] = [
  [3, 3, 2, 1, 4],
  [2, 3, 2, 1, 4],
  [2, 2, 2, 1, 3],
  [1, 1.5, 1, 0.5, 1.5],
  [0, 1.5, 1, 0.5, 1.5],
  [0, 1, 0.5, 0.5, 1],
];

/** A size from FITS in whole pixels: at least 1 unless it is 0. */
function fitSize(m: number, u: number): number {
  return Math.max(m > 0 ? 1 : 0, Math.floor(m * u));
}

/**
 * Title screen, kept simple: one game at a time on a carousel, one PLAY,
 * and three small buttons below (look, missions, album). BOB or BOBBA is
 * a chip in the corner. The chosen athlete rides by in the background.
 */
export class HomeScreen implements Screen {
  private focus = PLAY;
  private col = 0;
  private clock = 0;
  private distance = 0;
  private readonly pilot = new DemoPilot();
  private readonly prev = newRect();
  private readonly next = newRect();
  private readonly card = newRect();
  private readonly play = newRect();
  private readonly rider = newRect();
  private readonly settings = newRect();
  /** On the top row: 0 the BOB / BOBBA chip, 1 the settings button. */
  private topCol = 0;
  private readonly bottom: Rect[] = BOTTOM_ITEMS.map(newRect);
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  enter(): void {
    this.focus = PLAY;
    this.pilot.reset();
    this.ctx.demo(this.ctx.profile.sport).reset();
  }

  blur(): void {}

  private get game(): GameId {
    return this.ctx.profile.game;
  }

  private changeGame(step: number): void {
    const i = GAME_IDS.indexOf(this.game);
    this.ctx.profile.setGame(GAME_IDS[(i + step + GAME_IDS.length) % GAME_IDS.length]);
  }

  private toggleRider(): void {
    const p = this.ctx.profile;
    p.setRider(CHARACTERS[(CHARACTERS.indexOf(p.rider) + 1) % CHARACTERS.length]);
    this.ctx.changed();
  }

  private launch(): void {
    if (this.game === 'runner') this.ctx.go('setup');
    else this.ctx.go(this.game);
  }

  private openBottom(i: number): void {
    this.ctx.go(i === 0 ? 'customize' : i === 1 ? 'missions' : 'album');
  }

  key(code: string): void {
    switch (code) {
      case 'ArrowUp':
        this.focus = (this.focus + ROWS - 1) % ROWS;
        break;
      case 'ArrowDown':
      case 'Tab':
        this.focus = (this.focus + 1) % ROWS;
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const step = code === 'ArrowLeft' ? -1 : 1;
        if (this.focus === CAROUSEL || this.focus === PLAY) this.changeGame(step);
        else if (this.focus === BOTTOM) this.col = (this.col + step + BOTTOM_ITEMS.length) % BOTTOM_ITEMS.length;
        else this.topCol = 1 - this.topCol;
        break;
      }
      case 'Space':
      case 'Enter':
        if (this.focus === BOTTOM) this.openBottom(this.col);
        else if (this.focus === RIDER) {
          if (this.topCol === 0) this.toggleRider();
          else this.ctx.go('settings');
        }
        else this.launch();
        break;
    }
  }

  tap(x: number, y: number): boolean {
    if (inside(this.prev, x, y)) this.changeGame(-1);
    else if (inside(this.next, x, y)) this.changeGame(1);
    else if (inside(this.play, x, y) || inside(this.card, x, y)) this.launch();
    else if (inside(this.rider, x, y)) this.toggleRider();
    else if (inside(this.settings, x, y)) this.ctx.go('settings');
    else {
      for (let i = 0; i < this.bottom.length; i++) {
        if (inside(this.bottom[i], x, y)) {
          this.openBottom(i);
          return true;
        }
      }
      return false;
    }
    return true;
  }

  update(dt: number): void {
    this.clock += dt;
    this.distance += 60 * dt;
    this.pilot.update(this.ctx.demo(this.ctx.profile.sport), dt);
  }

  render(alpha: number): void {
    const { r, profile } = this.ctx;
    const { W, H, u, seaY } = r;
    const sport = profile.sport;
    const landscape = W >= H * 1.25;
    const margin = 6;

    r.backdrop(this.distance);
    const demo = this.ctx.demo(sport);
    const athleteX = landscape ? Math.round(W * 0.16) : Math.round(W / 2 - 8);
    r.athlete(this.ctx.player(), sport, demo, athleteX, alpha, this.clock);
    r.surfaceFront(this.distance);
    r.weatherFront(this.distance);

    // BOB / BOBBA chip, top-left; settings, top-right
    const chipW = r.font.width(t.characters.bobba, u) + 10 * u;
    const rowH = (GLYPH_H + 7) * u;
    r.button(setRect(this.rider, margin, margin, chipW, rowH), t.characters[profile.rider], 'selected', u, this.focus === RIDER && this.topCol === 0);
    const gear = setRect(this.settings, W - margin - rowH, margin, rowH, rowH);
    r.button(gear, '', 'normal', u, this.focus === RIDER && this.topCol === 1);
    const gearS = Math.max(1, Math.floor((rowH - 2 * u) / ICON));
    r.icon('sky', gear.x + (rowH - ICON * gearS) / 2, gear.y + (rowH - ICON * gearS) / 2, gearS);
    this.drawBest(margin, gear.x - 4 * u);

    // the block: title, card (arrows, icon, name, tagline, dots), play, bottom row;
    // the largest sizes that fit the height (short landscape phones shrink the card, never the buttons)
    const tagline = t.games[this.game].tagline;
    const top = margin + rowH + 4 * u;
    let gap = 0;
    let iconScale = 0;
    let nameScale = 0;
    let cu = 0;
    let title = 0;
    let cardH = 0;
    let rest = 0;
    for (let f = 0; f < FITS.length; f++) {
      const k = FITS[f];
      title = fitSize(k[0], u);
      iconScale = fitSize(k[1], u);
      nameScale = fitSize(k[2], u);
      cu = fitSize(k[3], u);
      gap = fitSize(k[4], u);
      // the card keeps one size for every game: room for a two-line tagline
      cardH = ICON * iconScale + 4 * cu + (GLYPH_H + 3) * nameScale + 2 * (GLYPH_H + 3) * cu + 11 * cu;
      rest = 2 * gap + cardH + gap + rowH + 2 * gap + rowH;
      if (GLYPH_H * title + rest <= H - top - margin) break;
    }
    const cardW = Math.min(W - 2 * margin - 2 * (12 * u + gap), 150 * cu);
    const block = GLYPH_H * title + rest;
    const cx = landscape ? Math.round(W * 0.62) : Math.round(W / 2);
    let y = Math.max(top, Math.min(Math.round((seaY - block) / 2) + gap, H - block - margin));

    if (title > 0) r.centered(t.title, cx, y, C.white, title);
    y += GLYPH_H * title + 2 * gap;

    // card with arrows on its sides
    const arrowW = 12 * u;
    setRect(this.card, cx - cardW / 2, y, cardW, cardH);
    r.panel(this.card, this.focus === CAROUSEL ? C.indigo : C.navy);
    setRect(this.prev, this.card.x - gap - arrowW, y + cardH / 2 - rowH / 2, arrowW, rowH);
    setRect(this.next, this.card.x + cardW + gap, y + cardH / 2 - rowH / 2, arrowW, rowH);
    r.arrowButton(this.prev, -1, u);
    r.arrowButton(this.next, 1, u);
    let cy = y + 4 * cu;
    r.icon(this.game, cx - (ICON * iconScale) / 2, cy, iconScale);
    cy += ICON * iconScale + 4 * cu;
    cy += r.centered(t.games[this.game].name, cx, cy, C.sun, nameScale);
    r.centered(tagline, cx, cy, C.white, cu, cardW - 8 * cu);
    // page dots
    const dot = cu;
    const dotsW = GAME_IDS.length * 3 * dot;
    const gi = GAME_IDS.indexOf(this.game);
    for (let i = 0; i < GAME_IDS.length; i++) {
      r.fill(i === gi ? C.white : C.indigo, Math.round(cx - dotsW / 2 + i * 3 * dot), y + cardH - 3 * dot, 2 * dot, dot);
    }
    y += cardH + gap;

    const playW = Math.min(cardW, r.font.width(t.play, u) + 40 * u);
    r.button(setRect(this.play, cx - playW / 2, y, playW, rowH), t.play, 'primary', u, this.focus === PLAY);
    y += rowH + 2 * gap;

    // small buttons: icon and short label
    const bw = Math.max(r.font.width(t.missions, u) + ICON * u + 8 * u, 0);
    const totalW = BOTTOM_ITEMS.length * bw + (BOTTOM_ITEMS.length - 1) * gap;
    const scale = totalW > W - 2 * margin ? 0 : 1;
    const itemW = scale ? bw : Math.floor((W - 2 * margin - (BOTTOM_ITEMS.length - 1) * gap) / BOTTOM_ITEMS.length);
    const rowW = BOTTOM_ITEMS.length * itemW + (BOTTOM_ITEMS.length - 1) * gap;
    // centered under the card, but never past the screen edges
    const startX = Math.round(Math.max(margin, Math.min(cx - rowW / 2, W - margin - rowW)));
    // labels show only when every one of them fits, so the three buttons always look alike
    const iconS = Math.max(1, Math.floor((rowH - 2 * u) / ICON));
    let fits = true;
    for (let i = 0; i < BOTTOM_ITEMS.length; i++) {
      if (ICON * iconS + 3 * u + r.font.width(t[BOTTOM_ITEMS[i].label], u) > itemW - 4 * u) fits = false;
    }
    for (let i = 0; i < BOTTOM_ITEMS.length; i++) {
      const rect = setRect(this.bottom[i], startX + i * (itemW + gap), y, itemW, rowH);
      r.button(rect, '', 'normal', u, this.focus === BOTTOM && this.col === i);
      const label = t[BOTTOM_ITEMS[i].label];
      const contentW = ICON * iconS + 3 * u + r.font.width(label, u);
      const ix = fits ? rect.x + (itemW - contentW) / 2 : rect.x + (itemW - ICON * iconS) / 2;
      r.icon(BOTTOM_ITEMS[i].icon, ix, rect.y + (rowH - ICON * iconS) / 2, iconS);
      if (fits) r.text(label, ix + ICON * iconS + 3 * u, rect.y + Math.round((rowH - GLYPH_H * u) / 2), C.white, u);
    }
  }

  /** Best score of the selected game, top-right. */
  private drawBest(margin: number, right: number): void {
    const { r, profile } = this.ctx;
    const u = r.u;
    const adv = ADVANCE * u;
    const best = this.game === 'runner' ? profile.best[profile.sport] : profile.gameBest(this.game);
    if (best <= 0 || this.game === 'aquarium') return;
    let x: number;
    if (LOWER_IS_BETTER.has(this.game)) {
      const cents = Math.round(best * 100);
      const whole = Math.floor(cents / 100);
      const wd = Math.max(2, digitCount(whole));
      x = right - (wd + 3) * adv + u;
      r.number(whole, wd, x, margin, C.skyPale, u);
      r.text('.', x + wd * adv, margin, C.skyPale, u);
      r.number(cents % 100, 2, x + (wd + 1) * adv, margin, C.skyPale, u);
    } else {
      const digits = Math.max(5, digitCount(best));
      x = right - digits * adv + u;
      r.number(best, digits, x, margin, C.skyPale, u);
    }
    r.text(t.hi, x - 3 * adv, margin, C.skyPale, u);
  }
}
