import { BOARD_ART, GEAR_PATTERNS, SUIT_STYLES, type AthleteConfig } from '../custom/athlete.ts';
import type { SportId } from '../game/sport.ts';
import { C } from '../render/palette.ts';
import { FOILBOARD, GLASSES, HAIR, HEADS, HELMET, OVERLAY_OFFSET, SURFBOARD, TWINTIP } from './parts.ts';
import { LIGHT, MID, SHADE, SLOT, slotBase, type SlotName } from './ramps.ts';
import { Raster } from './raster.ts';

/** Every athlete frame is FRAME_W × FRAME_H; the board's bottom edge sits on ANCHOR_Y, centered on ANCHOR_X. */
export const FRAME_W = 80;
export const FRAME_H = 84;
export const ANCHOR_X = 34;
export const ANCHOR_Y = 58;
/** Tricks and wipeouts rotate around this point (the athlete's middle). */
export const PIVOT_X = ANCHOR_X;
export const PIVOT_Y = ANCHOR_Y - 22;

export type FrameName = 'ride0' | 'ride1' | 'ride2' | 'ride3' | 'takeoff' | 'air' | 'land' | 'fall';
export const FRAME_NAMES: readonly FrameName[] = ['ride0', 'ride1', 'ride2', 'ride3', 'takeoff', 'air', 'land', 'fall'];

export type P = readonly [number, number];

/** Joint positions relative to the anchor (x right, y up is negative). `head` is the head's top-left corner. */
export interface Pose {
  footB: P;
  kneeB: P;
  hip: P;
  kneeF: P;
  footF: P;
  chest: P;
  head: P;
  elbowB: P;
  handB: P;
  elbowF: P;
  handF: P;
}

// ------------------------------------------------------------------ poses

const SURF_RIDE: Pose = {
  footB: [-9, -6],
  kneeB: [-6, -14],
  hip: [-1, -21],
  kneeF: [9, -13],
  footF: [6, -6],
  chest: [3, -33],
  head: [1, -45],
  elbowB: [-3, -31],
  handB: [-9, -34],
  elbowF: [8, -28],
  handF: [13, -25],
};

const KITE_RIDE: Pose = {
  footB: [-7, -6],
  kneeB: [-7, -14],
  hip: [-3, -21],
  kneeF: [6, -14],
  footF: [7, -6],
  chest: [-6, -33],
  head: [-9, -45],
  elbowB: [-1, -29],
  handB: [6, -30],
  elbowF: [0, -26],
  handF: [7, -27],
};

const WING_RIDE: Pose = {
  footB: [-8, -6],
  kneeB: [-7, -14],
  hip: [-2, -21],
  kneeF: [7, -14],
  footF: [6, -6],
  chest: [-1, -33],
  head: [-3, -45],
  elbowB: [4, -30],
  handB: [8, -32],
  elbowF: [6, -26],
  handF: [11, -26],
};

/** Moves the upper body (hip and above) by (dx, dy), knees by half of it. */
function shifted(p: Pose, dx: number, dy: number, arms: Partial<Pose> = {}): Pose {
  const up = (q: P): P => [q[0] + dx, q[1] + dy];
  const half = (q: P): P => [q[0] + Math.round(dx / 2), q[1] + Math.round(dy / 2)];
  return {
    footB: p.footB,
    footF: p.footF,
    kneeB: half(p.kneeB),
    kneeF: half(p.kneeF),
    hip: up(p.hip),
    chest: up(p.chest),
    head: up(p.head),
    elbowB: up(p.elbowB),
    handB: up(p.handB),
    elbowF: up(p.elbowF),
    handF: up(p.handF),
    ...arms,
  };
}

