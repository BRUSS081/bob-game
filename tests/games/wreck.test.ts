import { describe, expect, it } from 'vitest';
import { WRECK, WreckHaul } from '../../src/games/wreck.ts';

const DT = 1 / 60;
const W = 480;
const DEPTH = 180;

/** Drops the hook when it is right above something. */
function aim(h: WreckHaul): boolean {
  for (const it of h.items) if (it.active && Math.abs(h.hookX - it.x) < it.w / 4) return true;
  return false;
}

function play(tap: (h: WreckHaul) => boolean, seed = 3): WreckHaul {
  const h = new WreckHaul();
  h.reset(seed, W, DEPTH);
  for (let i = 0; i < 60 * 90 && !h.over; i++) h.step(DT, tap(h));
  return h;
}

describe('wreck hook', () => {
  it('the game ends when the time is up and the hook is back', () => {
    const h = play(() => false);
    expect(h.over).toBe(true);
    expect(h.score).toBe(0);
  });

  it('a well aimed drop brings something up', () => {
    const h = new WreckHaul();
    h.reset(1, W, DEPTH);
    const target = h.items[0];
    h.hookX = target.x;
    let event = null;
    h.step(DT, true);
    for (let i = 0; i < 600 && event !== 'catch'; i++) event = h.step(DT, false) ?? event;
    expect(event).toBe('catch');
    expect(h.score).toBeGreaterThan(0);
    expect(target.active).toBe(false);
  });

  it('a drop over empty sand comes back with nothing', () => {
    const h = new WreckHaul();
    h.reset(1, W, DEPTH);
    h.hookX = W * 0.255;
    const events: string[] = [];
    h.step(DT, true);
    for (let i = 0; i < 600 && h.state !== 'idle'; i++) {
      const e = h.step(DT, false);
      if (e) events.push(e);
    }
    expect(events).toEqual(['miss']);
    expect(h.score).toBe(0);
  });

  it('the deck stops the hook, its holes lead into the hull', () => {
    const h = new WreckHaul();
    h.reset(1, W, DEPTH);
    expect(h.bottomAt(W * 0.6)).toBe(DEPTH);
    expect(h.bottomAt(W * 0.66)).toBe(DEPTH - WRECK.deck);
    expect(h.bottomAt(W * 0.2)).toBe(DEPTH);
  });

  it('taken things come back after a while', () => {
    const h = new WreckHaul();
    h.reset(1, W, DEPTH);
    h.items[2].active = false;
    h.items[2].wait = WRECK.respawn;
    for (let i = 0; i < 60 * (WRECK.respawn + 0.1); i++) h.step(DT, false);
    expect(h.items[2].active).toBe(true);
  });

  it('an aiming player hauls in plenty in a minute', () => {
    for (const seed of [1, 2, 3]) {
      const h = play(aim, seed);
      expect(h.hauled).toBeGreaterThan(6);
      expect(h.score).toBeGreaterThan(150);
    }
  });
});
