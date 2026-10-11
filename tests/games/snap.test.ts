import { describe, expect, it } from 'vitest';
import { SNAP, Safari, type Act } from '../../src/games/snap.ts';
import { creature } from '../../src/games/sealife.ts';

const DT = 1 / 60;

function safari(seed = 4): Safari {
  const s = new Safari();
  s.reset(seed, 480, 60, 250, false);
  return s;
}

/** Puts one creature at a place, optionally in its special moment. */
function pose(s: Safari, id: string, dx: number, dy: number, scale: number, action: boolean): Act {
  for (const a of s.acts) a.active = false;
  const a = s.acts[0];
  a.active = true;
  a.creature = creature(id) ?? null;
  a.kind = 'cross';
  a.x = s.vfX + dx;
  a.y = s.vfY + dy;
  a.baseY = a.y;
  a.vx = 20;
  a.scale = scale;
  a.age = action ? 1 : 0;
  a.actionAt = action ? 0.8 : 5;
  return a;
}

describe('snap', () => {
  it('a centered, close photo in the special moment gets three stars', () => {
    const s = safari();
    pose(s, 'turtle', 0, 0, 2, true);
    const p = s.shoot();
    expect(p.creature?.id).toBe('turtle');
    expect(p.stars).toBe(3);
  });

  it('off center, far and calm gets one star', () => {
    const s = safari();
    pose(s, 'clownfish', s.vfW * 0.45, s.vfH * 0.4, 1, false);
    const p = s.shoot();
    expect(p.stars).toBe(1);
  });

  it('rarer creatures are worth more', () => {
    const s = safari();
    pose(s, 'sardine', 0, 0, 2, true);
    const common = s.shoot().points;
    pose(s, 'manta', 0, 0, 2, true);
    const rare = s.shoot().points;
    expect(rare).toBeGreaterThan(common);
  });

  it('an empty frame wastes a shot', () => {
    const s = safari();
    for (const a of s.acts) a.active = false;
    const p = s.shoot();
    expect(p.creature).toBeNull();
    expect(p.points).toBe(0);
    expect(s.shots).toBe(SNAP.roll - 1);
  });

  it('the roll ends after its shots', () => {
    const s = safari();
    for (let i = 0; i < SNAP.roll; i++) s.shoot();
    expect(s.over).toBe(true);
  });

  it('creatures keep coming, the same for the same seed', () => {
    const a = safari(7);
    const b = safari(7);
    let seen = 0;
    for (let i = 0; i < 60 * 20; i++) {
      a.step(DT);
      b.step(DT);
      seen = Math.max(seen, a.acts.filter((k) => k.active).length);
    }
    expect(seen).toBeGreaterThan(1);
    expect(a.acts.map((k) => k.creature?.id)).toEqual(b.acts.map((k) => k.creature?.id));
  });

  it('a patient photographer fills the roll with stars', () => {
    const s = safari(2);
    let stars = 0;
    let wait = 0;
    for (let i = 0; i < 60 * 120 && !s.over; i++) {
      s.step(DT);
      wait -= DT;
      // shoot when something is in its moment near the middle (the photo stays up a while)
      const good = s.acts.some((k) => k.active && s.inAction(k) && Math.abs(k.x - s.vfX) < s.vfW / 4 && Math.abs(k.y - s.vfY) < s.vfH / 3);
      if (good && wait <= 0) {
        stars += s.shoot().stars;
        wait = SNAP.show;
      }
    }
    expect(s.over).toBe(true);
    expect(stars).toBeGreaterThan(SNAP.roll * 2);
  });
});