export function poseFor(sport: SportId, frame: FrameName): Pose {
  const base = sport === 'surf' ? SURF_RIDE : sport === 'kite' ? KITE_RIDE : WING_RIDE;
  const flex = [0, 1, 2, 1];
  switch (frame) {
    case 'ride0':
    case 'ride1':
    case 'ride2':
    case 'ride3': {
      const k = flex[Number(frame[4])];
      if (sport === 'surf') {
        const sway = [0, -1, 0, 1][Number(frame[4])];
        return shifted(base, 0, k, {
          handB: [base.handB[0], base.handB[1] + k + sway],
          handF: [base.handF[0], base.handF[1] + k - sway],
        });
      }
      return shifted(base, 0, k);
    }
    case 'takeoff':
      if (sport === 'kite') return shifted(base, -2, 2);
      return shifted(base, 1, 4, sport === 'surf' ? { elbowB: [-5, -27], handB: [-12, -25], elbowF: [6, -24], handF: [11, -20] } : {});
    case 'land':
      return shifted(base, 1, 4, sport === 'surf' ? { elbowB: [-2, -27], handB: [-8, -29], elbowF: [9, -24], handF: [15, -22] } : {});
    case 'air':
    case 'fall':
      if (sport === 'surf') {
        return {
          ...base,
          kneeB: [-5, -16],
          kneeF: [10, -16],
          hip: [-1, -20],
          chest: [2, -32],
          head: [0, -44],
          elbowB: [-6, -33],
          handB: [-13, -35],
          elbowF: [9, -32],
          handF: [16, -34],
        };
      }
      if (sport === 'kite') {
        return { ...base, kneeB: [-6, -15], kneeF: [7, -16], hip: [-2, -21], chest: [-4, -33], head: [-6, -45] };
      }
      return shifted(base, 0, 3);
  }
}

// ------------------------------------------------------------------ helpers

export function at(p: P, dx = 0, dy = 0): [number, number] {
  return [ANCHOR_X + p[0] + dx, ANCHOR_Y + p[1] + dy];
}

/** Stamps a round-ish square brush along a line. */
export function stroke(r: Raster, a: P, b: P, width: number, c: number): void {
  const [x0, y0] = at(a);
  const [x1, y1] = at(b);
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const lo = -Math.floor((width - 1) / 2);
  const hi = lo + width - 1;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let dy = lo; dy <= hi; dy++) {
      for (let dx = lo; dx <= hi; dx++) {
        if (width >= 4 && (dx === lo || dx === hi) && (dy === lo || dy === hi)) continue;
        r.set(x + dx, y + dy, c);
      }
    }
  }
}

/** Light on top and right edges, shadow on bottom and left edges, for pixels of one ramp's mid tone. */
export function shade(part: Raster, base: number): void {
  const src = Uint8Array.from(part.px);
  const empty = (x: number, y: number) => x < 0 || y < 0 || x >= part.w || y >= part.h || src[y * part.w + x] === 0;
  for (let y = 0; y < part.h; y++) {
    for (let x = 0; x < part.w; x++) {
      if (src[y * part.w + x] !== base + MID) continue;
      if (empty(x, y - 1) || (empty(x + 1, y) && !empty(x, y + 1))) part.px[y * part.w + x] = base + LIGHT;
      else if (empty(x, y + 1) || empty(x - 1, y)) part.px[y * part.w + x] = base + SHADE;
    }
  }
}

/**
 * Composites a part over the frame. Edge pixels of the part that sit on
 * already-drawn pixels turn to their shadow tone, separating overlapping limbs.
 */
export function composite(frame: Raster, part: Raster, separate: boolean): void {
  const w = part.w;
  for (let y = 0; y < part.h; y++) {
    for (let x = 0; x < w; x++) {
      let c = part.px[y * w + x];
      if (c === 0) continue;
      if (separate) {
        const base = slotBase(c);
        if (base >= 0) {
          const edgeOver =
            (part.get(x - 1, y) === 0 && frame.get(x - 1, y) !== 0) ||
            (part.get(x, y + 1) === 0 && frame.get(x, y + 1) !== 0);
          if (edgeOver) c = base + SHADE;
        }
      }
      frame.px[y * w + x] = c;
    }
  }
}

export function newPart(): Raster {
  return new Raster(FRAME_W, FRAME_H);
}

export function blitRows(r: Raster, rows: readonly string[], x: number, y: number, legend: Record<string, number>): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = legend[row[i]];
      if (c) r.set(x + i, y + j, c);
    }
  });
}

export const S = (name: SlotName, tone: number) => SLOT[name] + tone;

// ------------------------------------------------------------------ boards and gear

