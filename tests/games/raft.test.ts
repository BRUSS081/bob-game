import { describe, expect, it } from 'vitest';
import { RAFT, RaftLife, type RaftEvent } from '../../src/games/raft.ts';

const DT = 1 / 60;
const VIEW = 300;

function life(seed = 3): RaftLife {
  const l = new RaftLife();
  l.reset(seed);
  return l;
}

describe('raft', () => {
  it('more power throws further', () => {
    const l = life();
    expect(l.reachOf(1)).toBeGreaterThan(l.reachOf(0.5));
    expect(l.reachOf(0)).toBeGreaterThan(l.half);
  });

  it('the hook brings back what it lands near', () => {
    const l = life();
    l.debris[0].active = true;
    l.debris[0].kind = 'barrel';
    l.debris[0].x = l.reachOf(0.5) - 5;
    l.debris[0].hooked = false;
    // charge to half power, then let go
    let i = 0;
    for (; l.power < 0.5; i++) l.step(DT, i === 0, true, VIEW);
    l.step(DT, false, false, VIEW);
    let event: RaftEvent = null;
    for (let k = 0; k < 60 * 6 && event !== 'catch'; k++) event = l.step(DT, false, false, VIEW) ?? event;
    expect(event).toBe('catch');
    expect(l.wood).toBeGreaterThanOrEqual(2);
    expect(l.plastic).toBeGreaterThanOrEqual(1);
  });

  it('building costs materials', () => {
    const l = life();
    expect(l.build('tile')).toBe(false);
    l.wood = 4;
    expect(l.build('tile')).toBe(true);
    expect(l.tiles).toBe(RAFT.startTiles + 1);
    expect(l.wood).toBe(0);
    l.wood = 10;
    l.plastic = 10;
    expect(l.build('net')).toBe(true);
    expect(l.build('net')).toBe(false);
  });

  it('a shark left alone takes a plank, a press sends it away', () => {
    const l = life();
    let event: RaftEvent = null;
    for (let i = 0; i < 60 * 40 && event !== 'broke'; i++) event = l.step(DT, false, false, VIEW) ?? event;
    expect(event).toBe('broke');
    expect(l.tiles).toBe(RAFT.startTiles - 1);
    const m = life();
    let repelled = false;
    for (let i = 0; i < 60 * 40 && !repelled; i++) repelled = m.step(DT, m.shark === 'bite', false, VIEW) === 'repel';
    expect(repelled).toBe(true);
    expect(m.tiles).toBe(RAFT.startTiles);
  });

  it('with no planks left the raft is gone', () => {
    const l = life();
    for (let i = 0; i < 60 * 300 && !l.over; i++) l.step(DT, false, false, VIEW);
    expect(l.over).toBe(true);
    expect(l.rescued).toBe(false);
    expect(l.tiles).toBe(0);
  });

  it('a careful player builds and is rescued after the last day', () => {
    for (const seed of [1, 2]) {
      const l = life(seed);
      let charging = false;
      for (let i = 0; i < 60 * (RAFT.days * RAFT.day + 10) && !l.over; i++) {
        const target = l.debris.find((d) => d.active && !d.hooked && d.x > l.half + 30 && d.x < l.reachOf(1) - 10);
        let hold = false;
        if (l.hook === 'idle' && target && l.shark !== 'bite') hold = true;
        if (l.hook === 'charge' && target) hold = l.reachOf(l.power) < target.x - 4;
        if (l.hook === 'charge' && !target) hold = false;
        charging = hold;
        l.step(DT, l.shark === 'bite', charging, VIEW);
        if (l.canBuild('net')) l.build('net');
        if (l.canBuild('tile')) l.build('tile');
        if (l.canBuild('sail')) l.build('sail');
      }
      expect(l.rescued).toBe(true);
      expect(l.tiles).toBeGreaterThan(RAFT.startTiles);
    }
  });
});
