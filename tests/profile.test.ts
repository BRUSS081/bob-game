import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OPTIONS, TABS, defaultConfig } from '../src/custom/athlete.ts';
import { Profile } from '../src/custom/profile.ts';
import { SPORTS } from '../src/game/sport.ts';

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const g = globalThis as unknown as { window?: unknown };
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  g.window = { localStorage: storage };
});

afterEach(() => {
  delete g.window;
});

describe('profile', () => {
  it('starts on surf with BOB and the signature looks', () => {
    const p = new Profile();
    expect(p.sport).toBe('surf');
    expect(p.rider).toBe('bob');
    for (const sport of SPORTS) {
      expect(p.looks[sport].bob).toEqual(defaultConfig('bob', sport));
      expect(p.looks[sport].bobba).toEqual(defaultConfig('bobba', sport));
      expect(p.best[sport]).toBe(0);
    }
  });

  it('remembers sport, rider, looks per sport and rider, and best scores', () => {
    const p = new Profile();
    p.setSport('kite');
    p.setRider('bobba');
    p.look().helmet = 3;
    p.saveLook();
    p.setBest('wing', 1234);

    const q = new Profile();
    expect(q.sport).toBe('kite');
    expect(q.rider).toBe('bobba');
    expect(q.look().character).toBe('bobba');
    expect(q.look().helmet).toBe(3);
    expect(q.looks.kite.bob.helmet).toBe(-1);
    expect(q.looks.surf.bobba.helmet).toBe(-1);
    expect(q.best.wing).toBe(1234);
  });

  it('ignores garbage in storage', () => {
    storage.setItem('bob.sport', '"snowboard"');
    storage.setItem('bob.rider', '42');
    storage.setItem('bob.look.surf.bob', '{"character":"bobba","skin":2}');
    storage.setItem('bob.look.kite.bobba', 'not json');
    storage.setItem('bob.best.kite', '-5');
    storage.setItem('bob.best.wing', '"lots"');
    const p = new Profile();
    expect(p.sport).toBe('surf');
    expect(p.rider).toBe('bob');
    // a BOBBA look saved under BOB is not used for BOB
    expect(p.looks.surf.bob).toEqual(defaultConfig('bob', 'surf'));
    expect(p.looks.kite.bobba).toEqual(defaultConfig('bobba', 'kite'));
    expect(p.best.kite).toBe(0);
    expect(p.best.wing).toBe(0);
  });

  it('works when storage throws', () => {
    g.window = {
      get localStorage(): never {
        throw new Error('blocked');
      },
    };
    const p = new Profile();
    expect(p.sport).toBe('surf');
    expect(() => {
      p.setSport('wing');
      p.saveLook();
      p.setBest('wing', 10);
    }).not.toThrow();
    expect(p.sport).toBe('wing');
  });
});

describe('customization tabs', () => {
  it('every tab has options and fits the customize screen in every sport', () => {
    for (const sport of SPORTS) {
      for (const tab of TABS) {
        const rows = OPTIONS.filter((o) => o.tab === tab && o.sports.includes(sport));
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('BOB / BOBBA is the first option of the athlete tab', () => {
    expect(OPTIONS[0].key).toBe('character');
    expect(OPTIONS[0].tab).toBe('athlete');
  });
});
