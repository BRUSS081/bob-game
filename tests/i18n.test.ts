import { afterEach, describe, expect, it } from 'vitest';
import { LANGS, STRINGS, deviceLang, setLang, t } from '../src/i18n/strings.ts';
import { canDraw } from '../src/render/font.ts';

/** Every string in a language, with its path. */
function strings(node: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) strings(v, `${path}.${k}`, out);
  return out;
}

afterEach(() => setLang('en'));

describe('languages', () => {
  it('every string can be drawn by the pixel font', () => {
    for (const lang of LANGS) {
      for (const [path, text] of strings(STRINGS[lang], lang, [])) {
        for (const ch of text) expect(canDraw(ch), `${path}: "${text}" has "${ch}"`).toBe(true);
      }
    }
  });

  it('Italian and Portuguese translate everything English has', () => {
    const keys = (lang: (typeof LANGS)[number]) => strings(STRINGS[lang], '', []).map(([p]) => p);
    expect(keys('it')).toEqual(keys('en'));
    expect(keys('pt')).toEqual(keys('en'));
    // and are not left in English by mistake
    expect(STRINGS.it.play).not.toBe(STRINGS.en.play);
    expect(STRINGS.pt.settings.title).not.toBe(STRINGS.en.settings.title);
  });

  it('picks the device language, English otherwise', () => {
    expect(deviceLang(['it-IT', 'en-US'])).toBe('it');
    expect(deviceLang(['pt-BR'])).toBe('pt');
    expect(deviceLang(['de-DE', 'pt-PT'])).toBe('pt');
    expect(deviceLang(['fr-FR'])).toBe('en');
    expect(deviceLang([])).toBe('en');
  });

  it('switching language changes the live strings', () => {
    setLang('it');
    expect(t.play).toBe('GIOCA');
    setLang('pt');
    expect(t.play).toBe('JOGAR');
    setLang('en');
    expect(t.play).toBe('PLAY');
  });

  it('game names fit the home card', () => {
    // the card is 150 UI units wide; names are drawn at twice the size (12 units per character)
    for (const lang of LANGS) for (const g of Object.values(STRINGS[lang].games)) expect(g.name.length, g.name).toBeLessThanOrEqual(12);
  });
});
