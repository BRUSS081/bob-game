import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/loop.ts';
import { KiteAthlete, UNDER, WingAthlete, newBoxes } from '../src/game/athletes.ts';
import { KITE, WING } from '../src/game/config.ts';

function fly(a: KiteAthlete, steps: number, pressed = false, held = false) {
  let last = a.update(STEP, pressed, held);
  for (let i = 1; i < steps; i++) last = a.update(STEP, false, held);
  return last;
}

describe('kitesurfer', () => {
  it('a tap is a high jump with long hangtime', () => {
    const a = new KiteAthlete();
    let apex = 0;
    let t = 0;
    a.update(STEP, true, false);
    while (a.state === 'air') {
      apex = Math.max(apex, a.y);
      a.update(STEP, false, false);
      t += STEP;
    }
    expect(apex).toBeGreaterThan(60);
    expect(t).toBeGreaterThan(0.85);
  });

  it('holding a second press spins; each full turn counts', () => {
    const a = new KiteAthlete();
    a.update(STEP, true, false);
    fly(a, 3);
    a.update(STEP, true, true);
    // hold for about one and a half turns: the release finishes the second turn
    fly(a, Math.round((KITE.spinTime * 1.5) / STEP), false, true);
    let ev = fly(a, 1);
    while (a.state === 'air') ev = a.update(STEP, false, false);
    expect(ev).toBe('trick');
    expect(a.spins).toBe(2);
  });

  it('the press that starts the jump does not spin even if held', () => {
    const a = new KiteAthlete();
    a.update(STEP, true, true);
    fly(a, 20, false, true);
    expect(a.rotation).toBe(0);
  });

  it('landing in the middle of a turn is a wipeout', () => {
    const a = new KiteAthlete();
    a.update(STEP, true, false);
    // wait until the descent, then start spinning too late to finish
    while (a.vy > -200) a.update(STEP, false, false);
    a.update(STEP, true, true);
    let ev = a.update(STEP, false, true);
    while (a.state === 'air') ev = a.update(STEP, false, true);
    expect(ev).toBe('crash');
  });

  it('the kite hitbox flies high above the rider', () => {
    const a = new KiteAthlete();
    const boxes = newBoxes();
    expect(a.boxes(KITE.playerX, boxes)).toBe(2);
    expect(boxes[1].y).toBe(KITE.kiteY);
    a.gust();
    for (let i = 0; i < 20; i++) a.update(STEP, false, false);
    a.boxes(KITE.playerX, boxes);
    expect(boxes[1].y).toBeGreaterThan(KITE.kiteY + 30);
  });
});

describe('wing foiler', () => {
  it('holding lifts the foil, releasing lets it sink', () => {
    const a = new WingAthlete();
    const start = a.y;
    for (let i = 0; i < 6; i++) a.update(STEP, false, true);
    expect(a.y).toBeGreaterThan(start);
    // after releasing, it stops climbing within a few pixels and then sinks
    let peak = a.y;
    for (let i = 0; i < 40; i++) {
      a.update(STEP, false, false);
      peak = Math.max(peak, a.y);
    }
    expect(peak - start).toBeLessThan(6);
    expect(a.y).toBeLessThan(start);
    expect(a.state).toBe('ride');
  });

  it('touching the water drags, then speed recovers', () => {
    const a = new WingAthlete();
    for (let i = 0; i < 90; i++) a.update(STEP, false, false);
    expect(a.touching).toBe(true);
    expect(a.speedFactor).toBe(WING.dragFactor);
    for (let i = 0; i < 90; i++) a.update(STEP, false, a.y < 8);
    expect(a.touching).toBe(false);
    expect(a.speedFactor).toBe(1);
  });

  it('flying above the breach height is a wipeout', () => {
    const a = new WingAthlete();
    let ev = 'none';
    for (let i = 0; i < 120 && a.state !== 'crash'; i++) ev = a.update(STEP, false, true);
    expect(ev).toBe('crash');
    expect(a.y).toBeGreaterThan(WING.breach);
  });

  it('mast and foil hang below the board into the water', () => {
    const a = new WingAthlete();
    const boxes = newBoxes();
    const n = a.boxes(WING.playerX, boxes);
    const under = boxes.slice(0, n).filter((b) => b.layers & UNDER);
    expect(under.length).toBe(2);
    for (const b of under) expect(b.y).toBeLessThan(a.y);
    expect(Math.min(...under.map((b) => b.y))).toBe(a.y - WING.mastLength - 1);
  });
});
