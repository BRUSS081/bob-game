import type { Input } from '../core/input.ts';
import type { AthleteConfig } from '../custom/athlete.ts';
import type { Profile } from '../custom/profile.ts';
import type { Athlete } from '../game/athletes.ts';
import type { SportId } from '../game/sport.ts';
import type { Renderer } from '../render/renderer.ts';
import type { AthleteSprites } from '../sprites/sheet.ts';

export type ScreenId = 'home' | 'customize' | 'game';

/** What every screen can reach: drawing, saved choices and navigation. */
export interface Context {
  readonly r: Renderer;
  readonly input: Input;
  readonly profile: Profile;
  /** Sprites of the current look for the current sport (cached, rebuilt only on change). */
  player(): AthleteSprites;
  /** Sprites for any look (LRU cached). */
  sprites(config: AthleteConfig, sport: SportId, spins?: boolean): AthleteSprites;
  /** A riding athlete that plays by itself, one per sport (home and menus). */
  demo(sport: SportId): Athlete;
  /** Call after changing the sport, the rider or the look. */
  changed(): void;
  go(screen: ScreenId): void;
}

export interface Screen {
  enter(): void;
  /** A menu or game key (KeyboardEvent.code). */
  key(code: string): void;
  /** A tap or click in game pixels; true when it hit a control. */
  tap(x: number, y: number): boolean;
  update(dt: number): void;
  render(alpha: number): void;
  /** The window lost focus or the tab was hidden. */
  blur(): void;
}

/** Simple autopilot for the demo athletes: a jump now and then, a climb for the wing. */
export class DemoPilot {
  private time = 0;

  reset(): void {
    this.time = 0;
  }

  update(a: Athlete, dt: number): void {
    this.time += dt;
    const period = a.sport === 'wing' ? 3.2 : 2.6;
    const phase = this.time % period;
    if (a.state === 'crash') {
      a.recover();
      return;
    }
    if (a.sport === 'wing') {
      a.update(dt, phase < dt, phase < 0.7);
    } else {
      // jump, and on surf a trick once in a while
      const press = phase < dt || (a.sport === 'surf' && Math.floor(this.time / period) % 2 === 1 && Math.abs(phase - 0.06) < dt / 2);
      a.update(dt, press, phase < 0.15);
    }
  }
}
