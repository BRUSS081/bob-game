import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { defaultConfig, randomize } from '../src/custom/athlete.ts';
import { SPORTS } from '../src/game/sport.ts';
import { C } from '../src/render/palette.ts';
import { ANCHOR_X, ANCHOR_Y, FRAME_H, FRAME_NAMES, FRAME_W, composeFrame, composeKite, rotateFrame } from '../src/sprites/compose.ts';
import { HAIR, HEADS, HEAD_H, HEAD_W } from '../src/sprites/parts.ts';
import { buildLut, SLOT } from '../src/sprites/ramps.ts';
import { resolveRamps } from '../src/custom/athlete.ts';

function bounds(px: Uint8Array) {
  let minX = FRAME_W, maxX = -1, minY = FRAME_H, maxY = -1;
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
    if (!px[y * FRAME_W + x]) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

describe('sprite parts', () => {
  it('heads are 10×10 and hair rows fit the 16-wide overlay', () => {
    for (const rows of Object.values(HEADS)) {
      expect(rows.length).toBe(HEAD_H);
      for (const r of rows) expect(r.length).toBe(HEAD_W);
    }
    for (const style of HAIR) for (const r of style) expect(r.length).toBe(16);
  });
});

describe('composed athletes', () => {
  it.each(SPORTS)('%s: athletes are 48–64 px tall with the board, standing on the anchor', (sport) => {
    for (const ch of ['bob', 'bobba'] as const) {
      const f = composeFrame(defaultConfig(ch, sport), sport, 'ride0');
      const b = bounds(f.px);
      // the board's underside (plus outline) sits on the anchor line
      expect(b.minY).toBeLessThan(ANCHOR_Y - 46);
      const height = ANCHOR_Y - b.minY;
      expect(height).toBeGreaterThanOrEqual(46);
      expect(height).toBeLessThanOrEqual(64);
      expect(b.minX).toBeGreaterThan(0);
      expect(b.maxX).toBeLessThan(FRAME_W - 1);
      // something is drawn on the anchor column at board level
      expect(f.get(ANCHOR_X, ANCHOR_Y - 2)).not.toBe(0);
    }
  });

  it('wing foil frames keep the mast below the board, in the water', () => {
    const f = composeFrame(defaultConfig('bob', 'wing'), 'wing', 'ride0');
    let below = 0;
    for (let y = ANCHOR_Y + 2; y < ANCHOR_Y + 20; y++) if (f.get(ANCHOR_X + 2, y)) below++;
    expect(below).toBeGreaterThan(15);
  });

  it('customization is a palette swap: same pixels, different colors', () => {
    const rng = new Rng(9);
    const a = defaultConfig('bob', 'surf');
    const b = { ...a };
    b.skin = (a.skin + 3) % 8;
    b.suitA = (a.suitA + 2) % 10;
    expect(composeFrame(a, 'surf', 'ride0').px).toEqual(composeFrame(b, 'surf', 'ride0').px);
    const la = buildLut(resolveRamps(a));
    const lb = buildLut(resolveRamps(b));
    expect(la[SLOT.skin + 1]).not.toBe(lb[SLOT.skin + 1]);
    void rng;
  });

  it('no stray single pixels inside the athlete', () => {
    const rng = new Rng(4);
    for (const sport of SPORTS) {
      const c = defaultConfig('bobba', sport);
      randomize(c, sport, rng);
      for (const name of FRAME_NAMES) {
        if (name === 'fall') continue;
        const f = composeFrame(c, sport, name);
        let orphans = 0;
        for (let y = 1; y < FRAME_H - 1; y++) for (let x = 1; x < FRAME_W - 1; x++) {
          const v = f.get(x, y);
          if (!v || v === C.ink) continue;
          const n = [f.get(x - 1, y), f.get(x + 1, y), f.get(x, y - 1), f.get(x, y + 1)];
          if (n.includes(v) || n.includes(0)) continue;
          if (n.every((q) => q === n[0]) && n[0] !== C.ink) orphans++;
        }
        expect(orphans, `${sport} ${name}`).toBe(0);
      }
    }
  });

  it('rotating by a full turn gives back the same frame', () => {
    const f = composeFrame(defaultConfig('bob', 'surf'), 'surf', 'air');
    expect(rotateFrame(f, Math.PI * 2).px).toEqual(f.px);
  });

  it('the kite has line attachment points at its tips', () => {
    const k = composeKite(defaultConfig('bob', 'kite'), 0);
    expect(k.tipL[0]).toBeLessThan(k.tipR[0]);
    expect(k.raster.get(k.tipL[0], k.tipL[1] - 1) || k.raster.get(k.tipL[0] + 1, k.tipL[1] - 1)).toBeTruthy();
  });
});
