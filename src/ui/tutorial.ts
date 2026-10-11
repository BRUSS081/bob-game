import { WingAthlete } from '../game/athletes.ts';
import { FLOW } from '../game/config.ts';
import type { Game } from '../game/game.ts';
import type { SportId } from '../game/sport.ts';

/**
 * First run of each sport: the game stops right when the player should act
 * and waits for the press, so the controls are learned by doing. The run is
 * shielded meanwhile, so a late press never ends in a wipeout.
 *
 * surf and kite: jump at the first obstacle, then a trick in that jump.
 * wing foil: hold to rise, then a hint about flying in the flow band.
 */
export type TutorialStep = 'off' | 'jump' | 'trick' | 'land' | 'rise' | 'flow' | 'done';

/** How far ahead (seconds of travel) the first obstacle is when the game waits for the jump. */
const LEAD: Record<SportId, number> = { surf: 0.17, kite: 0.24, wing: 0 };
const FLOW_HINT_TIME = 2.5;
/** The wing foil tutorial ends after this long even without reaching the flow band. */
const WING_LIMIT = 15;

export class Tutorial {
  step: TutorialStep = 'off';
  /** The game is stopped, waiting for the player. */
  frozen = false;
  /** Seconds left of the non-blocking flow hint. */
  hintTime = 0;
  private sport: SportId = 'surf';
  private time = 0;

  get active(): boolean {
    return this.step !== 'off' && this.step !== 'done';
  }

  start(sport: SportId): void {
    this.sport = sport;
    this.step = sport === 'wing' ? 'rise' : 'jump';
    this.frozen = false;
    this.hintTime = 0;
    this.time = 0;
  }

  stop(): void {
    this.step = 'off';
    this.frozen = false;
    this.hintTime = 0;
  }

  /**
   * Before each game step. Returns false while the game must stay stopped;
   * a press that releases the stop is passed on to the game.
   */
  beforeStep(g: Game, pressed: boolean, held: boolean): boolean {
    if (!this.active || g.phase !== 'running') return true;
    if (this.frozen) {
      const go = this.step === 'rise' ? pressed || held : pressed;
      if (!go) return false;
      this.frozen = false;
      this.step = this.step === 'jump' ? 'trick' : this.step === 'trick' ? 'land' : 'flow';
      return true;
    }
    const a = g.athlete;
    const cfg = g.cfg;
    switch (this.step) {
      case 'jump': {
        // the nearest obstacle still ahead of the athlete
        const front = cfg.playerX + cfg.playerW;
        const items = g.obstacles.items;
        for (let i = 0; i < items.length; i++) {
          const o = items[i];
          if (!o.active || o.x + o.kind.w < cfg.playerX || o.kind.minY > 30) continue;
          if (o.x - front <= g.effectiveSpeed * LEAD[this.sport]) this.frozen = true;
        }
        break;
      }
      case 'trick':
        // surf: right after the takeoff; kite: at the top of the jump
        if (a.state === 'air' && (this.sport === 'surf' ? a.stateTime > 0.05 : a.y < a.prevY)) this.frozen = true;
        break;
      case 'rise':
        if (this.time > 0.6) this.frozen = true;
        break;
    }
    return !this.frozen;
  }

  /** After each game step that ran. */
  afterStep(g: Game, dt: number): void {
    if (!this.active) {
      if (this.hintTime > 0) this.hintTime -= dt;
      return;
    }
    this.time += dt;
    const a = g.athlete;
    if (this.step === 'land' && a.state === 'ride') this.step = 'done';
    if (this.step === 'flow') {
      if (a instanceof WingAthlete && a.y >= a.breachLimit - FLOW.band && this.hintTime <= 0) this.hintTime = FLOW_HINT_TIME;
      if (this.hintTime > 0) {
        this.hintTime -= dt;
        if (this.hintTime <= 0) this.step = 'done';
      }
      if (this.time > WING_LIMIT) this.step = 'done';
    }
  }
}
