import { STEP } from '../core/loop.ts';
import { Rng } from '../core/rng.ts';
import { isGameKey } from '../core/input.ts';
import { CHARACTERS, defaultConfig, randomize, type CharacterId } from '../custom/athlete.ts';
import type { Mission, RunResult } from '../custom/missions.ts';
import type { DailyRecord } from '../custom/profile.ts';
import type { AthleteState } from '../game/athletes.ts';
import { dailySeed, dayKey } from '../game/daily.ts';
import { GHOST_AIR, GHOST_CRASH, GHOST_RIDE, GhostTrack, newGhostSample } from '../game/ghost.ts';
import { WING } from '../game/config.ts';
import { Game, POPUP_TIME } from '../game/game.ts';
import { nextMultiplier } from '../game/score.ts';
import { SPORTS, type SportId } from '../game/sport.ts';
import { t } from '../i18n/strings.ts';
import { ADVANCE, GLYPH_H, digitCount } from '../render/font.ts';
import { C } from '../render/palette.ts';
import { HORIZON_ABOVE_SEA, inside, lerp, newRect, setRect, type PoseView } from '../render/renderer.ts';
import { GEAR_COLORS } from '../sprites/ramps.ts';
import type { AthleteSprites } from '../sprites/sheet.ts';
import { sharePostcard } from './postcard.ts';
import type { Context, Screen } from './screen.ts';
import { Tutorial } from './tutorial.ts';

/** Freeze frame and screen shake when wiping out. */
const HIT_STOP = 0.08;
const SHAKE_TIME = 0.35;
/** Seconds the combo multiplier pulses after it grows. */
const COMBO_FLASH = 0.6;
/** Random rival looks prepared per sport; each run shows two of them. */
const RIVAL_LOOKS = 4;
/** Seconds the mission banner stays up. */
const BANNER_TIME = 2.5;
/** The ghost stays this long after its run ended, sinking. */
const GHOST_LINGER = 1.5;

/** Pose of the ghost, filled from its recording every frame. */
class GhostPose implements PoseView {
  state: AthleteState = 'ride';
  y = 0;
  prevY = 0;
  rotation = 0;
  prevRotation = 0;
  stateTime = 1;
}

/**
 * The run itself: one Game per sport, the HUD, the pause menu and the
 * wipeout screen. Any tap or Space that is not on a button is the game's
 * single button.
 */
export class PlayScreen implements Screen {
  /** Today's daily challenge instead of a random run (set before entering). */
  daily = false;
  private dailyRecord: DailyRecord = { day: '', best: 0, ghost: '' };
  private newDailyBest = false;
  private readonly recording = new GhostTrack();
  private readonly ghost = new GhostTrack();
  private readonly ghostSample = newGhostSample();
  private readonly ghostPose = new GhostPose();
  private readonly result: RunResult;
  private readonly completed: Mission[] = [];
  /** Missions completed during this run, shown on the wipeout screen. */
  private readonly runMissions: Mission[] = [];
  private banner: Mission | null = null;
  private bannerTime = 0;
  private readonly tutorial = new Tutorial();
  private hitStop = 0;
  private shake = 0;
  private frame = 0;
  private comboFlash = 0;
  private lastCombo = 0;
  private sharing = false;
  private readonly shareRect = newRect();
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
    this.result = { sport: 'surf', points: 0, daily: false, stats: { tricks: 0, bestCombo: 0, maxSpins: 0, closeCalls: 0, overs: 0, powerUps: 0, maxFlow: 0, dolphins: 0 } };
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

