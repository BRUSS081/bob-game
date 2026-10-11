import {
  BOARDS,
  NICK_CHARS,
  NICK_MAX,
  PERIODS,
  nicknameProblem,
  type Board,
  type NickProblem,
  type Period,
} from '../../supabase/functions/_shared/rules.ts';
import { isSport } from '../game/sport.ts';
import { t } from '../i18n/strings.ts';
import { ADVANCE, GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { inside, newRect, setRect, type Rect } from '../render/renderer.ts';
import { DemoPilot, type Context, type Screen } from './screen.ts';

const SPORT = 0;
const PERIOD = 1;
const LIST = 2;
const BUTTONS = 3;
const ROWS = 4;

/** Nickname pad: the allowed characters, then delete and OK. */
const DEL = NICK_CHARS.length;
const OK = NICK_CHARS.length + 1;

/**
 * The global leaderboard: one board per sport, all time or this week, the
 * top places and your own; the nickname is typed here, on the keyboard or
 * on an arcade-style pad (phones have no keyboard in a canvas).
 */
export class RanksScreen implements Screen {
  private focus = SPORT;
  private col = 0;
  private scroll = 0;
  private board: Board = 'surf';
  private period: Period = 'all';
  private editing = false;
  private draft = '';
  private problem: NickProblem | null = null;
  private pad = 0;
  private padCols = 10;
  private visible = 1;
  private nickLabel = '';
  private clock = 0;
  private distance = 0;
  private readonly pilot = new DemoPilot();
  private readonly sportPrev = newRect();
  private readonly sportNext = newRect();
  private readonly periods: Rect[] = PERIODS.map(newRect);
  private readonly list = newRect();
  private readonly nickButton = newRect();
  private readonly done = newRect();
  private readonly keys: Rect[] = [];
  private readonly panel = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
    for (let i = 0; i <= OK; i++) this.keys.push(newRect());
  }

  enter(): void {
    const sport = this.ctx.profile.sport;
    this.board = isSport(sport) ? sport : 'surf';
    this.focus = SPORT;
    this.scroll = 0;
    this.editing = false;
    this.updateLabel();
    this.pilot.reset();
    this.ctx.demo(this.ctx.profile.sport).reset();
    this.refresh(false);
  }

  blur(): void {}

  private updateLabel(): void {
    const nick = this.ctx.profile.nickname;
    this.nickLabel = nick ? `${t.ranks.nickname}: ${nick}` : t.ranks.setNick;
  }

  private refresh(force: boolean): void {
    const ranks = this.ctx.ranks;
    void ranks.client.load(this.board, this.period, ranks.player, force);
  }

  private setBoard(step: number): void {
    const i = BOARDS.indexOf(this.board);
    this.board = BOARDS[(i + step + BOARDS.length) % BOARDS.length];
    this.scroll = 0;
    this.refresh(false);
  }

  private setPeriod(p: Period): void {
    this.period = p;
    this.scroll = 0;
    this.refresh(false);
  }

  private get maxScroll(): number {
    return Math.max(0, this.ctx.ranks.client.view(this.board, this.period).top.length - this.visible);
  }

  // ------------------------------------------------------------ nickname

  private startEdit(): void {
    this.editing = true;
    this.draft = this.ctx.profile.nickname;
    this.problem = null;
    this.pad = 0;
  }

  private type(ch: string): void {
    if (this.draft.length < NICK_MAX) this.draft += ch;
    this.problem = null;
  }

  private confirm(): void {
    this.problem = nicknameProblem(this.draft);
    if (this.problem !== null) return;
    this.ctx.profile.setNickname(this.draft);
    this.editing = false;
    this.updateLabel();
    const ranks = this.ctx.ranks;
    // runs that ended without a nickname go now
    void ranks.flush().then(() => this.refresh(true));
  }

  private pressPad(i: number): void {
    if (i === DEL) {
      this.draft = this.draft.slice(0, -1);
      this.problem = null;
    } else if (i === OK) this.confirm();
    else this.type(NICK_CHARS[i]);
  }

  private editKey(code: string): void {
    if (code.startsWith('Key') && code.length === 4) this.type(code[3]);
    else if (code.startsWith('Digit') && code.length === 6) this.type(code[5]);
    else if (code.startsWith('Numpad') && code.length === 7 && code[6] >= '0' && code[6] <= '9') this.type(code[6]);
    else if (code === 'Minus') this.type('_');
    else if (code === 'Backspace') this.pressPad(DEL);
    else if (code === 'Enter') this.confirm();
    else if (code === 'Escape') this.editing = false;
    else if (code === 'Space') this.pressPad(this.pad);
    else if (code === 'ArrowLeft') this.pad = (this.pad + OK) % (OK + 1);
    else if (code === 'ArrowRight') this.pad = (this.pad + 1) % (OK + 1);
    else if (code === 'ArrowUp') this.pad = this.pad >= DEL ? NICK_CHARS.length - 1 : Math.max(0, this.pad - this.padCols);
    else if (code === 'ArrowDown') this.pad = this.pad >= DEL ? this.pad : this.pad + this.padCols >= NICK_CHARS.length ? DEL : this.pad + this.padCols;
  }

  // ------------------------------------------------------------- input

  key(code: string): void {
    if (this.editing) {
      this.editKey(code);
      return;
    }
    switch (code) {
      case 'ArrowUp':
        if (this.focus === LIST && this.scroll > 0) this.scroll--;
        else this.focus = Math.max(0, this.focus - 1);
        break;
      case 'ArrowDown':
        if (this.focus === LIST && this.scroll < this.maxScroll) this.scroll++;
        else this.focus = Math.min(BUTTONS, this.focus + 1);
        break;
      case 'Tab':
        this.focus = (this.focus + 1) % ROWS;
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const step = code === 'ArrowLeft' ? -1 : 1;
        if (this.focus === SPORT || this.focus === LIST) this.setBoard(step);
        else if (this.focus === PERIOD) this.setPeriod(this.period === 'all' ? 'week' : 'all');
        else this.col = 1 - this.col;
        break;
      }
      case 'Space':
      case 'Enter':
        if (this.focus === SPORT) this.setBoard(1);
        else if (this.focus === PERIOD) this.setPeriod(this.period === 'all' ? 'week' : 'all');
        else if (this.focus === BUTTONS) {
          if (this.col === 0) this.startEdit();
          else this.ctx.go('home');
        }
        break;
      case 'Escape':
        this.ctx.go('home');
        break;
    }
  }

  tap(x: number, y: number): boolean {
    if (this.editing) {
      for (let i = 0; i <= OK; i++) {
        if (inside(this.keys[i], x, y)) {
          this.pad = i;
          this.pressPad(i);
          return true;
        }
      }
      // a tap outside the pad closes it
      if (!inside(this.panel, x, y)) this.editing = false;
      return true;
    }
    if (inside(this.sportPrev, x, y)) this.setBoard(-1);
    else if (inside(this.sportNext, x, y)) this.setBoard(1);
    else if (inside(this.periods[0], x, y)) this.setPeriod('all');
    else if (inside(this.periods[1], x, y)) this.setPeriod('week');
    else if (inside(this.nickButton, x, y)) this.startEdit();
    else if (inside(this.done, x, y)) this.ctx.go('home');
    else if (inside(this.list, x, y)) {
      // the top half scrolls up a page, the bottom half down
      const page = Math.max(1, this.visible - 1);
      if (y < this.list.y + this.list.h / 2) this.scroll = Math.max(0, this.scroll - page);
      else this.scroll = Math.min(this.maxScroll, this.scroll + page);
    } else return false;
    return true;
  }

  update(dt: number): void {
    this.clock += dt;
    this.distance += 60 * dt;
    this.pilot.update(this.ctx.demo(this.ctx.profile.sport), dt);
  }

  // ------------------------------------------------------------ drawing

  render(alpha: number): void {
    const { r, profile } = this.ctx;
    const { W, H, u } = r;
    const landscape = W >= H * 1.25;
    const margin = 6;
    const sport = profile.sport;
    r.backdrop(this.distance);
    r.athlete(this.ctx.player(), sport, this.ctx.demo(sport), landscape ? Math.round(W * 0.12) : Math.round(W / 2 - 8), alpha, this.clock);
    r.surfaceFront(this.distance);
    r.weatherFront(this.distance);

    const words = t.ranks;
    const rowH = (GLYPH_H + 7) * u;
    const lineH = (GLYPH_H + 5) * u;
    const gap = 3 * u;
    const panelW = Math.min(W - 2 * margin, 230 * u);
    const cx = landscape ? Math.min(W - margin - Math.round(panelW / 2), Math.round(W * 0.6)) : Math.round(W / 2);
    const left = cx - Math.round(panelW / 2);
    let y = margin;

    // title, a big one when there is room, none on short landscape phones
    const short = H < 160 * u;
    const titleScale = H >= 200 * u ? 2 * u : u;
    if (!short) y += r.centered(words.title, cx, y, C.white, titleScale) + gap;

    // sport selector and period tabs: one row when they fit, two otherwise
    const arrowW = 12 * u;
    let nameW = 0;
    for (const b of BOARDS) nameW = Math.max(nameW, r.font.width(t.sports[b], u));
    nameW += 10 * u;
    const selW = nameW + 2 * (arrowW + u);
    // short tab names when the long ones would push the tabs to a second row
    let longW = 0;
    for (const p of PERIODS) longW = Math.max(longW, r.font.width(p === 'all' ? words.allTime : words.week, u));
    const shortTabs = short && selW + 4 * u + 2 * (longW + 10 * u) + gap > panelW;
    let tabW = 0;
    for (const p of PERIODS) tabW = Math.max(tabW, r.font.width(this.tabName(p, shortTabs), u));
    tabW += 10 * u;
    const tabsW = 2 * tabW + gap;
    const oneRow = selW + 4 * u + tabsW <= panelW;
    const selX = oneRow ? left : cx - Math.round(selW / 2);
    setRect(this.sportPrev, selX, y, arrowW, rowH);
    setRect(this.sportNext, selX + selW - arrowW, y, arrowW, rowH);
    r.arrowButton(this.sportPrev, -1, u, this.focus === SPORT);
    r.arrowButton(this.sportNext, 1, u, this.focus === SPORT);
    const box = setRect(scratch, selX + arrowW + u, y, nameW, rowH);
    r.panel(box, this.focus === SPORT ? C.indigo : C.navy);
    r.centered(t.sports[this.board], box.x + nameW / 2, y + Math.round((rowH - GLYPH_H * u) / 2), C.sun, u);
    if (!oneRow) y += rowH + gap;
    const tabsX = oneRow ? left + panelW - tabsW : cx - Math.round(tabsW / 2);
    for (let i = 0; i < PERIODS.length; i++) {
      const p = PERIODS[i];
      const rect = setRect(this.periods[i], tabsX + i * (tabW + gap), y, tabW, rowH);
      r.button(rect, this.tabName(p, shortTabs), p === this.period ? 'selected' : 'normal', u, this.focus === PERIOD && p === this.period);
    }
    y += rowH + gap;

    // the list, then your place and the buttons
    const footer = lineH + gap + rowH;
    const listH = Math.max(lineH + 4 * u, H - margin - footer - gap - y);
    setRect(this.list, left, y, panelW, listH);
    r.panel(this.list, this.focus === LIST ? C.indigo : C.navy);
    this.visible = Math.max(1, Math.floor((listH - 4 * u) / lineH));
    this.scroll = Math.min(this.scroll, this.maxScroll);
    this.drawList(left, y, panelW, listH, lineH);
    y += listH + gap;

    this.drawMe(cx, y);
    y += lineH;
    const bw2 = r.font.width(t.done, u) + 16 * u;
    const bw1 = Math.min(panelW - bw2 - gap, r.font.width(this.nickLabel, u) + 12 * u);
    const bx = cx - Math.round((bw1 + gap + bw2) / 2);
    r.button(setRect(this.nickButton, bx, y, bw1, rowH), this.nickLabel, 'normal', u, this.focus === BUTTONS && this.col === 0);
    r.button(setRect(this.done, bx + bw1 + gap, y, bw2, rowH), t.done, 'primary', u, this.focus === BUTTONS && this.col === 1);

    if (this.editing) this.drawPad(cx, panelW);
  }

  private tabName(p: Period, short: boolean): string {
    const words = t.ranks;
    if (p === 'all') return short ? words.allShort : words.allTime;
    return short ? words.weekShort : words.week;
  }

  private drawList(x: number, y: number, w: number, h: number, lineH: number): void {
    const { r } = this.ctx;
    const u = r.u;
    const ranks = this.ctx.ranks;
    const view = ranks.client.view(this.board, this.period);
    const words = t.ranks;
    const msgY = y + Math.round(h / 2 - (GLYPH_H * u) / 2);
    if (view.status === 'off') {
      r.centered(words.soon, x + w / 2, msgY, C.skyPale, u, w - 8 * u);
      return;
    }
    if (view.status === 'offline') {
      r.centered(words.offline, x + w / 2, msgY, C.skyPale, u);
      return;
    }
    if (view.top.length === 0) {
      r.centered(view.status === 'ready' ? words.empty : words.loading, x + w / 2, msgY, C.skyPale, u, w - 8 * u);
      return;
    }
    const adv = ADVANCE * u;
    const rankX = x + 4 * u;
    const nickX = rankX + 4 * adv;
    const right = x + w - 4 * u;
    // BOB / BOBBA next to the nickname when the row is wide enough
    const riderX = nickX + (NICK_MAX + 1) * adv;
    const showRider = riderX + 6 * adv + 7 * adv <= right;
    let rank = 1;
    for (let i = 0; i < view.top.length; i++) {
      // ties share a place
      if (i > 0 && view.top[i].score < view.top[i - 1].score) rank = i + 1;
      const row = i - this.scroll;
      if (row < 0) continue;
      if (row >= this.visible) break;
      const e = view.top[i];
      const ry = y + 2 * u + row * lineH;
      const mine = ranks.player !== '' && e.player === ranks.player;
      if (mine) r.fill(C.indigo, x + u, ry, w - 2 * u, lineH - u);
      const ty = ry + Math.round((lineH - GLYPH_H * u) / 2);
      const color = mine ? C.sun : rank <= 3 ? C.gold : C.white;
      r.text('#', rankX, ty, C.skyPale, u);
      r.number(rank, digitCount(rank), rankX + adv, ty, color, u);
      r.text(e.nickname, nickX, ty, color, u);
      if (showRider) r.text(t.characters[e.rider], riderX, ty, C.skyPale, u);
      const d = digitCount(e.score);
      r.number(e.score, d, right - r.font.widthOf(d, u), ty, color, u);
    }
    // more above or below: small arrows on the right edge
    if (this.scroll > 0) this.tri(x + w - 6 * u, y + 2 * u, -1);
    if (this.scroll < this.maxScroll) this.tri(x + w - 6 * u, y + h - 5 * u, 1);
  }

  private tri(x: number, y: number, dir: -1 | 1): void {
    const r = this.ctx.r;
    const u = r.u;
    for (let i = 0; i < 3; i++) {
      const row = dir < 0 ? i : 2 - i;
      r.fill(C.skyPale, x + (2 - i) * u, y + row * u, (2 * i + 1) * u, u);
    }
  }

  /** "YOU #12  01234", or no score yet. */
  private drawMe(cx: number, y: number): void {
    const { r } = this.ctx;
    const u = r.u;
    const words = t.ranks;
    const view = this.ctx.ranks.client.view(this.board, this.period);
    if (view.status !== 'ready') return;
    const adv = ADVANCE * u;
    const me = view.me;
    if (!me) {
      r.centered(words.noScore, cx, y, C.skyPale, u);
      return;
    }
    const rd = digitCount(me.rank);
    const sd = digitCount(me.score);
    const w = r.font.width(words.you, u) + adv + (rd + 1) * adv + 2 * adv + sd * adv;
    let x = Math.round(cx - w / 2);
    r.text(words.you, x, y, C.sun, u);
    x += r.font.width(words.you, u) + adv;
    r.text('#', x, y, C.sun, u);
    r.number(me.rank, rd, x + adv, y, C.sun, u);
    x += (rd + 1) * adv + 2 * adv;
    r.number(me.score, sd, x, y, C.white, u);
  }

  /** The nickname pad over everything. */
  private drawPad(cx: number, panelW: number): void {
    const { r } = this.ctx;
    const { H, u } = r;
    const words = t.ranks;
    const keyW = 12 * u;
    const keyH = (GLYPH_H + 6) * u;
    const gap = 2 * u;
    const cols = Math.max(6, Math.min(13, Math.floor((panelW - 8 * u + gap) / (keyW + gap))));
    this.padCols = cols;
    const rows = Math.ceil(NICK_CHARS.length / cols);
    const gridW = cols * keyW + (cols - 1) * gap;
    const lineH = (GLYPH_H + 4) * u;
    const h = 6 * u + lineH * 3 + rows * (keyH + gap) + keyH + 6 * u;
    const w = gridW + 12 * u;
    const top = Math.max(4, Math.round((H - h) / 2));
    setRect(this.panel, cx - Math.round(w / 2), top, w, h);
    r.panel(this.panel, C.navy);
    let y = top + 6 * u;
    y += r.centered(words.nickname, cx, y, C.skyPale, u);
    // the name so far, with a blinking cursor
    const adv = ADVANCE * u;
    const nameW = r.font.width(this.draft, u);
    const nx = Math.round(cx - (nameW + adv) / 2);
    r.text(this.draft, nx, y, C.sun, u);
    if (Math.floor(this.clock * 2) % 2 === 0) r.fill(C.white, nx + nameW + u, y, 4 * u, GLYPH_H * u);
    y += lineH;
    const note = this.problem === 'rude' ? words.rude : this.problem !== null ? words.short : words.hint;
    r.centered(note, cx, y, this.problem !== null ? C.coral : C.grey, u, w - 8 * u);
    y += lineH;
    const gx = cx - Math.round(gridW / 2);
    for (let i = 0; i < NICK_CHARS.length; i++) {
      const kx = gx + (i % cols) * (keyW + gap);
      const ky = y + Math.floor(i / cols) * (keyH + gap);
      r.button(setRect(this.keys[i], kx, ky, keyW, keyH), NICK_CHARS[i], 'normal', u, this.pad === i);
    }
    y += rows * (keyH + gap);
    const half = Math.round((gridW - gap) / 2);
    r.button(setRect(this.keys[DEL], gx, y, half, keyH), words.del, 'normal', u, this.pad === DEL);
    r.button(setRect(this.keys[OK], gx + half + gap, y, gridW - half - gap, keyH), words.ok, 'primary', u, this.pad === OK);
  }
}

const scratch = newRect();
