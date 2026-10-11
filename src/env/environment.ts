import { Rng } from '../core/rng.ts';
import { moonPhase, moonProgress, skyAt, sunProgress, type Sky } from './sky.ts';
import { WEATHER, rollWeather, type Weather, type WeatherLook } from './weather.ts';

export type SkyChoice = Sky | 'auto';
export type WeatherChoice = Weather | 'auto';

/** Seconds between lightning strikes in a storm, and how long a flash lasts. */
const STRIKE = [3.5, 10] as const;
const FLASH = 0.22;

/**
 * The world's light and weather, shared by every screen: the real time of
 * day (or the one forced in the settings), the weather of the current run,
 * the sun and moon on their arcs, the moon phase and the lightning.
 */
export class Environment {
  sky: Sky = 'day';
  weather: Weather = 'clear';
  /** Sun (by day) or moon (by night) along its arc, 0..1. */
  arc = 0.5;
  moon = 0.5;
  clock = 0;
  /** Lightning: seconds left of the flash, and where the bolt falls (0..1 of the width). */
  flash = 0;
  boltX = 0.5;
  boltSeed = 0;
  forceSky: SkyChoice = 'auto';
  forceWeather: WeatherChoice = 'auto';
  private nextStrike: number = STRIKE[1];
  private sinceCheck = 99;
  private readonly rng = new Rng(Date.now() >>> 0);

  constructor() {
    this.weather = rollWeather(this.rng);
    this.refresh(new Date());
  }

  get look(): WeatherLook {
    return WEATHER[this.weather];
  }

  get night(): boolean {
    return this.sky === 'night';
  }

  /** A new run: new weather (unless forced) and the time of day now. */
  newRun(): void {
    this.weather = this.forceWeather === 'auto' ? rollWeather(this.rng) : this.forceWeather;
    this.nextStrike = this.rng.range(1.5, STRIKE[1]);
    this.flash = 0;
    this.refresh(new Date());
  }

  /** Settings changed: apply them now. */
  apply(sky: SkyChoice, weather: WeatherChoice): void {
    this.forceSky = sky;
    this.forceWeather = weather;
    if (weather !== 'auto') this.weather = weather;
    this.refresh(new Date());
  }

  update(dt: number): void {
    this.clock += dt;
    // the clock moves slowly: look at it twice a minute
    this.sinceCheck += dt;
    if (this.sinceCheck > 30) this.refresh(new Date());
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (!this.look.lightning) return;
    this.nextStrike -= dt;
    if (this.nextStrike <= 0) {
      this.flash = FLASH;
      this.boltX = this.rng.range(0.15, 0.85);
      this.boltSeed = Math.floor(this.rng.next() * 1000);
      this.nextStrike = this.rng.range(STRIKE[0], STRIKE[1]);
    }
  }

  private refresh(now: Date): void {
    this.sinceCheck = 0;
    this.moon = moonPhase(now);
    if (this.forceSky !== 'auto') {
      this.sky = this.forceSky;
      this.arc = ARC[this.sky];
      return;
    }
    this.sky = skyAt(now);
    const p = this.sky === 'night' ? moonProgress(now) : sunProgress(now);
    this.arc = p ?? ARC[this.sky];
  }
}

/** Where sun or moon sit for a sky chosen by hand (or by a game). */
export const ARC: Record<Sky, number> = { dawn: 0.06, day: 0.45, sunset: 0.94, night: 0.4 };
