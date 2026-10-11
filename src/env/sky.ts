/**
 * Time of day from the device's local clock, without asking where the
 * player is: sunrise and sunset follow the seasons of a mid-latitude sea
 * (about 42° north), the moon phase comes from the date. All pure functions.
 */

export type Sky = 'dawn' | 'day' | 'sunset' | 'night';
export const SKY_NAMES: readonly Sky[] = ['dawn', 'day', 'sunset', 'night'];

export interface SunTimes {
  /** Local hours, e.g. 6.5 is 6:30. */
  sunrise: number;
  sunset: number;
}

/** Local time as hours, 0..24. */
export function hours(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

/** Sunrise and sunset: about 15 hours of daylight in June, 9 in December. */
export function sunTimes(date: Date): SunTimes {
  const d = dayOfYear(date);
  const daylight = 12 + 3 * Math.sin(((d - 80) / 365) * Math.PI * 2);
  // local noon: later in summer (daylight saving time)
  const noon = 12.4 + 0.6 * Math.sin(((d - 80) / 365) * Math.PI * 2 + 0.3);
  return { sunrise: noon - daylight / 2, sunset: noon + daylight / 2 };
}

/** The look of the sky now: dawn around sunrise, sunset around sunset, in steps. */
export function skyAt(date: Date): Sky {
  const h = hours(date);
  const { sunrise, sunset } = sunTimes(date);
  if (h >= sunrise - 0.5 && h < sunrise + 1) return 'dawn';
  if (h >= sunrise + 1 && h < sunset - 1) return 'day';
  if (h >= sunset - 1 && h < sunset + 0.6) return 'sunset';
  return 'night';
}

/** How far the sun is along its arc, 0 at sunrise to 1 at sunset; null when it is down. */
export function sunProgress(date: Date): number | null {
  const h = hours(date);
  const { sunrise, sunset } = sunTimes(date);
  if (h < sunrise || h > sunset) return null;
  return (h - sunrise) / (sunset - sunrise);
}

/** How far the moon is along its arc through the night, 0..1; null by day. */
export function moonProgress(date: Date): number | null {
  const h = hours(date);
  const { sunrise, sunset } = sunTimes(date);
  const night = 24 - (sunset - sunrise);
  const since = h >= sunset ? h - sunset : h < sunrise ? h + 24 - sunset : -1;
  if (since < 0) return null;
  return Math.min(1, since / night);
}

/** Length of a lunar month in days, and a new moon to count from (2000-01-06 18:14 UTC). */
const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/** Moon phase 0..1: 0 new moon, 0.25 first quarter, 0.5 full moon, 0.75 last quarter. */
export function moonPhase(date: Date): number {
  const days = (date.getTime() - NEW_MOON) / 86400000;
  const p = (days / SYNODIC) % 1;
  return p < 0 ? p + 1 : p;
}
