/** Target internal height in game pixels (landscape). */
export const TARGET_HEIGHT = 270;
/** Narrowest scene we allow; below this the scale drops so the scene keeps its width. */
export const MIN_WIDTH = 360;
/** Widest scene, so ultra-wide screens do not see much further ahead. */
export const MAX_WIDTH = 640;

export interface Layout {
  /** Internal resolution in game pixels. */
  readonly width: number;
  readonly height: number;
  /** Device pixels per game pixel, always an integer. */
  readonly scale: number;
  /** Canvas backing size in device pixels (= internal size × scale). */
  readonly deviceWidth: number;
  readonly deviceHeight: number;
  /** Canvas box in CSS pixels, aligned to whole device pixels. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly cssLeft: number;
  readonly cssTop: number;
}

/**
 * Fills the viewport with an integer scale, so every game pixel is the same
 * whole number of device pixels. Landscape keeps the internal height close
 * to TARGET_HEIGHT; portrait keeps at least MIN_WIDTH and simply gets a
 * taller scene (more sky and sea, same view ahead).
 */
export function computeLayout(cssW: number, cssH: number, dpr: number): Layout {
  const ratio = dpr > 0 ? dpr : 1;
  const devW = Math.max(1, Math.floor(cssW * ratio));
  const devH = Math.max(1, Math.floor(cssH * ratio));

  let scale = Math.max(1, Math.round(devH / TARGET_HEIGHT));
  if (Math.floor(devW / scale) < MIN_WIDTH) scale = Math.max(1, Math.floor(devW / MIN_WIDTH));

  const width = Math.min(MAX_WIDTH, Math.floor(devW / scale));
  const height = Math.floor(devH / scale);
  const deviceWidth = width * scale;
  const deviceHeight = height * scale;
  const left = Math.floor((devW - deviceWidth) / 2);
  const top = Math.floor((devH - deviceHeight) / 2);

  return {
    width,
    height,
    scale,
    deviceWidth,
    deviceHeight,
    cssWidth: deviceWidth / ratio,
    cssHeight: deviceHeight / ratio,
    cssLeft: left / ratio,
    cssTop: top / ratio,
  };
}
