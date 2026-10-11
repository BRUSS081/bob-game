import type { Rng } from '../core/rng.ts';

/** Weather of a game: picked at random for each run, or forced in the settings. */
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';
export const WEATHER_NAMES: readonly Weather[] = ['clear', 'cloudy', 'rain', 'storm', 'fog'];

export interface WeatherLook {
  /** How likely each weather is. */
  chance: number;
  /** Clouds in the sky. */
  clouds: number;
  /** Raindrops on screen at once. */
  rain: number;
  lightning: boolean;
  /** Mist over the horizon, 0..1. */
  fog: number;
  /** Grey sky and darker sea. */
  grey: boolean;
  /** Bigger waves on the background sea (looks only: the game stays the same). */
  swell: number;
}

export const WEATHER: Record<Weather, WeatherLook> = {
  clear: { chance: 0.42, clouds: 3, rain: 0, lightning: false, fog: 0, grey: false, swell: 1 },
  cloudy: { chance: 0.26, clouds: 9, rain: 0, lightning: false, fog: 0, grey: false, swell: 1.2 },
  rain: { chance: 0.13, clouds: 10, rain: 70, lightning: false, fog: 0.2, grey: true, swell: 1.4 },
  storm: { chance: 0.08, clouds: 12, rain: 120, lightning: true, fog: 0.1, grey: true, swell: 1.9 },
  fog: { chance: 0.11, clouds: 4, rain: 0, lightning: false, fog: 1, grey: false, swell: 0.8 },
};

/** A random weather, by its chance. */
export function rollWeather(rng: Rng): Weather {
  let roll = rng.next();
  for (const w of WEATHER_NAMES) {
    roll -= WEATHER[w].chance;
    if (roll < 0) return w;
  }
  return 'clear';
}
