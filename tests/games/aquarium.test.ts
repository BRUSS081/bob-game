import { describe, expect, it } from 'vitest';
import { AQUARIUM, VISITORS, dailyVisitor, tankPopulation } from '../../src/games/aquarium.ts';
import type { CatchRecord } from '../../src/custom/album.ts';

describe('aquarium', () => {
  it('the tank holds each species caught, a few copies at most', () => {
    const caught = new Map<string, CatchRecord>([
      ['sardine', { count: 9, best: 18 }],
      ['tuna', { count: 1, best: 150 }],
      ['clownfish', { count: 2, best: 10 }],
    ]);
    const tank = tankPopulation(caught);
    expect(tank.filter((id) => id === 'sardine')).toHaveLength(AQUARIUM.copies);
    expect(tank.filter((id) => id === 'tuna')).toHaveLength(1);
    expect(tank.filter((id) => id === 'clownfish')).toHaveLength(2);
  });

  it('never more fish than fit', () => {
    const caught = new Map<string, CatchRecord>();
    for (const id of ['sardine', 'mackerel', 'bream', 'bass', 'tang', 'tuna', 'snapper']) caught.set(id, { count: 5, best: 30 });
    expect(tankPopulation(caught).length).toBe(AQUARIUM.max);
  });

  it('an empty album makes an empty tank', () => {
    expect(tankPopulation(new Map())).toEqual([]);
  });

  it('the visitor is the same all day and changes between days', () => {
    expect(dailyVisitor('2026-10-11')).toBe(dailyVisitor('2026-10-11'));
    const days = new Set<string>();
    for (let d = 1; d <= 28; d++) days.add(dailyVisitor(`2026-02-${String(d).padStart(2, '0')}`));
    expect(days.size).toBeGreaterThan(4);
    for (const v of days) expect(VISITORS).toContain(v);
  });
});
