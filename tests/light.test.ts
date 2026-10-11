import { describe, expect, it } from 'vitest';
import { SKY_NAMES } from '../src/env/sky.ts';
import { DAYLIGHT, lightFor, lightPixels, shade } from '../src/render/light.ts';
import { C, PALETTE } from '../src/render/palette.ts';
import { WAVE_BANDS, waterStep, waveStrip } from '../src/render/waves.ts';

const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
const luma = (c: number) => {
  const [r, g, b] = rgb(c);
  return 0.3 * r + 0.59 * g + 0.11 * b;
};

/** A 5×5 square of one color with an ink outline, as RGBA. */
function square(color: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(7 * 7 * 4);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const i = (y * 7 + x) * 4;
      const c = x === 0 || y === 0 || x === 6 || y === 6 ? PALETTE[C.ink] : color;
      [d[i], d[i + 1], d[i + 2]] = rgb(c);
      d[i + 3] = 255;
    }
  }
  return d;
}

const px = (d: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * 7 + x) * 4;
  return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
};

describe('scene light', () => {
  it('clear daylight leaves the art as drawn', () => {
    expect(lightFor('day', false)).toBe(DAYLIGHT);
    for (let i = 1; i < PALETTE.length; i++) expect(shade(PALETTE[i], DAYLIGHT)).toBe(PALETTE[i]);
    const d = square(PALETTE[C.coral]);
    const before = Uint8ClampedArray.from(d);
    lightPixels(d, 7, 7, DAYLIGHT);
    expect(d).toEqual(before);
  });

  it('every sky and weather has its own light', () => {
    const ids = new Set<number>();
    for (const sky of SKY_NAMES) for (const grey of [false, true]) ids.add(lightFor(sky, grey).id);
    expect(ids.size).toBe(8);
  });

  it('night is darker and bluer, sunset warmer, rain greyer', () => {
    const white = PALETTE[C.white];
    const night = shade(white, lightFor('night', false));
    expect(luma(night)).toBeLessThan(luma(white) * 0.75);
    const [nr, , nb] = rgb(night);
    expect(nb).toBeGreaterThan(nr);
    const [sr, , sb] = rgb(shade(white, lightFor('sunset', false)));
    expect(sr).toBeGreaterThan(sb);
    const coral = PALETTE[C.coral];
    const spread = (c: number) => Math.max(...rgb(c)) - Math.min(...rgb(c));
    expect(spread(shade(coral, lightFor('day', true)))).toBeLessThan(spread(coral));
  });

  it('the rim lights only the side facing the sun, inside the outline', () => {
    const color = PALETTE[C.teal];
    const d = square(color);
    const sunset = lightFor('sunset', false);
    lightPixels(d, 7, 7, sunset);
    // the sun is on the right at sunset: the right column inside the outline is lit
    expect(luma(px(d, 5, 3))).toBeGreaterThan(luma(px(d, 1, 3)));
    expect(px(d, 1, 3)).toBe(shade(color, sunset));
    // the outline stays dark
    expect(luma(px(d, 6, 3))).toBeLessThan(40);
  });
});

describe('foreground waves', () => {
  it('each band has a crest with foam on the peak and fills to the bottom', () => {
    for (const band of WAVE_BANDS) {
      const r = waveStrip(band.length, band.amp, C.turquoise, C.aqua, C.white);
      // the peak (x = 0) is high and foamy, the trough (middle) low
      const top = (x: number) => {
        for (let y = 0; y < r.h; y++) if (r.px[y * r.w + x] !== 0 && r.px[y * r.w + x] !== C.white) return y;
        return r.h;
      };
      expect(top(0)).toBeLessThan(top(band.length >> 1));
      expect(Array.from(r.px.subarray(0, r.w * 3))).toContain(C.white);
      // the bottom row is solid water
      for (let x = 0; x < r.w; x++) expect(r.px[(r.h - 1) * r.w + x]).not.toBe(0);
    }
  });

  it('steps along the sea ramp and stops at its ends', () => {
    expect(waterStep(C.sea, 1)).toBe(C.turquoise);
    expect(waterStep(C.sea, -1)).toBe(C.teal);
    expect(waterStep(C.abyss, -1)).toBe(C.abyss);
    expect(waterStep(C.foamShadow, 1)).toBe(C.foamShadow);
    expect(waterStep(C.coral, 1)).toBe(C.coral);
  });
});
