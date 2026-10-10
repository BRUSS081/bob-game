import { describe, expect, it } from 'vitest';
import { MAX_WIDTH, MIN_WIDTH, TARGET_HEIGHT, computeLayout } from '../src/core/layout.ts';
import { surfaceY } from '../src/game/config.ts';

const VIEWPORTS: [string, number, number, number][] = [
  ['desktop 1080p', 1920, 1080, 1],
  ['desktop 720p', 1280, 720, 1],
  ['laptop hidpi', 1440, 900, 2],
  ['ultrawide', 3440, 1440, 1],
  ['phone portrait', 390, 844, 3],
  ['phone landscape', 844, 390, 3],
  ['android fractional dpr', 412, 915, 2.625],
  ['small phone portrait', 320, 568, 2],
  ['tablet', 1024, 768, 2],
];

describe('computeLayout', () => {
  it.each(VIEWPORTS)('%s: integer scale, canvas fits the viewport', (_name, w, h, dpr) => {
    const l = computeLayout(w, h, dpr);
    expect(Number.isInteger(l.scale)).toBe(true);
    expect(l.scale).toBeGreaterThanOrEqual(1);
    expect(l.deviceWidth).toBe(l.width * l.scale);
    expect(l.deviceHeight).toBe(l.height * l.scale);
    expect(l.deviceWidth).toBeLessThanOrEqual(Math.floor(w * dpr));
    expect(l.deviceHeight).toBeLessThanOrEqual(Math.floor(h * dpr));
    expect(l.width).toBeLessThanOrEqual(MAX_WIDTH);
    // canvas origin lands on a whole device pixel
    expect(Number.isInteger(Math.round(l.cssLeft * dpr * 1000) / 1000)).toBe(true);
  });

  it('keeps landscape screens close to the target height', () => {
    for (const [, w, h, dpr] of VIEWPORTS.filter(([, w, h]) => w > h)) {
      const l = computeLayout(w, h, dpr);
      expect(Math.abs(l.height - TARGET_HEIGHT)).toBeLessThanOrEqual(45);
    }
  });

  it.each(VIEWPORTS.filter(([, w]) => w < 2000))('%s: fills the whole screen (gap smaller than one game pixel)', (_name, w, h, dpr) => {
    const l = computeLayout(w, h, dpr);
    expect(Math.floor(w * dpr) - l.deviceWidth).toBeLessThan(l.scale);
    expect(Math.floor(h * dpr) - l.deviceHeight).toBeLessThan(l.scale);
  });

  it('portrait phones keep a playable width and get a taller scene', () => {
    const l = computeLayout(390, 844, 3);
    expect(l.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(l.deviceWidth).toBe(1170);
    expect(l.height).toBeGreaterThan(l.width);
    const sea = surfaceY(l.height);
    // the athlete rides in the lower half, not at the very bottom
    expect(sea / l.height).toBeGreaterThan(0.5);
    expect(sea / l.height).toBeLessThan(0.75);
  });

  it('landscape keeps the surface line near the bottom', () => {
    const l = computeLayout(1920, 1080, 1);
    expect(l.height - surfaceY(l.height)).toBe(58);
  });

  it('fills a 1080p screen exactly at 480x270', () => {
    const l = computeLayout(1920, 1080, 1);
    expect([l.width, l.height, l.scale]).toEqual([480, 270, 4]);
  });
});