  enter(): void {
    const sport = this.ctx.profile.sport;
    this.game = this.games[sport];
    this.game.best = Math.max(this.game.best, this.ctx.profile.best[sport]);
    this.prepareRivals(sport);
    this.result.sport = sport;
    this.result.daily = this.daily;
    this.result.stats = this.game.stats;
    if (this.daily) {
      // the same seed for everyone today; restarts replay it, and the ghost is today's best run
      const day = dayKey(new Date());
      const seed = dailySeed(day, sport);
      this.dailyRecord = this.ctx.profile.daily(sport, day);
      if (!this.ghost.decode(this.dailyRecord.ghost)) this.ghost.clear();
      this.game.restartSeed = seed;
      this.game.start(seed);
    } else {
      this.ghost.clear();
      this.game.restartSeed = null;
      this.game.start();
    }
    this.newRun();
    // first run of a sport: learn the controls by doing, shielded
    if (!this.daily && !this.ctx.profile.tutorialDone.has(sport)) {
      this.tutorial.start(sport);
      this.game.shield = true;
    } else {
      this.tutorial.stop();
    }
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
    this.recording.clear();
    this.runMissions.length = 0;
    this.banner = null;
    this.bannerTime = 0;
    this.newDailyBest = false;
    this.hitStop = 0;
    this.shake = 0;
    this.comboFlash = 0;
    this.lastCombo = 0;
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
    if (g.phase === 'over' && g.overTime >= g.cfg.restartDelay && inside(this.shareRect, x, y)) {
      this.share();
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
    if (this.shake > 0) this.shake -= dt;
    if (this.comboFlash > 0) this.comboFlash -= dt;
    // freeze frame right after a wipeout
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.pressed = false;
      return;
    }
    const held = this.ctx.input.held;
    let pressed = this.pressed;
    this.pressed = false;
    if (this.tutorial.active) {
      const wasFrozen = this.tutorial.frozen;
      if (!this.tutorial.beforeStep(g, pressed, held)) return;
      // the press that releases the stop is the jump
      if (wasFrozen) pressed = true;
    }
    g.update(dt, pressed, held);
    this.tutorial.afterStep(g, dt);
    if (this.tutorial.step === 'done') {
      this.tutorial.stop();
      g.shield = false;
      this.ctx.profile.finishTutorial(g.sport);
    }
    if (g.score.combo > this.lastCombo) this.comboFlash = COMBO_FLASH;
    this.lastCombo = g.score.combo;
    if (this.lastPhase === 'running' && g.phase === 'over') {
      this.hitStop = HIT_STOP;
      this.shake = SHAKE_TIME;
    }
    if (this.lastPhase === 'over' && g.phase === 'running') this.newRun();
    if (g.phase === 'running' || (g.phase === 'over' && this.lastPhase === 'running')) {
      this.record();
      this.checkMissions();
    }
    if (this.lastPhase === 'running' && g.phase === 'over') this.runEnded();
    this.lastPhase = g.phase;
    if (this.bannerTime > 0) this.bannerTime -= dt;
  }

  /** One ghost sample per 1/20 s of the run. */
  private record(): void {
    const g = this.game;
    const a = g.athlete;
    const state = a.state === 'crash' ? GHOST_CRASH : a.state === 'air' ? GHOST_AIR : GHOST_RIDE;
    this.recording.record(g.time, g.distance, a.y, a.rotation, state);
  }

  private checkMissions(): void {
    const g = this.game;
    this.result.points = g.points;
    if (this.ctx.missions.check(this.result, this.completed) === 0) return;
    for (let i = 0; i < this.completed.length; i++) this.runMissions.push(this.completed[i]);
    this.banner = this.completed[0];
    this.bannerTime = BANNER_TIME;
  }

  /** A daily run that beats today's best becomes the new ghost. */
  private runEnded(): void {
    const g = this.game;
    if (!this.daily || g.points <= this.dailyRecord.best) return;
    this.newDailyBest = true;
    this.dailyRecord.best = g.points;
    this.dailyRecord.ghost = this.recording.encode();
    this.ctx.profile.saveDaily(g.sport, this.dailyRecord);
    this.ghost.copyFrom(this.recording);
  }

  private share(): void {
    if (this.sharing) return;
    const g = this.game;
    const p = this.ctx.profile;
    this.sharing = true;
    sharePostcard(this.ctx.r, {
      sprites: this.ctx.player(),
      sport: g.sport,
      rider: p.rider,
      points: g.points,
      stats: g.stats,
      day: this.daily ? this.dailyRecord.day : '',
    })
      .catch(() => {})
      .finally(() => {
        this.sharing = false;
      });
  }

  render(alpha: number): void {
    const { r } = this.ctx;
    const g = this.game;
    const sport = g.sport;
    const cfg = g.cfg;
    // nothing moves while the tutorial waits or during the freeze frame
    if (this.tutorial.frozen || this.hitStop > 0) alpha = 1;
    const distance = lerp(g.prevDistance, g.distance, alpha);
    this.frame++;
    const shaking = this.shake > 0;
    if (shaking) {
      const amp = Math.ceil((3 * this.shake) / SHAKE_TIME);
      r.ctx.save();
      r.ctx.translate(((this.frame * 7) % 3) - 1 === 0 ? amp : -amp, ((this.frame * 5) % 3) - 1 === 0 ? -amp : amp);
    }

    r.backdrop(distance);
    if (g.perfectWave > 0) r.perfectWave(cfg.playerX, g.perfectWave < 1 && Math.floor(g.clock * 8) % 2 === 0);
    if (g.gustTime > 0 || g.gustJump) r.windLines(g.clock);
    r.dolphins(g.dolphins, cfg.playerX);
    r.obstacles(g.obstacles.items, alpha, g.clock, this.rivals);
    const p = g.power;
    if (p.active) r.powerUp(p.kind, lerp(p.prevX, p.x, alpha), p.y, g.clock);
    this.drawGhost(distance, alpha);
    const blink = g.grace > 0 && Math.floor(g.clock * 12) % 2 === 1;
    if (!blink) r.athlete(this.ctx.player(), sport, g.athlete, cfg.playerX, alpha, g.clock, 1, r.seaY, cfg.playerW);
    r.surfaceFront(distance);
    if (shaking) r.ctx.restore();
    this.hud();
    this.tutorialPrompt();
  }

