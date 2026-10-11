import type { GameId } from '../games/registry.ts';
import { C } from '../render/palette.ts';
import { Raster } from './raster.ts';

/** Icons of the home carousel and the menu buttons, 16×16, drawn in code. */
export type IconName = GameId | 'look' | 'missions' | 'album';
export const ICON = 16;

function ink(r: Raster): Raster {
  const src = Uint8Array.from(r.px);
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : src[y * r.w + x]);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (src[y * r.w + x] !== 0) continue;
      if (get(x - 1, y) || get(x + 1, y) || get(x, y - 1) || get(x, y + 1)) r.px[y * r.w + x] = C.ink;
    }
  }
  return r;
}

/** Sea with a little foam, filling rows y..15. */
function sea(r: Raster, y: number): void {
  r.rect(0, y, 16, 16 - y, C.sea);
  r.rect(0, y, 16, 1, C.turquoise);
  for (let x = 1; x < 16; x += 5) r.set(x, y + 2, C.aqua);
}

function fish(r: Raster, x: number, y: number, body: number, tail: number): void {
  r.ellipse(x + 3, y + 2, 3, 2, body);
  r.polygon([[x - 2, y], [x + 1, y + 2], [x - 2, y + 4]], tail);
  r.set(x + 5, y + 1, C.ink);
}

const DRAW: Record<IconName, (r: Raster) => void> = {
  runner(r) {
    sea(r, 11);
    r.polygon([[1, 11], [5, 4], [10, 2], [14, 5], [9, 5], [6, 9], [5, 11]], C.turquoise);
    r.line(5, 4, 10, 2, C.white);
    r.polygon([[6, 10], [13, 6], [14, 7], [7, 11]], C.coral);
  },
  swells(r) {
    r.circle(11, 4, 3, C.sun);
    r.polygon([[0, 12], [4, 8], [8, 12], [12, 9], [16, 12], [16, 16], [0, 16]], C.sea);
    r.line(0, 12, 4, 8, C.aqua);
    r.line(8, 12, 12, 9, C.aqua);
  },
  fishing(r) {
    r.line(1, 14, 12, 2, C.brown);
    r.line(12, 2, 12, 9, C.silver);
    r.rect(11, 9, 2, 2, C.silver);
    fish(r, 4, 9, C.gold, C.orange);
  },
  freedive(r) {
    r.rect(2, 5, 12, 6, C.navy);
    r.rect(3, 6, 4, 4, C.skyLight);
    r.rect(9, 6, 4, 4, C.skyLight);
    r.rect(13, 1, 2, 9, C.gold);
    r.set(5, 13, C.aqua);
    r.set(8, 14, C.aqua);
    r.set(6, 15, C.aqua);
  },
  snap(r) {
    r.rect(1, 5, 14, 9, C.slate);
    r.rect(5, 3, 6, 2, C.slate);
    r.circle(8, 9, 3, C.navy);
    r.circle(8, 9, 1, C.sky);
    r.rect(12, 6, 2, 1, C.gold);
  },
  sup(r) {
    sea(r, 12);
    r.rect(1, 10, 14, 2, C.white);
    r.line(10, 1, 6, 13, C.brown);
    r.rect(4, 12, 3, 3, C.brown);
  },
  regatta(r) {
    sea(r, 12);
    r.polygon([[3, 11], [13, 11], [11, 14], [5, 14]], C.white);
    r.polygon([[8, 1], [8, 10], [2, 10]], C.white);
    r.polygon([[9, 3], [9, 10], [13, 10]], C.coral);
  },
  slalom(r) {
    r.rect(0, 0, 16, 16, C.sea);
    r.rect(1, 2, 1, 10, C.white);
    r.polygon([[2, 2], [5, 3], [2, 4]], C.red);
    r.rect(14, 4, 1, 10, C.white);
    r.polygon([[13, 4], [10, 5], [13, 6]], C.red);
    r.polygon([[7, 6], [9, 6], [9, 14], [7, 14]], C.gold);
  },
  wreck(r) {
    r.line(8, 0, 8, 6, C.silver);
    r.polygon([[6, 6], [10, 6], [10, 8], [6, 8]], C.grey);
    r.rect(3, 10, 10, 5, C.brown);
    r.rect(3, 10, 10, 2, C.tan);
    r.rect(7, 12, 2, 2, C.gold);
  },
  raft(r) {
    sea(r, 12);
    r.rect(1, 10, 14, 3, C.tan);
    for (let x = 3; x < 15; x += 3) r.rect(x, 10, 1, 3, C.brown);
    r.line(7, 1, 7, 9, C.brown);
    r.polygon([[8, 2], [13, 8], [8, 8]], C.white);
  },
  reef(r) {
    r.rect(0, 0, 16, 16, C.deep);
    r.rect(0, 13, 16, 3, C.tan);
    r.line(4, 13, 4, 6, C.coral);
    r.line(4, 9, 2, 7, C.coral);
    r.line(4, 8, 7, 5, C.coral);
    r.line(11, 13, 11, 8, C.rose);
    r.line(11, 10, 13, 7, C.rose);
    r.polygon([[8, 1], [14, 1], [14, 5], [11, 7], [8, 5]], C.gold);
  },
  gull(r) {
    r.polygon([[1, 6], [7, 9], [14, 6], [8, 11]], C.white);
    r.line(1, 6, 4, 6, C.grey);
    r.line(14, 6, 11, 6, C.grey);
    r.rect(13, 9, 2, 1, C.orange);
  },
  aquarium(r) {
    r.rect(1, 2, 14, 13, C.sky);
    r.rect(1, 2, 14, 2, C.skyLight);
    r.rect(1, 12, 14, 3, C.tan);
    fish(r, 4, 6, C.coral, C.orange);
    r.line(12, 12, 12, 7, C.green);
  },
  look(r) {
    r.polygon([[4, 2], [12, 2], [15, 6], [12, 7], [12, 15], [4, 15], [4, 7], [1, 6]], C.coral);
    r.rect(6, 2, 4, 2, C.ink);
    r.rect(4, 9, 8, 2, C.gold);
  },
  missions(r) {
    r.line(3, 1, 3, 15, C.brown);
    r.polygon([[4, 2], [14, 4], [4, 8]], C.gold);
  },
  album(r) {
    r.rect(2, 2, 12, 13, C.violet);
    r.rect(4, 2, 1, 13, C.indigo);
    r.rect(7, 5, 5, 4, C.white);
    fish(r, 8, 5, C.sky, C.blue);
  },
};

export function iconRaster(name: IconName): Raster {
  const r = new Raster(ICON, ICON);
  DRAW[name](r);
  return ink(r);
}