function drawBoard(frame: Raster, sport: SportId, c: AthleteConfig): void {
  const rows = sport === 'surf' ? SURFBOARD : sport === 'kite' ? TWINTIP : FOILBOARD;
  const w = rows[0].length;
  const bodyRows = sport === 'wing' ? rows.length : 4;
  const x0 = ANCHOR_X - Math.floor(w / 2);
  const y0 = ANCHOR_Y - bodyRows;
  const art = BOARD_ART[c.boardArt];
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      let v: number;
      if (ch === 'f') v = C.slate;
      else if (ch === 'u') v = S('board', SHADE);
      else {
        const tone = ch === 'o' ? LIGHT : MID;
        const isArt =
          (art === 'stripe' && Math.abs(i - w / 2) < 1.5) ||
          (art === 'split' && i > w * 0.55) ||
          (art === 'rails' && j === 2) ||
          (art === 'dots' && j === 1 && i % 5 === 2);
        v = isArt ? S('boardArt', tone) : S('board', tone);
      }
      frame.set(x0 + i, y0 + j, v);
    }
  });
  if (sport === 'wing') {
    // mast, fuselage, front wing and stabilizer: always below the board, in the water
    const mx = ANCHOR_X + 2;
    for (let y = ANCHOR_Y; y < ANCHOR_Y + 20; y++) {
      frame.set(mx, y, S('foil', LIGHT));
      frame.set(mx + 1, y, S('foil', SHADE));
    }
    for (let x = mx - 12; x <= mx + 9; x++) frame.set(x, ANCHOR_Y + 20, S('foil', MID));
    for (let x = mx + 2; x <= mx + 10; x++) frame.set(x, ANCHOR_Y + 19, S('foil', LIGHT));
    for (let x = mx + 3; x <= mx + 9; x++) frame.set(x, ANCHOR_Y + 21, S('foil', SHADE));
    for (let x = mx - 13; x <= mx - 9; x++) frame.set(x, ANCHOR_Y + 19, S('foil', LIGHT));
  }
}

/** Pattern test shared by kites and wings: true where the secondary color shows on the canopy. */
function patternB(pattern: string, u: number, v: number): boolean {
  switch (pattern) {
    case 'split':
      return u > 0.5;
    case 'stripes':
      return Math.floor(u * 7) % 2 === 1;
    case 'tips':
      return u < 0.18 || u > 0.82;
    default:
      return v < 0;
  }
}

function drawWing(part: Raster, p: Pose, c: AthleteConfig): void {
  const [hx, hy] = p.handF;
  const pattern = GEAR_PATTERNS[c.gearPattern];
  // held up and ahead of the rider, leading edge facing forward
  const top: P = [hx + 2, hy - 21];
  const mid: P = [hx + 11, hy - 13];
  const tip: P = [hx + 17, hy + 2];
  const pts: P[] = [top, mid, tip, [hx + 9, hy + 4], [hx + 2, hy - 1], [hx, hy - 11]];
  const canopy = new Raster(FRAME_W, FRAME_H);
  canopy.polygon(
    pts.map((q) => at(q)),
    1,
  );
  const minY = ANCHOR_Y + top[1];
  const maxY = ANCHOR_Y + hy + 4;
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      if (canopy.get(x, y) !== 1) continue;
      const u = (y - minY) / (maxY - minY);
      part.set(x, y, patternB(pattern, u, 1) ? S('gearB', MID) : S('gearA', MID));
    }
  }
  shade(part, SLOT.gearA);
  shade(part, SLOT.gearB);
  // clear window
  const win = new Raster(FRAME_W, FRAME_H);
  win.polygon([at([hx + 4, hy - 13]), at([hx + 9, hy - 10]), at([hx + 9, hy - 5]), at([hx + 4, hy - 8])], 1);
  for (let i = 0; i < win.px.length; i++) if (win.px[i] === 1) part.px[i] = C.foamShadow;
  // inflatable leading edge and strut with the handles
  stroke(part, top, mid, 3, S('gearB', LIGHT));
  stroke(part, mid, tip, 3, S('gearB', MID));
  stroke(part, [hx + 10, hy - 12], [hx + 1, hy], 2, S('gearB', SHADE));
}

// ------------------------------------------------------------------ athlete