  /** The tutorial's big "TAP" or "HOLD" while the game waits, and the flow hint. */
  private tutorialPrompt(): void {
    const tut = this.tutorial;
    if (!tut.frozen && tut.hintTime <= 0) return;
    const { r } = this.ctx;
    const u = r.u;
    const g = this.game;
    let big: string;
    let small: string;
    if (tut.frozen) {
      const press = r.touch ? t.tutorial.tap : t.tutorial.space;
      big = tut.step === 'rise' ? t.tutorial.hold : press;
      small =
        g.sport === 'wing' ? t.tutorial.wingRise : tut.step === 'jump' ? (g.sport === 'surf' ? t.tutorial.surfJump : t.tutorial.kiteJump) : g.sport === 'surf' ? t.tutorial.surfTrick : t.tutorial.kiteSpin;
    } else {
      big = t.tutorial.flow;
      small = t.tutorial.flowHint;
    }
    const bigScale = 3 * u;
    const w = Math.min(r.W - 8 * u, Math.max(r.font.width(big, bigScale), r.font.width(small, u)) + 12 * u);
    const h = (GLYPH_H + 3) * bigScale + r.lineHeight(small, u, w - 8 * u) + 6 * u;
    // in landscape to the right of the athlete, in portrait above it
    const cx = r.W > r.H ? Math.round((g.cfg.playerX + 80 + r.W) / 2) : Math.round(r.W / 2);
    const y = Math.max(40 * u, Math.round((r.seaY - HORIZON_ABOVE_SEA) / 2 - h / 2));
    r.panel(setRect(this.hintRect, cx - w / 2, y, w, h));
    if (!tut.frozen || Math.floor(g.clock * 4) % 2 === 0) r.centered(big, cx, y + 3 * u, C.sun, bigScale);
    r.centered(small, cx, y + 3 * u + (GLYPH_H + 3) * bigScale, C.white, u, w - 8 * u);
  }

  /** Today's best daily run, translucent, at its distance relative to yours. */
  private drawGhost(distance: number, alpha: number): void {
    const g = this.game;
    if (!this.daily || this.ghost.count === 0 || g.phase === 'ready' || g.phase === 'over') return;
    const { r } = this.ctx;
    // where the best run ended
    const end = this.ghost.distance[this.ghost.count - 1];
    const flagX = g.cfg.playerX + g.cfg.playerW / 2 + (end - distance);
    if (flagX > -40 && flagX < r.W + 4) r.bestFlag(flagX, t.ghost);
    const time = g.time - STEP * (1 - alpha);
    const s = this.ghostSample;
    if (!this.ghost.sample(time, s)) return;
    const after = time - this.ghost.duration;
    if (after > GHOST_LINGER) return;
    const x = g.cfg.playerX + Math.round(s.distance - distance);
    if (x < -60 || x > r.W + 40) return;
    const pose = this.ghostPose;
    pose.state = after > 0 || s.state === GHOST_CRASH ? 'crash' : s.state === GHOST_AIR ? 'air' : 'ride';
    pose.y = pose.prevY = s.y;
    pose.rotation = pose.prevRotation = s.rotation;
    pose.stateTime = after > 0 ? after : 1;
    r.ghostAthlete(this.ctx.player(), g.sport, pose, x, g.clock, g.cfg.playerW);
  }

