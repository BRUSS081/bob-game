import type { Display } from './core/display.ts';
import type { Input } from './core/input.ts';
import type { AthleteConfig } from './custom/athlete.ts';
import { Profile } from './custom/profile.ts';
import { createAthlete, type Athlete } from './game/athletes.ts';
import { surfaceY } from './game/config.ts';
import type { SportId } from './game/sport.ts';
import { Renderer } from './render/renderer.ts';
import { SpriteCache, type AthleteSprites } from './sprites/sheet.ts';
import { CustomizeScreen } from './ui/customize.ts';
import { HomeScreen } from './ui/home.ts';
import { PlayScreen } from './ui/play.ts';
import type { Context, Screen, ScreenId } from './ui/screen.ts';

/**
 * Owns the screens (home, customize, game) and what they share: the
 * renderer, the input, the saved profile and the sprite caches. Input
 * events are turned into game pixels and handed to the active screen.
 */
export class App implements Context {
  readonly r: Renderer;
  readonly input: Input;
  readonly profile = new Profile();
  private readonly display: Display;
  private readonly cache = new SpriteCache(12);
  private readonly demos = {} as Record<SportId, Athlete>;
  private playerSprites: AthleteSprites | null = null;
  private readonly screens: Record<ScreenId, Screen>;
  private readonly play: PlayScreen;
  private screen: Screen;
  private screenId: ScreenId = 'home';

  constructor(display: Display, input: Input) {
    this.display = display;
    this.input = input;
    this.r = new Renderer(display);
    this.play = new PlayScreen(this);
    this.screens = { home: new HomeScreen(this), customize: new CustomizeScreen(this), game: this.play };
    this.screen = this.screens.home;
    this.screen.enter();
  }

  get current(): ScreenId {
    return this.screenId;
  }

  /** The run in progress (development console). */
  get game() {
    return this.play.current;
  }

  player(): AthleteSprites {
    if (!this.playerSprites) this.playerSprites = this.cache.get(this.profile.look(), this.profile.sport);
    return this.playerSprites;
  }

  sprites(config: AthleteConfig, sport: SportId, spins = true): AthleteSprites {
    return this.cache.get(config, sport, spins);
  }

  demo(sport: SportId): Athlete {
    let a = this.demos[sport];
    if (!a) {
      a = createAthlete(sport);
      this.demos[sport] = a;
    }
    return a;
  }

  changed(): void {
    this.playerSprites = null;
  }

  go(id: ScreenId): void {
    this.screenId = id;
    this.screen = this.screens[id];
    this.changed();
    this.screen.enter();
  }

  /** Window blurred or tab hidden. */
  blur(): void {
    this.screen.blur();
  }

  update(dt: number): void {
    const input = this.input;
    const l = this.display.layout;
    for (let i = 0; i < input.count; i++) {
      const e = input.events[i];
      if (e.kind === 'pointer') {
        const x = ((e.x - l.cssLeft) * l.width) / l.cssWidth;
        const y = ((e.y - l.cssTop) * l.height) / l.cssHeight;
        if (this.screen.tap(x, y)) input.suppressHeld();
      } else {
        this.screen.key(e.code);
      }
    }
    input.clear();
    this.screen.update(dt);
  }

  render(alpha: number): void {
    this.r.begin(surfaceY);
    this.screen.render(alpha);
    this.r.present();
  }
}