interface Coverage {
  upperArm: SlotName;
  foreArm: SlotName;
  thigh: SlotName;
  shin: SlotName;
}

function coverage(c: AthleteConfig): Coverage {
  switch (SUIT_STYLES[c.suitStyle]) {
    case 'full':
      return { upperArm: 'suitA', foreArm: 'suitA', thigh: 'suitA', shin: 'suitA' };
    case 'shorty':
      return { upperArm: 'suitA', foreArm: 'skin', thigh: 'suitA', shin: 'skin' };
    case 'swimsuit':
    case 'bikini':
      return { upperArm: 'skin', foreArm: 'skin', thigh: 'skin', shin: 'skin' };
    default:
      return { upperArm: 'suitA', foreArm: 'skin', thigh: 'suitB', shin: 'skin' };
  }
}

function limb(frame: Raster, a: P, b: P, width: number, slotName: SlotName): void {
  const part = newPart();
  stroke(part, a, b, width, S(slotName, MID));
  shade(part, SLOT[slotName]);
  composite(frame, part, true);
}

function blob(frame: Raster, p: P, w: number, h: number, slotName: SlotName, dx = 0, dy = 0): void {
  const part = newPart();
  const [x, y] = at(p, dx, dy);
  part.rect(x, y, w, h, S(slotName, MID));
  shade(part, SLOT[slotName]);
  composite(frame, part, true);
}

/**
 * Torso outlines as (t, half width) pairs from the hip (t = 0) to the
 * shoulders (t = 1), front side then back side. BOB: a wedge with broad
 * shoulders. BOBBA: an hourglass, with a bust on the front.
 */
const TORSO_BOB: { front: readonly P[]; back: readonly P[] } = {
  front: [[0, 3], [1, 4.2]],
  back: [[1, 4.2], [0, 3]],
};
const TORSO_BOBBA: { front: readonly P[]; back: readonly P[] } = {
  front: [[0, 3.4], [0.42, 1.8], [0.6, 2.6], [0.7, 3.7], [0.84, 2.7], [1, 2.9]],
  back: [[1, 2.9], [0.55, 2], [0.38, 2], [0, 3.6]],
};

function torso(frame: Raster, p: Pose, c: AthleteConfig, harness: boolean): void {
  const [hx, hy] = p.hip;
  const [cx, cy] = p.chest;
  const dx = cx - hx;
  const dy = cy - hy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const shape = c.character === 'bob' ? TORSO_BOB : TORSO_BOBBA;
  const outlinePts: [number, number][] = [];
  for (const [t, w] of shape.front) outlinePts.push(at([hx + dx * t + nx * w, hy + dy * t + ny * w]));
  for (const [t, w] of shape.back) outlinePts.push(at([hx + dx * t - nx * w, hy + dy * t - ny * w]));
  const part = newPart();
  const style = SUIT_STYLES[c.suitStyle];
  part.polygon(outlinePts, style === 'bikini' ? S('skin', MID) : S('suitA', MID));
  const [ax, ay] = at(p.hip);
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      if (part.get(x, y) === 0) continue;
      // position along the torso, 0 at the hip and 1 at the chest
      const t = ((x - ax) * dx + (y - ay) * dy) / (len * len);
      // signed distance across, negative toward the back
      const s = (x - ax) * nx + (y - ay) * ny;
      if (style === 'rashguard' && t < 0.12) part.set(x, y, S('suitB', MID));
      if (style === 'full' && s > 1.2) part.set(x, y, S('suitB', MID));
      if (style === 'shorty' && t > 0.55 && t < 0.72) part.set(x, y, S('suitB', MID));
      // one-piece: bare shoulders, a contrast band at the waist
      if (style === 'swimsuit' && t > 0.9) part.set(x, y, S('skin', MID));
      if (style === 'swimsuit' && t > 0.36 && t < 0.48) part.set(x, y, S('suitB', MID));
      // bikini: bottom and top, bare midriff
      if (style === 'bikini' && t < 0.24) part.set(x, y, S('suitB', MID));
      if (style === 'bikini' && t > 0.58 && t < 0.84) part.set(x, y, S('suitA', MID));
      if (harness && t > 0.08 && t < 0.3) part.set(x, y, S('harness', MID));
    }
  }
  shade(part, SLOT.suitA);
  shade(part, SLOT.suitB);
  shade(part, SLOT.harness);
  shade(part, SLOT.skin);
  composite(frame, part, false);
  if (harness) {
    // spreader bar hook at the front of the harness
    const [fx, fy] = at([hx + (cx - hx) * 0.22, hy + (cy - hy) * 0.22]);
    frame.set(Math.round(fx + 4), Math.round(fy), C.grey);
  }
}

