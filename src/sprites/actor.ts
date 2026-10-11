import type { AthleteConfig } from '../custom/athlete.ts';
import { C } from '../render/palette.ts';
import {
  ANCHOR_X,
  ANCHOR_Y,
  FRAME_H,
  FRAME_W,
  at,
  blitRows,
  cleanOrphans,
  composeFrame,
  drawBody,
  outline,
  shade,
  stroke,
  composite,
  newPart,
  S,
  type P,
  type Pose,
} from './compose.ts';
import { OVERLAY_OFFSET } from './parts.ts';
import { LIGHT, MID, SHADE, SLOT } from './ramps.ts';
import { Raster } from './raster.ts';
import { boatHeadings, surferHeadings } from './topdown.ts';

/**
 * BOB and BOBBA away from the runner: paddling a SUP, fishing, swimming
 * with mask and fins, standing on a deck, surfing a slope, seen from
 * above on a board or in a dinghy (sprites/topdown.ts). Same body,
 * same customization, different poses and props.
 */
export type ActorKind = 'paddle' | 'fish' | 'swim' | 'photo' | 'stand' | 'slope' | 'top' | 'boat';

/** Frames per kind; for swim, photo and slope the frames are laid out by angle (see below). */
export const PADDLE_FRAMES = 4;
export const FISH_FRAMES = { hold: 0, back: 1, throw: 2, reel0: 3, reel1: 4 } as const;
export const STAND_FRAMES = { idle: 0, wind: 1, throw: 2, pull0: 3, pull1: 4, cheer: 5 } as const;

/** Swimmers: angle steps from -SWIM_MAX to +SWIM_MAX (0 = level, facing right, positive = nose down), 4 kicks each. */
export const SWIM_STEPS = 9;
export const SWIM_MAX = Math.PI / 3;
export const SWIM_KICKS = 4;
/** Swim frames are SWIM_SIZE square, the body's middle at the center. */
export const SWIM_SIZE = 96;

/** Slope surfers: angle steps from -SLOPE_MAX to +SLOPE_MAX (positive = nose down), ride and air frames. */
export const SLOPE_STEPS = 17;
export const SLOPE_MAX = (40 * Math.PI) / 180;

export function swimIndex(angle: number, kick: number): number {
  const k = Math.round(((clamp(angle, -SWIM_MAX, SWIM_MAX) + SWIM_MAX) / (2 * SWIM_MAX)) * (SWIM_STEPS - 1));
  return k * SWIM_KICKS + (kick & 3);
}