  private hud(): void {
    const { r } = this.ctx;
    const g = this.game;
    const { W, u, seaY } = r;
    const adv = ADVANCE * u;
    const margin = 6;
    const lineH = (GLYPH_H + 4) * u;
    const points = g.points;
    r.scoreLine(points, this.daily ? this.dailyRecord.best : g.best, true);

    // pause button, top-left
    const size = (GLYPH_H + 7) * u;
    if (g.phase === 'running') r.pauseButton(setRect(this.pauseRect, margin, margin, size, size), u);
    else setRect(this.pauseRect, 0, 0, 0, 0);

    // daily challenge tag under the pause button
    if (this.daily) r.text(t.daily, margin, margin + size + 3 * u, C.sun, u);

    const row2 = margin + lineH;
    if (g.phase === 'running' && g.score.combo > 0) {
      // the multiplier pulses bigger for a moment when it grows
      const cs = this.comboFlash > 0 ? 2 * u : u;
      const cadv = ADVANCE * cs;
      const color = this.comboFlash > 0 && Math.floor(this.comboFlash * 10) % 2 === 0 ? C.white : C.gold;
      r.text('x', W - margin - 2 * cadv + cs, row2, color, cs);
      r.number(nextMultiplier(g.score), 1, W - margin - cadv + cs, row2, color, cs);
    }
    // "+points" labels rising over the athlete; older ones sit above newer ones
    const base = seaY - Math.round(g.athlete.y) - g.cfg.playerH - 14 - GLYPH_H * u;
    for (let i = 0; i < g.popups.length; i++) {
      const q = g.popups[i];
      if (!q.active) continue;
      let newer = 0;
      for (let j = 0; j < g.popups.length; j++) if (g.popups[j].active && g.popups[j].time > q.time) newer++;
      const y = base - Math.round((POPUP_TIME - q.time) * 20) - newer * lineH;
      const x = g.cfg.playerX;
      const color = q.kind === 'trick' ? C.gold : q.kind === 'dolphin' ? C.sun : C.white;
      const digits = digitCount(q.points);
      r.text('+', x, y, color, u);
      r.number(q.points, digits, x + adv, y, color, u);
      const after = x + (digits + 2) * adv;
      if (q.kind === 'trick' && q.spins > 1) {
        r.text('x', after, y, C.sun, u);
        r.number(q.spins, 1, after + adv, y, C.sun, u);
        r.text(t.spins, after + 3 * adv, y, C.sun, u);
      } else if (q.kind !== 'trick') {
        r.text(t.popups[q.kind], after, y, color, u);
      }
    }

    // wing foil flow meter, next to the pause button
    if (g.sport === 'wing' && g.phase === 'running') {
      const fx = margin + size + 6 * u;
      const fy = margin + Math.round((size - GLYPH_H * u) / 2);
      const full = g.flow >= 1;
      r.text(t.flow, fx, fy, full ? C.sun : C.white, u);
      const bx = fx + r.font.width(t.flow, u) + 3 * u;
      const bw = 40 * u;
      r.fill(C.navy, bx, fy, bw + 2, GLYPH_H * u);
      r.fill(full && Math.floor(g.clock * 8) % 2 === 0 ? C.white : full ? C.sun : C.aqua, bx + 1, fy + 1, Math.round(g.flow * bw), GLYPH_H * u - 2);
      // ticks at x2 and x3
      r.fill(C.ink, bx + 1 + Math.round(bw / 2), fy, 1, GLYPH_H * u);
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
    if (this.bannerTime > 0 && this.banner && g.phase === 'running') this.missionBanner(y + (powerLabel ? 0 : lineH));
    switch (g.phase) {
      case 'running':
        break;
      case 'paused': {
        // the controls of this sport, as a reminder
        const hints = t.hints[g.sport];
        let py = Math.max(row2 + lineH, mid - 30 * u);
        py += r.centered(t.paused, W / 2, py, C.white, 2 * u) + 2 * u;
        py += r.centered(hints[0], W / 2, py, C.white, u);
        py += r.centered(hints[1], W / 2, py, C.skyPale, u) + 3 * u;
        this.buttons(py, t.resume);
        setRect(this.shareRect, 0, 0, 0, 0);
        break;
      }
      case 'over': {
        const textH = (GLYPH_H + 3) * u;
        const newBest = this.daily ? this.newDailyBest : g.newBest;
        const missions = this.runMissions.length > 0;
        // a smaller title when the screen is short
        // everything but the title, then the title at 2u, or at u when the screen is short
        const rest = textH + u + (GLYPH_H + 4) * 2 * u + (newBest ? textH : 0) + (this.daily ? textH : 0) + (missions ? textH + 2 * u : 0) + 2 * u + (GLYPH_H + 7) * u;
        const title = (GLYPH_H + 3) * 2 * u + rest > r.H - row2 - lineH - margin ? u : 2 * u;
        const blockH = (GLYPH_H + 3) * title + rest;
        let oy = Math.max(row2 + lineH, Math.min(mid - 36 * u, r.H - margin - blockH));
        oy += r.centered(t.wipeout, W / 2, oy, C.white, title);
        const who = WHO[this.ctx.profile.rider][g.sport];
        oy += r.centered(who, W / 2, oy, C.skyPale, u) + u;
        const scoreDigits = digitCount(points);
        r.number(points, scoreDigits, Math.floor((W - r.font.widthOf(scoreDigits, 2 * u)) / 2), oy, C.sun, 2 * u);
        oy += (GLYPH_H + 4) * 2 * u;
        if (newBest) oy += r.centered(t.newBest, W / 2, oy, C.gold, u);
        if (this.daily) {
          // "DAILY BEST 01234"
          const digits = Math.max(5, digitCount(this.dailyRecord.best));
          const lw = r.font.width(t.dailyBest, u) + (digits + 1) * adv;
          const lx = Math.round((W - lw) / 2);
          r.text(t.dailyBest, lx, oy, C.skyPale, u);
          r.number(this.dailyRecord.best, digits, lx + lw - digits * adv, oy, C.skyPale, u);
          oy += textH;
        }
        if (missions) {
          // "MISSION COMPLETE!" and the colors it unlocked
          const sw = 8 * u;
          const n = this.runMissions.length;
          const lw = r.font.width(t.missionComplete, u) + n * (sw + 2 * u) + 2 * u;
          const lx = Math.round((W - lw) / 2);
          r.text(t.missionComplete, lx, oy, C.gold, u);
          for (let i = 0; i < n; i++) r.swatch(GEAR_COLORS[this.runMissions[i].reward], lx + lw - (n - i) * (sw + 2 * u) + 2 * u, oy, sw, GLYPH_H * u);
          oy += textH + 2 * u;
        }
        if (g.overTime >= g.cfg.restartDelay) {
          this.buttons(oy + 2 * u, t.again, true);
        } else {
          setRect(this.leftRect, 0, 0, 0, 0);
          setRect(this.rightRect, 0, 0, 0, 0);
          setRect(this.shareRect, 0, 0, 0, 0);
        }
        break;
      }
      case 'ready':
        break;
    }
  }

  /** "MISSION COMPLETE!" and the mission, on a panel, during the run. */
  private missionBanner(y: number): void {
    const { r } = this.ctx;
    const m = this.banner;
    if (!m) return;
    const u = r.u;
    const text = t.missionText[m.id];
    const sw = 8 * u;
    const w = Math.max(r.font.width(t.missionComplete, u), r.font.width(text, u) + sw + 4 * u) + 8 * u;
    const h = 2 * (GLYPH_H + 3) * u + 4 * u;
    const x = Math.round((r.W - w) / 2);
    // blink at the start so it catches the eye
    if (this.bannerTime > BANNER_TIME - 0.4 && Math.floor(this.bannerTime * 10) % 2 === 0) return;
    r.panel(setRect(this.hintRect, x, y, w, h));
    r.centered(t.missionComplete, r.W / 2, y + 2 * u, C.gold, u);
    const tx = Math.round((r.W - (r.font.width(text, u) + sw + 4 * u)) / 2);
    r.text(text, tx, y + 2 * u + (GLYPH_H + 3) * u, C.white, u);
    r.swatch(GEAR_COLORS[m.reward], tx + r.font.width(text, u) + 4 * u, y + 2 * u + (GLYPH_H + 3) * u, sw, GLYPH_H * u);
  }

  /** [primary] [HOME] (and [SHARE] after a run) centered at y. */
  private buttons(y: number, primary: string, share = false): void {
    const { r } = this.ctx;
    const u = r.u;
    const h = (GLYPH_H + 7) * u;
    const w = Math.max(r.font.width(primary, u), r.font.width(t.home, u), r.font.width(t.share, u)) + 12 * u;
    const gap = 4 * u;
    const total = (share ? 3 : 2) * w + (share ? 2 : 1) * gap;
    const x = Math.round((r.W - total) / 2);
    r.button(setRect(this.leftRect, x, y, w, h), primary, 'primary', u);
    r.button(setRect(this.rightRect, x + w + gap, y, w, h), t.home, 'normal', u);
    if (share) r.button(setRect(this.shareRect, x + 2 * (w + gap), y, w, h), t.share, 'normal', u);
  }
}

/** "BOBBA - KITESURF" for every rider and sport, built once. */
const WHO = {} as Record<CharacterId, Record<SportId, string>>;
for (const ch of CHARACTERS) {
  WHO[ch] = {} as Record<SportId, string>;
  for (const sport of SPORTS) WHO[ch][sport] = `${t.characters[ch]} - ${t.sports[sport]}`;
}