function head(frame: Raster, p: Pose, c: AthleteConfig): void {
  const part = newPart();
  const [x, y] = at(p.head);
  blitRows(part, HEADS[c.character], x, y, { S: S('skin', MID), z: S('skin', SHADE), k: C.ink, l: C.rose });
  shade(part, SLOT.skin);
  composite(frame, part, false);

  const ox = x - OVERLAY_OFFSET;
  const oy = y - OVERLAY_OFFSET;
  const hair = newPart();
  blitRows(hair, HAIR[c.hairStyle], ox, oy, { h: S('hair', MID) });
  shade(hair, SLOT.hair);
  composite(frame, hair, false);
  if (c.helmet >= 0) {
    const helmet = newPart();
    blitRows(helmet, HELMET, ox, oy, { m: S('helmet', MID) });
    shade(helmet, SLOT.helmet);
    composite(frame, helmet, false);
  }
  if (c.glasses >= 0) blitRows(frame, GLASSES, ox, oy, { g: S('lens', LIGHT), G: S('lens', MID) });
}

/** Ink outline; along the top edge it uses the shadow tone of the pixel below, so the lit side stays soft. */
export function outline(frame: Raster): void {
  const src = Uint8Array.from(frame.px);
  const w = frame.w;
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= frame.h ? 0 : src[y * w + x]);
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] !== 0) continue;
      const down = get(x, y + 1);
      const others = get(x - 1, y) || get(x + 1, y) || get(x, y - 1);
      if (!down && !others) continue;
      const base = slotBase(down);
      frame.px[y * w + x] = down && !others && base >= 0 ? base + SHADE : C.ink;
    }
  }
}

/** Replaces single stray pixels whose four neighbours agree on another color. */
export function cleanOrphans(frame: Raster): void {
  const src = Uint8Array.from(frame.px);
  const w = frame.w;
  for (let y = 1; y < frame.h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v = src[y * w + x];
      if (v === 0 || v === C.ink) continue;
      const n = [src[y * w + x - 1], src[y * w + x + 1], src[(y - 1) * w + x], src[(y + 1) * w + x]];
      if (n.includes(v) || n.includes(0)) continue;
      for (const cand of n) {
        if (cand !== C.ink && n.filter((q) => q === cand).length >= 3) {
          frame.px[y * w + x] = cand;
          break;
        }
      }
    }
  }
}

export interface FrameInfo {
  /** Kite bar ends (frame coordinates), where the lines attach. */
  barTop: P;
  barBottom: P;
}

/** Builds one athlete frame in slot indices. */
export function composeFrame(c: AthleteConfig, sport: SportId, frame: FrameName): Raster {
  if (frame === 'fall') return rotateFrame(composeFrame(c, sport, 'air'), (75 * Math.PI) / 180);
  const p = poseFor(sport, frame);
  const f = new Raster(FRAME_W, FRAME_H);
  drawBoard(f, sport, c);
  drawBody(f, p, c, sport !== 'surf', (fr) => {
    // gear held in front, under the front arm
    if (sport === 'wing') {
      const wing = newPart();
      drawWing(wing, p, c);
      composite(fr, wing, false);
    }
    if (sport === 'kite') {
      const [bx, by] = at(p.handF, 1, -4);
      for (let y = by; y <= by + 7; y++) fr.set(bx, y, C.grey);
      fr.set(bx, by, C.ink);
      fr.set(bx, by + 7, C.ink);
    }
  });
  cleanOrphans(f);
  outline(f);
  return f;
}

/**
 * Draws the athlete's body in a pose: back arm and leg, torso, front leg,
 * head, then `held` (gear in the hands) and the front arm over it. No
 * outline: the caller adds props, then cleans and outlines the frame.
 */