export function slopeIndex(angle: number, air: boolean): number {
  const k = Math.round(((clamp(angle, -SLOPE_MAX, SLOPE_MAX) + SLOPE_MAX) / (2 * SLOPE_MAX)) * (SLOPE_STEPS - 1));
  return k * 2 + (air ? 1 : 0);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** An elbow between shoulder and hand, pushed out sideways by `bend` pixels. */
function elbow(chest: P, hand: P, bend: number): P {
  const mx = (chest[0] + hand[0]) / 2;
  const my = (chest[1] + hand[1]) / 2;
  const dx = hand[0] - chest[0];
  const dy = hand[1] - chest[1];
  const len = Math.hypot(dx, dy) || 1;
  return [Math.round(mx + (dy / len) * bend), Math.round(my - (dx / len) * bend)];
}

function pose(base: Omit<Pose, 'elbowB' | 'elbowF'>, bendB = 2, bendF = 2): Pose {
  return { ...base, elbowB: elbow(base.chest, base.handB, bendB), elbowF: elbow(base.chest, base.handF, bendF) };
}

// ------------------------------------------------------------------ SUP

const SUP_LEGS = { footB: [-4, -6] as P, kneeB: [-2, -14] as P, hip: [0, -21] as P, kneeF: [5, -14] as P, footF: [3, -6] as P };

/** Paddle stroke: reach, catch, pull, recovery. The blade end is where the paddle meets (or leaves) the water. */
const PADDLE: readonly { pose: Pose; blade: P }[] = [
  { pose: pose({ ...SUP_LEGS, chest: [5, -32], head: [4, -44], handB: [10, -39], handF: [15, -22] }, -2, 2), blade: [25, 8] },
  { pose: pose({ ...SUP_LEGS, chest: [3, -33], head: [2, -45], handB: [6, -39], handF: [10, -22] }, -2, 2), blade: [17, 9] },
  { pose: pose({ ...SUP_LEGS, chest: [1, -34], head: [0, -46], handB: [4, -38], handF: [1, -22] }, -2, 2), blade: [-7, 9] },
  { pose: pose({ ...SUP_LEGS, chest: [2, -33], head: [1, -45], handB: [1, -37], handF: [8, -27] }, -2, 2), blade: [24, -6] },
];

/** A long stand-up paddle board, nose to the right. */
function supBoard(f: Raster, c: AthleteConfig): void {
  const w = 44;
  const x0 = ANCHOR_X - 22;
  const y0 = ANCHOR_Y - 4;
  for (let i = 0; i < w; i++) {
    const nose = i > w - 4;
    const tail = i < 2;
    if (!tail && !nose) f.set(x0 + i, y0 + 1, S('board', LIGHT));
    f.set(x0 + i, y0 + 2, nose ? S('board', LIGHT) : S('board', MID));
    if (i > 1 && i < w - 2) f.set(x0 + i, y0 + 3, S('board', SHADE));
    if (c.boardArt > 0 && i > 6 && i < w - 6 && i % 2 === 0) f.set(x0 + i, y0 + 2, S('boardArt', MID));
  }
  f.set(x0 + w - 2, y0, S('board', LIGHT));
  // fin
  f.set(x0 + 4, y0 + 4, C.slate);
  f.set(x0 + 5, y0 + 4, C.slate);
}

function paddle(f: Raster, top: P, blade: P): void {
  const dx = blade[0] - top[0];
  const dy = blade[1] - top[1];
  const len = Math.hypot(dx, dy) || 1;
  // T-grip above the top hand
  const grip: P = [Math.round(top[0] - (dx / len) * 3), Math.round(top[1] - (dy / len) * 3)];
  stroke(f, grip, blade, 1, C.slate);
  const bladeStart: P = [Math.round(blade[0] - (dx / len) * 9), Math.round(blade[1] - (dy / len) * 9)];
  stroke(f, bladeStart, blade, 3, S('gearA', MID));
  stroke(f, [grip[0] - 1, grip[1]], [grip[0] + 1, grip[1]], 1, C.ink);
}

// ------------------------------------------------------------------ fishing

const FISH_LEGS = { footB: [-4, -6] as P, kneeB: [-3, -14] as P, hip: [0, -21] as P, kneeF: [4, -14] as P, footF: [3, -6] as P };

/** Rod butt (in the back hand) and tip for each fishing frame; `bend` curves the rod. */
const FISHING: readonly { pose: Pose; butt: P; tip: P; bend: number }[] = [
  { pose: pose({ ...FISH_LEGS, chest: [1, -33], head: [0, -45], handB: [4, -23], handF: [8, -27] }, 2, 2), butt: [2, -20], tip: [24, -52], bend: 0 },
  { pose: pose({ ...FISH_LEGS, chest: [-1, -33], head: [-2, -45], handB: [-2, -39], handF: [2, -42] }, -2, -2), butt: [0, -36], tip: [-24, -55], bend: 0 },
  { pose: pose({ ...FISH_LEGS, chest: [4, -32], head: [3, -44], handB: [8, -33], handF: [12, -35] }, 2, 2), butt: [5, -31], tip: [42, -30], bend: 0 },
  { pose: pose({ ...FISH_LEGS, chest: [-1, -33], head: [-2, -45], handB: [3, -29], handF: [8, -31] }, 2, 2), butt: [1, -26], tip: [22, -54], bend: 5 },
  { pose: pose({ ...FISH_LEGS, chest: [-1, -33], head: [-2, -45], handB: [3, -29], handF: [6, -27] }, 2, 2), butt: [1, -26], tip: [22, -54], bend: 5 },
];

function rod(f: Raster, butt: P, tip: P, bend: number): void {
  // quadratic curve, bent forward and down toward the tip
  const cx = (butt[0] + tip[0]) / 2 + bend;
  const cy = (butt[1] + tip[1]) / 2 - bend;
  let px = butt[0];
  let py = butt[1];
  for (let i = 1; i <= 16; i++) {
    const t = i / 16;
    const x = Math.round((1 - t) * (1 - t) * butt[0] + 2 * (1 - t) * t * cx + t * t * tip[0]);
    const y = Math.round((1 - t) * (1 - t) * butt[1] + 2 * (1 - t) * t * cy + t * t * tip[1]);
    stroke(f, [px, py], [x, y], 1, i < 4 ? C.ink : C.brown);
    px = x;
    py = y;
  }
  // the reel
  const [rx, ry] = at([butt[0] + Math.round((tip[0] - butt[0]) / 8), butt[1] + Math.round((tip[1] - butt[1]) / 8)]);
  f.rect(rx - 1, ry + 1, 2, 2, C.silver);
}

// ------------------------------------------------------------------ swimming

/** Upright streamline, rotated later: arms over the head, legs kicking along x. */
function swimPose(kick: number, photo: boolean): Pose {
  const k = [0, 2, 0, -2][kick];
  const arms = photo
    ? { handB: [5, -50] as P, handF: [6, -49] as P }
    : { handB: [-1, -55] as P, handF: [2, -55] as P };
  return pose(
    {
      footB: [-1 - k, -2],
      kneeB: [-1 - Math.round(k / 2), -11],
      hip: [0, -20],
      kneeF: [1 + Math.round(k / 2), -11],
      footF: [1 + k, -2],
      chest: [0, -32],
      head: [-3, -45],
      ...arms,
    },
    photo ? -3 : -1,
    photo ? 3 : 1,
  );
}

const MASK: readonly string[] = [
  '................',
  '................',
  '................',
  '................',
  '........mmmmm...',
  '..mmmmmmmGGGm...',
  '........mGGGm...',
  '........mmmmm...',
];

/** Fins on both feet, pointing down (they end up behind the swimmer). */
function fins(f: Raster, p: Pose): void {
  for (const foot of [p.footB, p.footF]) {
    const [x, y] = at(foot);
    const part = newPart();
    part.polygon(
      [
        [x - 2, y],
        [x + 2, y],
        [x + 3, y + 11],
        [x - 3, y + 11],
      ],
      S('gearA', MID),
    );
    shade(part, SLOT.gearA);
    composite(f, part, true);
  }
}

function camera(f: Raster, p: Pose): void {
  const [x, y] = at(p.handF, -2, -6);
  f.rect(x, y, 6, 5, C.slate);
  f.rect(x + 1, y + 1, 4, 3, C.grey);
  f.rect(x + 2, y - 1, 2, 1, C.ink);
  f.set(x + 2, y + 2, C.skyLight);
}

// ------------------------------------------------------------------ standing

const STAND_LEGS = { footB: [-4, -2] as P, kneeB: [-3, -11] as P, hip: [0, -19] as P, kneeF: [3, -11] as P, footF: [3, -2] as P };

const STAND: readonly Pose[] = [
  pose({ ...STAND_LEGS, chest: [1, -31], head: [-1, -43], handB: [-2, -18], handF: [4, -18] }, -1, 1),
  pose({ ...STAND_LEGS, chest: [-1, -31], head: [-3, -43], handB: [9, -27], handF: [-10, -42] }, 2, 3),
  pose({ ...STAND_LEGS, chest: [3, -31], head: [2, -43], handB: [-8, -23], handF: [15, -38] }, -2, 2),
  pose({ ...STAND_LEGS, chest: [-2, -31], head: [-4, -43], handB: [8, -28], handF: [12, -27] }, 2, 1),
  pose({ ...STAND_LEGS, chest: [-2, -31], head: [-4, -43], handB: [5, -27], handF: [8, -26] }, 2, 1),
  pose({ ...STAND_LEGS, chest: [1, -31], head: [-1, -43], handB: [-4, -50], handF: [7, -50] }, -2, 2),
];

// ------------------------------------------------------------------ rotation

/** Nearest-neighbour rotation of src around (sx, sy) into a w×h raster around (ox, oy). */
export function rotateInto(src: Raster, angle: number, sx: number, sy: number, w: number, h: number, ox: number, oy: number): Raster {
  const out = new Raster(w, h);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - ox;
      const dy = y + 0.5 - oy;
      const v = src.get(Math.floor(sx + dx * cos + dy * sin), Math.floor(sy - dx * sin + dy * cos));
      if (v) out.px[y * w + x] = v;
    }
  }
  return out;
}

