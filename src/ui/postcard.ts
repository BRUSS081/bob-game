import type { CharacterId } from '../custom/athlete.ts';
import type { RunStats } from '../game/game.ts';
import type { SportId } from '../game/sport.ts';
import { t } from '../i18n/strings.ts';
import { digitCount, GLYPH_H } from '../render/font.ts';
import { C } from '../render/palette.ts';
import type { PoseView, Renderer } from '../render/renderer.ts';
import type { AthleteSprites } from '../sprites/sheet.ts';

const W = 240;
const H = 135;
const SCALE = 4;

export interface PostcardRun {
  sprites: AthleteSprites;
  sport: SportId;
  rider: CharacterId;
  points: number;
  stats: RunStats;
  /** Day of the daily challenge, empty for a normal run. */
  day: string;
}

/** The athlete caught mid-jump; the kite flies high above, so the kiter stays lower. */
const ALTITUDE: Record<SportId, number> = { surf: 30, kite: 6, wing: 22 };
const jump = { state: 'air', y: 0, prevY: 0, rotation: 0, prevRotation: 0, stateTime: 1 } satisfies PoseView;

/**
 * A pixel-art postcard of the run: the athlete in the air over the sea,
 * rider, sport, score and best combo. Drawn by the game's own renderer
 * into a small canvas, then scaled up without smoothing.
 */
export function drawPostcard(r: Renderer, run: PostcardRun): HTMLCanvasElement {
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const ctx = small.getContext('2d', { alpha: false });
  const out = document.createElement('canvas');
  out.width = W * SCALE;
  out.height = H * SCALE;
  const outCtx = out.getContext('2d', { alpha: false });
  if (!ctx || !outCtx) return out;
  ctx.imageSmoothingEnabled = false;

  // borrow the renderer for a moment; the next frame's begin() restores it
  const saved = { ctx: r.ctx, W: r.W, H: r.H, seaY: r.seaY, u: r.u };
  r.ctx = ctx;
  r.W = W;
  r.H = H;
  // a lower horizon for the kite, which flies high above the rider
  r.seaY = run.sport === 'kite' ? H - 22 : H - 34;
  r.u = 1;
  try {
    r.backdrop(180);
    jump.y = jump.prevY = ALTITUDE[run.sport];
    r.athlete(run.sprites, run.sport, jump, 46, 1, 0.3, 1, r.seaY, 16);
    r.surfaceFront(180);

    // text block, right-aligned
    const right = W - 8;
    let y = 8;
    r.text(t.title, right - r.font.width(t.title, 3), y, C.white, 3);
    y += (GLYPH_H + 3) * 3;
    const who = `${t.characters[run.rider]} - ${t.sports[run.sport]}`;
    r.text(who, right - r.font.width(who, 1), y, C.sun, 1);
    y += GLYPH_H + 5;
    r.text(t.postcard.score, right - r.font.width(t.postcard.score, 1), y, C.skyPale, 1);
    y += GLYPH_H + 3;
    const digits = digitCount(run.points);
    r.number(run.points, digits, right - r.font.widthOf(digits, 2), y, C.white, 2);
    y += (GLYPH_H + 3) * 2;
    if (run.stats.bestCombo > 1) {
      const combo = `${t.postcard.combo} x${run.stats.bestCombo}`;
      r.text(combo, right - r.font.width(combo, 1), y, C.gold, 1);
      y += GLYPH_H + 3;
    }
    if (run.day) {
      const daily = `${t.postcard.daily} ${run.day}`;
      r.text(daily, right - r.font.width(daily, 1), y, C.skyPale, 1);
    }
  } finally {
    r.ctx = saved.ctx;
    r.W = saved.W;
    r.H = saved.H;
    r.seaY = saved.seaY;
    r.u = saved.u;
  }

  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

/** Shares the postcard where the browser can (phones), otherwise downloads it. */
export async function sharePostcard(r: Renderer, run: PostcardRun): Promise<void> {
  const canvas = drawPostcard(r, run);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const name = `bob-${run.sport}-${run.points}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'BOB' });
      return;
    } catch {
      // cancelled or refused: fall back to a download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
