import type { Display } from './core/display.ts';
import type { Input } from './core/input.ts';
import type { AthleteConfig } from './custom/athlete.ts';
import { Album } from './custom/album.ts';
import { registerGames } from './games/index.ts';
import { MissionLog } from './custom/missions.ts';
import type { RunMode } from './game/modes.ts';
import { Profile } from './custom/profile.ts';
import { createAthlete, type Athlete } from './game/athletes.ts';
import { surfaceY } from './game/config.ts';
import type { SportId } from './game/sport.ts';
import { Renderer } from './render/renderer.ts';
import type { ActorKind } from './sprites/actor.ts';
import { ActorCache, SpriteCache, type AthleteSprites } from './sprites/sheet.ts';
import { CustomizeScreen } from './ui/customize.ts';
import { HomeScreen } from './ui/home.ts';
import { MissionsScreen } from './ui/missions.ts';
import { SetupScreen } from './ui/setup.ts';
import { SettingsScreen } from './ui/settings.ts';
import { TourScreen } from './ui/tour.ts';
import { AlbumScreen } from './ui/album.ts';
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
  readonly missions = new MissionLog();
  readonly album = new Album();
  readonly profile = new Profile(this.missions.unlocked);
  private readonly display: Display;
  private readonly cache = new SpriteCache(12);
  private readonly actors = new ActorCache(10);
  private readonly demos = {} as Record<SportId, Athlete>;
  private playerSprites: AthleteSprites | null = null;
  private readonly screens: Partial<Record<ScreenId, Screen>>;
  private readonly pointerPos = { x: 0, y: 0 };
  private readonly playScreen: PlayScreen;
  private screen: Screen;
  private screenId: ScreenId = 'home';

  constructor(display: Display, input: Input) {
    this.display = display;
    this.input = input;
    this.r = new Renderer(display);
    this.playScreen = new PlayScreen(this);
    this.screens = {
      home: new HomeScreen(this),
      customize: new CustomizeScreen(this),
      game: this.playScreen,
      missions: new MissionsScreen(this),
      album: new AlbumScreen(this),
      setup: new SetupScreen(this),
      tour: new TourScreen(this),
      settings: new SettingsScreen(this),
    };
    this.r.env.apply(this.profile.sky, this.profile.weather);
    registerGames(this, (id, screen) => this.addScreen(id, screen));
    this.screen = this.screens.home as Screen;
    this.screen.enter();
  }

  get current(): ScreenId {
    return this.screenId;
  }

  /** The active screen (development console). */
  get active(): Screen {
    return this.screen;
  }

  /** The run in progress (development console). */
  get game() {
    return this.playScreen.current;
  }

  player(): AthleteSprites {
    if (!this.playerSprites) this.playerSprites = this.cache.get(this.profile.look(), this.profile.sport);
    return this.playerSprites;
  }

  sprites(config: AthleteConfig, sport: SportId, spins = true): AthleteSprites {
    return this.cache.get(config, sport, spins);
  }

  actor(kind: ActorKind, config: AthleteConfig = this.profile.look('surf')): readonly HTMLCanvasElement[] {
    return this.actors.get(config, kind);
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

  /** Registers a game's screen. */
  addScreen(id: ScreenId, screen: Screen): void {
    this.screens[id] = screen;
  }

  go(id: ScreenId): void {
    const screen = this.screens[id];
    if (!screen) return;
    this.screenId = id;
    this.screen = screen;
    this.changed();
    this.screen.enter();
  }

  playRunner(mode: RunMode, spot = 0): void {
    this.playScreen.mode = mode;
    this.playScreen.spot = spot;
    this.go('game');
  }

  pointer(): { readonly x: number; readonly y: number } {
    const l = this.display.layout;
    this.pointerPos.x = ((this.input.pointerX - l.cssLeft) * l.width) / l.cssWidth;
    this.pointerPos.y = ((this.input.pointerY - l.cssTop) * l.height) / l.cssHeight;
    return this.pointerPos;
  }

  /** Window blurred or tab hidden. */
  blur(): void {
    this.screen.blur();
  }

  update(dt: number): void {
    this.r.env.update(dt);
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