// ------------------------------------------------------------------ builders

function finish(f: Raster): Raster {
  cleanOrphans(f);
  outline(f);
  return f;
}

/** Every frame of one kind, in slot indices (see the frame layouts above). */
export function composeActor(c: AthleteConfig, kind: ActorKind): Raster[] {
  const out: Raster[] = [];
  switch (kind) {
    case 'paddle':
      for (const { pose: p, blade } of PADDLE) {
        const f = new Raster(FRAME_W, FRAME_H);
        supBoard(f, c);
        drawBody(f, p, c, false, (fr) => paddle(fr, p.handB, blade));
        out.push(finish(f));
      }
      return out;
    case 'fish':
      for (const { pose: p, butt, tip, bend } of FISHING) {
        const f = new Raster(FRAME_W, FRAME_H);
        supBoard(f, c);
        drawBody(f, p, c, false, (fr) => rod(fr, butt, tip, bend));
        out.push(finish(f));
      }
      return out;
    case 'stand':
      STAND.forEach((p, i) => {
        const f = new Raster(FRAME_W, FRAME_H);
        drawBody(f, p, c, false, (fr) => {
          if (i === STAND_FRAMES.wind || i === STAND_FRAMES.throw) {
            const [x, y] = at(p.handF);
            fr.rect(x - 1, y - 3, 1, 3, C.silver);
            fr.rect(x, y - 4, 2, 1, C.silver);
          }
        });
        out.push(finish(f));
      });
      return out;
    case 'swim':
    case 'photo': {
      const photo = kind === 'photo';
      const upright: Raster[] = [];
      for (let k = 0; k < SWIM_KICKS; k++) {
        const f = new Raster(FRAME_W, FRAME_H + 12);
        const p = swimPose(k, photo);
        fins(f, p);
        drawBody(f, p, c, false, (fr) => {
          const [hx, hy] = at(p.head);
          blitRows(fr, MASK, hx - OVERLAY_OFFSET, hy - OVERLAY_OFFSET, { m: C.slate, G: C.skyLight });
          if (photo) camera(fr, p);
        });
        upright.push(finish(f));
      }
      // body middle in the upright frame
      const cx = ANCHOR_X + 0.5;
      const cy = ANCHOR_Y - 24;
      for (let s = 0; s < SWIM_STEPS; s++) {
        const a = -SWIM_MAX + (2 * SWIM_MAX * s) / (SWIM_STEPS - 1);
        for (const f of upright) out.push(rotateInto(f, Math.PI / 2 + a, cx, cy, SWIM_SIZE, SWIM_SIZE, SWIM_SIZE / 2, SWIM_SIZE / 2));
      }
      return out;
    }
    case 'top':
      return surferHeadings(c);
    case 'boat':
      return boatHeadings(c);
    case 'slope': {
      const ride = composeFrame(c, 'surf', 'ride0');
      const air = composeFrame(c, 'surf', 'air');
      for (let s = 0; s < SLOPE_STEPS; s++) {
        // positive angles point the nose down: a clockwise turn on screen
        const a = -SLOPE_MAX + (2 * SLOPE_MAX * s) / (SLOPE_STEPS - 1);
        out.push(rotateInto(ride, a, ANCHOR_X + 0.5, ANCHOR_Y, FRAME_W, FRAME_H, ANCHOR_X + 0.5, ANCHOR_Y));
        out.push(rotateInto(air, a, ANCHOR_X + 0.5, ANCHOR_Y, FRAME_W, FRAME_H, ANCHOR_X + 0.5, ANCHOR_Y));
      }
      return out;
    }
  }
}

/** Where the fishing line leaves the rod tip, in frame pixels, for each fishing frame. */
export function rodTip(frame: number): readonly [number, number] {
  const f = FISHING[frame] ?? FISHING[0];
  return at(f.tip);
}

/** Where the paddle blade is, in frame pixels (for splashes). */
export function bladeTip(frame: number): readonly [number, number] {
  return at(PADDLE[frame % PADDLE.length].blade);
}
