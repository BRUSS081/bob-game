import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { OPTIONS, configKey, defaultConfig, randomize, resolveRamps, sanitize, stepOption } from '../src/custom/athlete.ts';
import { SPORTS } from '../src/game/sport.ts';
import { BASE_GEAR_COUNT } from '../src/sprites/ramps.ts';

describe('athlete customization', () => {
  it('BOB and BOBBA have different signature looks, the same in every sport', () => {
    for (const sport of SPORTS) {
      const bob = defaultConfig('bob', sport);
      const bobba = defaultConfig('bobba', sport);
      expect(bob.character).toBe('bob');
      expect(bobba.character).toBe('bobba');
      expect(bob.hairStyle).not.toBe(bobba.hairStyle);
      expect(bob.skin).not.toBe(bobba.skin);
      expect(bob.hairStyle).toBe(defaultConfig('bob', 'surf').hairStyle);
    }
  });

  it('stepping wraps around and passes through "none" where allowed', () => {
    const c = defaultConfig('bob', 'surf');
    const helmet = OPTIONS.find((o) => o.key === 'helmet')!;
    expect(c.helmet).toBe(-1);
    stepOption(c, helmet, -1);
    // special colors are skipped until unlocked
    expect(c.helmet).toBe(BASE_GEAR_COUNT - 1);
    stepOption(c, helmet, -1, new Set([helmet.count - 1]));
    stepOption(c, helmet, 1, new Set([helmet.count - 1]));
    stepOption(c, helmet, 1, new Set([helmet.count - 1]));
    expect(c.helmet).toBe(helmet.count - 1);
    stepOption(c, helmet, 1);
    expect(c.helmet).toBe(-1);
    const character = OPTIONS.find((o) => o.key === 'character')!;
    stepOption(c, character, 1);
    expect(c.character).toBe('bobba');
  });

  it('random looks keep the character and stay valid', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) {
      const c = defaultConfig('bobba', 'kite');
      randomize(c, 'kite', rng);
      expect(c.character).toBe('bobba');
      expect(sanitize(c, 'kite')).toEqual(c);
      expect(() => resolveRamps(c)).not.toThrow();
    }
  });

  it('garbage from storage becomes a valid default', () => {
    expect(sanitize(null, 'surf')).toEqual(defaultConfig('bob', 'surf'));
    expect(sanitize('x', 'wing')).toEqual(defaultConfig('bob', 'wing'));
    const fixed = sanitize({ character: 'bobba', skin: 99, hairColor: 2, helmet: -5 }, 'surf');
    expect(fixed.character).toBe('bobba');
    expect(fixed.skin).toBe(defaultConfig('bobba', 'surf').skin);
    expect(fixed.hairColor).toBe(2);
    expect(fixed.helmet).toBe(-1);
  });

  it('configs that differ get different cache keys', () => {
    const a = defaultConfig('bob', 'surf');
    const b = { ...a, suitA: (a.suitA + 1) % 10 };
    expect(configKey(a, 'surf')).not.toBe(configKey(b, 'surf'));
    expect(configKey(a, 'surf')).not.toBe(configKey(a, 'kite'));
  });
});
