import { Rng } from '../core/rng.ts';
import { isGameKey } from '../core/input.ts';
import { CHARACTERS, defaultConfig, randomize, type CharacterId } from '../custom/athlete.ts';
import { WING } from '../game/config.ts';
import { Game } from '../game/game.ts';
import { nextMultiplier } from '../game/score.ts';
import { SPORTS, type SportId } from '../game/sport.ts';
import { t } from '../i18n/strings.ts';
import { ADVANCE, GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { HORIZON_ABOVE_SEA, inside, lerp, newRect, setRect } from '../render/renderer.ts';
import type { AthleteSprites } from '../sprites/sheet.ts';
import type { Context, Screen } from './screen.ts';

/** Seconds the sport hints stay on screen at the start of a run. */
const HINT_TIME = 4;
/** Random rival looks prepared per sport; each run shows two of them. */
const RIVAL_LOOKS = 4;

/**
 * The run itself: one Game per sport, the HUD, the pause menu and the
 * wipeout screen. Any tap or Space that is not on a button is the game's
 * single button.
 */
export class PlayScreen implements Screen {
  private readonly games = {} as Record<SportId, Game>;
  private readonly rivalPool = {} as Record<SportId, AthleteSprites[]>;
  private readonly rivals: AthleteSprites[] = [];
  private readonly rng = new Rng((Date.now() & 0x7fffffff) || 7);
  private game!: Game;
  private pressed = false;
  private lastPhase: Game['phase'] = 'ready';
  private readonly pauseRect = newRect();
  private readonly hintRect = newRect();
  private readonly leftRect = newRect();
  private readonly rightRect = newRect();
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
    for (const sport of SPORTS) {
      this.games[sport] = new Game(sport, ctx.profile.best[sport], {
        onGameOver: (_score, best) => {
          if (best > ctx.profile.best[sport]) ctx.profile.setBest(sport, best);
        },
      });
    }
  }

  get current(): Game {
    return this.game;
  }

  setViewWidth(width: number): void {
    for (const sport of SPORTS) this.games[sport].setViewWidth(width);
  }

  enter(): void {
    const sport = this.ctx.profile.sport;
    this.game = this.games[sport];
    this.game.best = Math.max(this.game.best, this.ctx.profile.best[sport]);
    this.game.setViewWidth(this.ctx.r.W || 480);
    this.prepareRivals(sport);
    this.newRun();
    this.game.start();
    this.lastPhase = this.game.phase;
    this.pressed = false;
  }

  blur(): void {
    this.game.pause();
  }

  /** Random looks for the surfers and kiters met on the water, built once per sport. */
  private prepareRivals(sport: SportId): void {
    if (this.rivalPool[sport] || sport === 'wing') return;
    const pool: AthleteSprites[] = [];
    for (let i = 0; i < RIVAL_LOOKS; i++) {
      const look = defaultConfig(CHARACTERS[i % CHARACTERS.length], sport);
      randomize(look, sport, this.rng);
      pool.push(this.ctx.sprites(look, sport, false));
    }
    this.rivalPool[sport] = pool;
  }

  private newRun(): void {
    const pool = this.rivalPool[this.game.sport];
    this.rivals.length = 0;
    if (!pool) return;
    const a = Math.floor(this.rng.next() * pool.length);
    const b = (a + 1 + Math.floor(this.rng.next() * (pool.length - 1))) % pool.length;
    this.rivals.push(pool[a], pool[b]);
  }

  private home(): void {
    this.ctx.go('home');
  }

  key(code: string): void {
    const g = this.game;
    if (code === 'Escape') {
      if (g.phase === 'running') g.pause();
      else this.home();
    } else if (code === 'Enter' && g.phase !== 'running') {
      this.pressed = true;
    } else if (isGameKey(code)) {
      this.pressed = true;
    }
  }

  tap(x: number, y: number): boolean {
    const g = this.game;
    if (g.phase === 'running' && inside(this.pauseRect, x, y)) {
      g.pause();
      return true;
    }
    if (g.phase === 'paused' || (g.phase === 'over' && g.overTime >= g.cfg.restartDelay)) {
      if (inside(this.rightRect, x, y)) {
        this.home();
        return true;
      }
      if (inside(this.leftRect, x, y)) {
        this.pressed = true;
        return true;
      }
    }
    this.pressed = true;
    return false;
  }

  update(dt: number): void {
    const g = this.game;
    g.update(dt, this.pressed, this.ctx.input.held);
    this.pressed = false;
    if (this.lastPhase === 'over' && g.phase === 'running') this.newRun();
    this.lastPhase = g.phase;
  }

  render(alpha: number): void {
    const { r } = this.ctx;
    const g = this.game;
    const sport = g.sport;
    const cfg = g.cfg;
    const distance = lerp(g.prevDistance, g.distance, alpha);
    g.setViewWidth(r.W);

    r.backdrop(distance);
    if (g.perfectWave > 0) r.perfectWave(cfg.playerX, g.perfectWave < 1 && Math.floor(g.clock * 8) % 2 === 0);
    if (g.gustTime > 0 || g.gustJump) r.windLines(g.clock);
    r.obstacles(g.obstacles.items, alpha, g.clock, this.rivals);
    const p = g.power;
    if (p.active) r.powerUp(p.kind, lerp(p.prevX, p.x, alpha), p.y, g.clock);
    const blink = g.grace > 0 && Math.floor(g.clock * 12) % 2 === 1;
    if (!blink) r.athlete(this.ctx.player(), sport, g.athlete, cfg.playerX, alpha, g.clock, 1, r.seaY, cfg.playerW);
    r.surfaceFront(distance);
    this.hud();
  }

  private hud(): void {
    const { r } = this.ctx;
    const g = this.game;
    const { W, u, seaY } = r;
    const adv = ADVANCE * u;
    const margin = 6;
    const lineH = (GLYPH_H + 4) * u;
    const points = g.points;
    r.scoreLine(points, g.best, true);

    // pause button, top-left
    const size = (GLYPH_H + 7) * u;
    if (g.phase === 'running') r.pauseButton(setRect(this.pauseRect, margin, margin, size, size), u);
    else setRect(this.pauseRect, 0, 0, 0, 0);

    const row2 = margin + lineH;
    if (g.phase === 'running' && g.score.combo > 0) {
      r.text('x', W - margin - 2 * adv + u, row2, C.gold, u);
      r.number(nextMultiplier(g.score), 1, W - margin - adv + u, row2, C.gold, u);
    }
    if (g.popupTime > 0) {
      const rise = Math.round((0.9 - g.popupTime) * 20);
      const y = seaY - Math.round(g.athlete.y) - g.cfg.playerH - 14 - GLYPH_H * u - rise;
      const x = g.cfg.playerX;
      r.text('+', x, y, C.gold, u);
      r.number(g.popupPoints, digitCount(g.popupPoints), x + adv, y, C.gold, u);
      if (g.popupSpins > 1) {
        r.text('x', x, y - lineH, C.sun, u);
        r.number(g.popupSpins, 1, x + adv, y - lineH, C.sun, u);
        r.text(t.spins, x + 3 * adv, y - lineH, C.sun, u);
      }
    }

    // power-up label and time bar
    let y = row2 + lineH;
    const powerLabel = g.perfectWave > 0 ? t.power.wave : g.gustTime > 0 || g.gustJump ? t.power.gust : '';
    if (powerLabel) {
      const color = g.perfectWave > 0 ? C.sun : C.white;
      r.centered(powerLabel, W / 2, y, color, u);
      const left = g.perfectWave > 0 ? g.perfectWave / g.cfg.perfectWaveTime : g.gustTime > 0 ? g.gustTime / WING.gustTime : 1;
      const full = 60 * u;
      const x = Math.floor((W - full) / 2);
      const barY = y + (GLYPH_H + 3) * u;
      r.fill(C.navy, x, barY, full, 2 * u + 1);
      r.fill(color, x, barY, Math.ceil(left * full), 2 * u);
      y = barY + 4 * u;
    }

    const horizon = seaY - HORIZON_ABOVE_SEA;
    const mid = Math.floor(horizon / 2);
    switch (g.phase) {
      case 'running':
        if (g.time < HINT_TIME && !powerLabel) {
          // on a panel, so the hints read over the kite and the clouds
          // in landscape they sit right of the athlete, clear of the kite
          const hints = t.hints[g.sport];
          const left = W > r.H ? g.cfg.playerX + 72 : 0;
          const cx = (left + W) / 2;
          const maxW = W - left - 16 * u;
          const h = r.lineHeight(hints[0], u, maxW) + r.lineHeight(hints[1], u, maxW);
          const w = Math.min(W - left - 8 * u, Math.max(r.font.width(hints[0], u), r.font.width(hints[1], u)) + 8 * u);
          let hy = Math.max(y + lineH, mid - lineH);
          r.panel(setRect(this.hintRect, cx - w / 2, hy - 3 * u, w, h + 3 * u));
          hy += r.centered(hints[0], cx, hy, C.white, u, maxW);
          r.centered(hints[1], cx, hy, C.sun, u, maxW);
        }
        break;
      case 'paused': {
        let py = mid - 20 * u;
        py += r.centered(t.paused, W / 2, py, C.white, 2 * u) + 4 * u;
        this.buttons(py, t.resume);
        break;
      }
      case 'over': {
        let oy = Math.max(row2 + lineH, mid - 36 * u);
        oy += r.centered(t.wipeout, W / 2, oy, C.white, 2 * u);
        const who = WHO[this.ctx.profile.rider][g.sport];
        oy += r.centered(who, W / 2, oy, C.skyPale, u) + u;
        const scoreDigits = digitCount(points);
        r.number(points, scoreDigits, Math.floor((W - r.font.widthOf(scoreDigits, 2 * u)) / 2), oy, C.sun, 2 * u);
        oy += (GLYPH_H + 4) * 2 * u;
        if (g.newBest) oy += r.centered(t.newBest, W / 2, oy, C.gold, u);
        if (g.overTime >= g.cfg.restartDelay) {
          this.buttons(oy + 2 * u, t.again);
        } else {
          setRect(this.leftRect, 0, 0, 0, 0);
          setRect(this.rightRect, 0, 0, 0, 0);
        }
        break;
      }
      case 'ready':
        break;
    }
  }

  /** [primary] [HOME] centered at y. */
  private buttons(y: number, primary: string): void {
    const { r } = this.ctx;
    const u = r.u;
    const h = (GLYPH_H + 7) * u;
    const w = Math.max(r.font.width(primary, u), r.font.width(t.home, u)) + 14 * u;
    const gap = 4 * u;
    r.button(setRect(this.leftRect, r.W / 2 - gap / 2 - w, y, w, h), primary, 'primary', u);
    r.button(setRect(this.rightRect, r.W / 2 + gap / 2, y, w, h), t.home, 'normal', u);
  }
}

/** "BOBBA - KITESURF" for every rider and sport, built once. */
const WHO = {} as Record<CharacterId, Record<SportId, string>>;
for (const ch of CHARACTERS) {
  WHO[ch] = {} as Record<SportId, string>;
  for (const sport of SPORTS) WHO[ch][sport] = `${t.characters[ch]} - ${t.sports[sport]}`;
}
