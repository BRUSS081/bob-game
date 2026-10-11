import type { AthleteConfig } from '../custom/athlete.ts';
import { C } from '../render/palette.ts';
import { S, outline } from './compose.ts';
import { LIGHT, MID, SHADE } from './ramps.ts';
import { Raster } from './raster.ts';

/**
 * BOB and BOBBA seen from above, for the slalom and the regatta: a surfer
 * on a board and a small sailing dinghy. Drawn pointing up, then turned to
 * every heading with a nearest-neighbour rotation (pixels stay square).
 */

export const TOP_SIZE = 26;
export const SURFER_HEADINGS = 16;
export const BOAT_HEADINGS = 32;

/** Frame for a heading in radians (0 = up, clockwise). */
export function headingIndex(angle: number, steps: number): number {
  const k = Math.round((angle / (Math.PI * 2)) * steps);
  return ((k % steps) + steps) % steps;
}

function turn(src: Raster, angle: number): Raster {
  const out = new Raster(TOP_SIZE, TOP_SIZE);
  const c = TOP_SIZE / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < TOP_SIZE; y++) {
    for (let x = 0; x < TOP_SIZE; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const v = src.get(Math.floor(c + dx * cos + dy * sin), Math.floor(c - dx * sin + dy * cos));
      if (v) out.px[y * TOP_SIZE + x] = v;
    }
  }
  return out;
}

/** Surfer from above, board pointing up. The rider stands across the board, arms out for balance. */
function surfer(c: AthleteConfig): Raster {
  const r = new Raster(TOP_SIZE, TOP_SIZE);
  const cx = 13;
  // board: pointed nose, round tail
  r.polygon(
    [
      [cx, 2],
      [cx + 3.5, 8],
      [cx + 3.5, 17],
      [cx + 2, 23],
      [cx - 2, 23],
      [cx - 3.5, 17],
      [cx - 3.5, 8],
    ],
    S('board', MID),
  );
  for (let y = 5; y < 22; y++) r.set(cx - 3 + (y < 8 ? 1 : 0), y, S('board', LIGHT));
  if (c.boardArt > 0) for (let y = 4; y < 22; y++) r.set(cx, y, S('boardArt', MID));
  // rider: feet along the board, shoulders across it seen from above
  r.rect(cx - 1, 9, 2, 2, S('skin', SHADE));
  r.rect(cx - 1, 16, 2, 2, S('skin', SHADE));
  r.ellipse(cx, 13, 2, 4, S('suitA', MID));
  r.line(cx - 2, 11, cx - 6, 8, S('skin', MID));
  r.line(cx - 2, 15, cx - 6, 18, S('skin', MID));
  r.ellipse(cx - 1, 13, 2, 2, S('hair', MID));
  r.set(cx - 2, 12, S('hair', LIGHT));
  outline(r);
  return r;
}

/** Dinghy from above, bow up: hull in the board color, the sailor sitting aft. The sail is drawn by the game. */
function dinghy(c: AthleteConfig): Raster {
  const r = new Raster(TOP_SIZE, TOP_SIZE);
  const cx = 13;
  r.polygon(
    [
      [cx, 4],
      [cx + 4, 10],
      [cx + 4, 19],
      [cx + 3, 22],
      [cx - 3, 22],
      [cx - 4, 19],
      [cx - 4, 10],
    ],
    S('board', MID),
  );
  r.polygon(
    [
      [cx, 7],
      [cx + 3, 11],
      [cx + 3, 20],
      [cx - 3, 20],
      [cx - 3, 11],
    ],
    C.white,
  );
  r.rect(cx - 2, 15, 5, 5, C.tan);
  if (c.boardArt > 0) {
    // a stripe along each side of the hull
    for (let y = 11; y < 21; y++) {
      r.set(cx - 4, y, S('boardArt', MID));
      r.set(cx + 4, y, S('boardArt', MID));
    }
  }
  r.set(cx, 10, C.ink);
  // sailor
  r.ellipse(cx + 1, 18, 2, 1, S('suitA', MID));
  r.rect(cx, 17, 2, 2, S('hair', MID));
  outline(r);
  return r;
}

export function surferHeadings(c: AthleteConfig): Raster[] {
  const base = surfer(c);
  const out: Raster[] = [];
  for (let k = 0; k < SURFER_HEADINGS; k++) out.push(turn(base, (k / SURFER_HEADINGS) * Math.PI * 2));
  return out;
}

export function boatHeadings(c: AthleteConfig): Raster[] {
  const base = dinghy(c);
  const out: Raster[] = [];
  for (let k = 0; k < BOAT_HEADINGS; k++) out.push(turn(base, (k / BOAT_HEADINGS) * Math.PI * 2));
  return out;
}

/** Mast position in the dinghy frame, relative to the center, before turning. */
export const MAST = { x: 0, y: -3 } as const;
