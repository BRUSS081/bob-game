import type { Input } from '../core/input.ts';
import type { AthleteConfig } from '../custom/athlete.ts';
import type { Album } from '../custom/album.ts';
import type { RunMode } from '../game/modes.ts';
import type { MiniGameId } from '../games/registry.ts';
import type { MissionLog } from '../custom/missions.ts';
import type { Profile } from '../custom/profile.ts';
import type { Athlete } from '../game/athletes.ts';
import type { SportId } from '../game/sport.ts';
import type { Ranks } from '../net/ranks.ts';
import type { Renderer } from '../render/renderer.ts';
import type { ActorKind } from '../sprites/actor.ts';
import type { AthleteSprites } from '../sprites/sheet.ts';

export type ScreenId = 'home' | 'customize' | 'game' | 'missions' | 'album' | 'setup' | 'tour' | 'settings' | 'ranks' | MiniGameId;

/** What every screen can reach: drawing, saved choices and navigation. */
export interface Context {
  readonly r: Renderer;
  readonly input: Input;
  readonly profile: Profile;
  readonly missions: MissionLog;
  readonly album: Album;
  /** The global leaderboard. */
  readonly ranks: Ranks;
  /** Sprites of the current look for the current sport (cached, rebuilt only on change). */
  player(): AthleteSprites;
  /** Sprites for any look (LRU cached). */
  sprites(config: AthleteConfig, sport: SportId, spins?: boolean): AthleteSprites;
  /** BOB or BOBBA (the current look) in the poses of the other games. */
  actor(kind: ActorKind, config?: AthleteConfig): readonly HTMLCanvasElement[];
  /** A riding athlete that plays by itself, one per sport (home and menus). */
  demo(sport: SportId): Athlete;
  /** Call after changing the sport, the rider or the look. */
  changed(): void;
  go(screen: ScreenId): void;
  /** Starts a runner game in a mode (the tour starts at `spot`). */
  playRunner(mode: RunMode, spot?: number): void;
  /** A short buzz on phones that can, unless turned off in the settings. */
  vibrate(ms: number): void;
  /** Where the pointer is now, in game pixels (for steering by touch). */
  pointer(): { readonly x: number; readonly y: number };
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