export function drawBody(f: Raster, p: Pose, c: AthleteConfig, harness: boolean, held?: (f: Raster) => void): void {
  const cov = coverage(c);
  // BOBBA has slimmer arms
  const arm = c.character === 'bob' ? 3 : 2;
  // back arm, back leg
  limb(f, p.chest, p.elbowB, arm, cov.upperArm);
  limb(f, p.elbowB, p.handB, 2, cov.foreArm);
  blob(f, p.handB, 2, 2, 'skin', -1, -1);
  limb(f, p.hip, p.kneeB, 4, cov.thigh);
  limb(f, p.kneeB, p.footB, 3, cov.shin);
  blob(f, p.footB, 4, 2, 'skin', -2, 0);
  // torso, front leg
  torso(f, p, c, harness);
  limb(f, p.hip, p.kneeF, 4, cov.thigh);
  limb(f, p.kneeF, p.footF, 3, cov.shin);
  blob(f, p.footF, 4, 2, 'skin', -1, 0);
  if (SUIT_STYLES[c.suitStyle] === 'full') {
    // ankle and wrist cuffs in the accent color
    blob(f, p.footF, 3, 1, 'suitB', -1, -2);
    blob(f, p.footB, 3, 1, 'suitB', -2, -2);
  }
  // neck and head
  limb(f, [p.head[0] + 4, p.head[1] + 9], p.chest, 2, 'skin');
  head(f, p, c);
  held?.(f);
  limb(f, p.chest, p.elbowF, arm, cov.upperArm);
  limb(f, p.elbowF, p.handF, 2, cov.foreArm);
  blob(f, p.handF, 2, 2, 'skin', -1, -1);
}

/** Kite bar ends for a frame, so lines can be drawn to the kite. */
export function frameInfo(sport: SportId, frame: FrameName): FrameInfo {
  const p = poseFor(sport, frame === 'fall' ? 'air' : frame);
  const [bx, by] = at(p.handF, 1, -4);
  return { barTop: [bx, by], barBottom: [bx, by + 7] };
}

/** Nearest-neighbour rotation around the pivot; keeps the pixel grid crisp. */
export function rotateFrame(src: Raster, angle: number): Raster {
  const out = new Raster(src.w, src.h);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const dx = x + 0.5 - PIVOT_X;
      const dy = y + 0.5 - PIVOT_Y;
      const sx = Math.floor(PIVOT_X + dx * cos + dy * sin);
      const sy = Math.floor(PIVOT_Y - dx * sin + dy * cos);
      const v = src.get(sx, sy);
      if (v) out.px[y * out.w + x] = v;
    }
  }
  return out;
}

// ------------------------------------------------------------------ kite

export const KITE_W = 60;
export const KITE_H = 30;

/** Leading-edge inflatable kite seen from the side, with the line attachment points at its tips. */
export function composeKite(c: AthleteConfig, flex: number): { raster: Raster; tipL: P; tipR: P } {
  const r = new Raster(KITE_W, KITE_H);
  const cx = KITE_W / 2;
  const cy = 28 + flex;
  const R = 27;
  const inner = 20;
  const span = 1.15 - flex * 0.03;
  const pattern = GEAR_PATTERNS[c.gearPattern];
  for (let y = 0; y < KITE_H; y++) {
    for (let x = 0; x < KITE_W; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dx, -dy);
      if (d > R || d < inner || Math.abs(ang) > span) continue;
      const u = (ang + span) / (2 * span);
      let v: number;
      if (d > R - 2.5) v = S('gearB', d > R - 1.2 ? LIGHT : MID);
      else if (Math.abs(Math.round(u * 6) - u * 6) < 0.09) v = S('gearA', SHADE);
      else v = patternB(pattern, u, 1) ? S('gearB', MID) : S('gearA', MID);
      r.set(x, y, v);
    }
  }
  shade(r, SLOT.gearA);
  outline(r);
  const tipX = Math.sin(span) * (inner + 2);
  const tipY = cy - Math.cos(span) * (inner + 2);
  return { raster: r, tipL: [Math.round(cx - tipX), Math.round(tipY)], tipR: [Math.round(cx + tipX), Math.round(tipY)] };
}
