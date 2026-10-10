import { Rng } from '../core/rng.ts';
import { CHARACTERS, defaultConfig, randomize, type AthleteConfig } from '../custom/athlete.ts';
import { SPORTS, type SportId } from '../game/sport.ts';
import { FRAME_NAMES } from '../sprites/compose.ts';
import { SPIN_STEPS, SpriteCache, type AthleteSprites } from '../sprites/sheet.ts';

/**
 * Development page to review the sprites: every frame of BOB, BOBBA and a
 * few random looks, looping animations, zoom x1/x4/x8. Not part of the build.
 */

const ZOOMS = [1, 4, 8] as const;
const RANDOM_LOOKS = 4;

const cache = new SpriteCache(64);
const rng = new Rng((Date.now() & 0x7fffffff) || 1);
let sport: SportId = 'surf';
let zoom: number = 4;
let randoms: AthleteConfig[] = [];
const animations: { canvas: HTMLCanvasElement; set: AthleteSprites; mode: 'ride' | 'spin' }[] = [];

function rollRandoms(): void {
  randoms = [];
  for (let i = 0; i < RANDOM_LOOKS; i++) {
    const c = defaultConfig(CHARACTERS[i % 2], sport);
    randomize(c, sport, rng);
    randoms.push(c);
  }
}

function scaled(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')?.drawImage(src, 0, 0);
  c.style.width = `${src.width * zoom}px`;
  c.style.height = `${src.height * zoom}px`;
  return c;
}

function figure(canvas: HTMLCanvasElement, caption: string, anim = false): HTMLElement {
  const f = document.createElement('figure');
  if (anim) f.className = 'anim';
  f.append(canvas);
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  f.append(cap);
  return f;
}

function animated(set: AthleteSprites, mode: 'ride' | 'spin'): HTMLCanvasElement {
  const c = scaled(set.frames.ride0);
  animations.push({ canvas: c, set, mode });
  return c;
}

function lookRow(title: string, look: AthleteConfig): HTMLElement {
  const set = cache.get(look, sport);
  const div = document.createElement('section');
  div.className = 'look';
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  row.append(figure(animated(set, 'ride'), 'ride loop', true));
  if (set.spins.length) row.append(figure(animated(set, 'spin'), 'spin loop', true));
  for (const name of FRAME_NAMES) row.append(figure(scaled(set.frames[name]), name));
  set.kite.forEach((k, i) => row.append(figure(scaled(k), `kite ${i}`)));
  div.append(h, row);
  return div;
}

function controls(): void {
  const bar = document.getElementById('controls');
  if (!bar) return;
  bar.replaceChildren();
  const button = (label: string, on: boolean, click: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (on) b.className = 'on';
    b.onclick = click;
    bar.append(b);
  };
  for (const s of SPORTS) button(s.toUpperCase(), s === sport, () => ((sport = s), rollRandoms(), refresh()));
  for (const z of ZOOMS) button(`x${z}`, z === zoom, () => ((zoom = z), refresh()));
  button('RANDOM LOOKS', false, () => (rollRandoms(), refresh()));
}

function refresh(): void {
  controls();
  animations.length = 0;
  const sheet = document.getElementById('sheet');
  if (!sheet) return;
  sheet.replaceChildren(
    lookRow(`BOB · ${sport}`, defaultConfig('bob', sport)),
    lookRow(`BOBBA · ${sport}`, defaultConfig('bobba', sport)),
    ...randoms.map((c, i) => lookRow(`random ${i + 1} (${c.character.toUpperCase()})`, c)),
  );
}

function tick(now: number): void {
  const ride = ['ride0', 'ride1', 'ride2', 'ride3'] as const;
  for (const a of animations) {
    const ctx = a.canvas.getContext('2d');
    if (!ctx) continue;
    const img = a.mode === 'ride' ? a.set.frames[ride[Math.floor(now / 140) % 4]] : a.set.spins[Math.floor(now / 40) % SPIN_STEPS];
    ctx.clearRect(0, 0, a.canvas.width, a.canvas.height);
    ctx.drawImage(img, 0, 0);
  }
  requestAnimationFrame(tick);
}

rollRandoms();
refresh();
requestAnimationFrame(tick);
