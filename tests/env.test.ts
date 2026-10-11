import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { Environment } from '../src/env/environment.ts';
import { moonPhase, moonProgress, skyAt, sunProgress, sunTimes } from '../src/env/sky.ts';
import { WEATHER, WEATHER_NAMES, rollWeather } from '../src/env/weather.ts';

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe('time of day', () => {
  it('summer days are longer than winter days', () => {
    const june = sunTimes(at(2026, 6, 21, 12));
    const dec = sunTimes(at(2026, 12, 21, 12));
    expect(june.sunset - june.sunrise).toBeGreaterThan(14);
    expect(dec.sunset - dec.sunrise).toBeLessThan(10);
    expect(june.sunrise).toBeGreaterThan(4);
    expect(june.sunset).toBeLessThan(22);
  });

  it('the sky follows the clock in steps', () => {
    expect(skyAt(at(2026, 7, 10, 13))).toBe('day');
    expect(skyAt(at(2026, 7, 10, 2))).toBe('night');
    expect(skyAt(at(2026, 7, 10, 23, 30))).toBe('night');
    const { sunrise, sunset } = sunTimes(at(2026, 7, 10, 12));
    expect(skyAt(at(2026, 7, 10, Math.floor(sunrise), Math.round((sunrise % 1) * 60) + 10))).toBe('dawn');
    expect(skyAt(at(2026, 7, 10, Math.floor(sunset), Math.round((sunset % 1) * 60)))).toBe('sunset');
  });

  it('the sun climbs by day, the moon by night', () => {
    expect(sunProgress(at(2026, 3, 20, 2))).toBeNull();
    const noon = sunProgress(at(2026, 3, 20, 13)) as number;
    expect(noon).toBeGreaterThan(0.4);
    expect(noon).toBeLessThan(0.6);
    expect(moonProgress(at(2026, 3, 20, 13))).toBeNull();
    const late = moonProgress(at(2026, 3, 20, 23)) as number;
    const early = moonProgress(at(2026, 3, 21, 4)) as number;
    expect(early).toBeGreaterThan(late);
  });

  it('knows the real moon phase', () => {
    // full moon on 2024-01-25, new moon on 2024-01-11
    expect(Math.abs(moonPhase(new Date(Date.UTC(2024, 0, 25, 18))) - 0.5)).toBeLessThan(0.04);
    const p = moonPhase(new Date(Date.UTC(2024, 0, 11, 12)));
    expect(Math.min(p, 1 - p)).toBeLessThan(0.04);
  });
});

describe('weather', () => {
  it('chances add up to one', () => {
    let sum = 0;
    for (const w of WEATHER_NAMES) sum += WEATHER[w].chance;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('every weather comes up, clear skies most', () => {
    const rng = new Rng(4);
    const count: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const w = rollWeather(rng);
      count[w] = (count[w] ?? 0) + 1;
    }
    for (const w of WEATHER_NAMES) expect(count[w]).toBeGreaterThan(100);
    expect(count.clear).toBeGreaterThan(count.storm * 3);
  });
});

describe('environment', () => {
  it('forced settings win over the clock and the dice', () => {
    const env = new Environment();
    env.apply('sunset', 'storm');
    expect(env.sky).toBe('sunset');
    expect(env.weather).toBe('storm');
    for (let i = 0; i < 20; i++) {
      env.newRun();
      expect(env.weather).toBe('storm');
    }
    env.apply('night', 'auto');
    expect(env.night).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      env.newRun();
      seen.add(env.weather);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('lightning strikes only in a storm', () => {
    const env = new Environment();
    env.apply('day', 'rain');
    env.newRun();
    let flashes = 0;
    for (let i = 0; i < 60 * 30; i++) {
      env.update(1 / 60);
      if (env.flash > 0) flashes++;
    }
    expect(flashes).toBe(0);
    env.apply('day', 'storm');
    env.newRun();
    for (let i = 0; i < 60 * 30; i++) {
      env.update(1 / 60);
      if (env.flash > 0) flashes++;
    }
    expect(flashes).toBeGreaterThan(0);
  });
});
