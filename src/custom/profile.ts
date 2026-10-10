import { load, save } from '../core/storage.ts';
import { SPORTS, isSport, type SportId } from '../game/sport.ts';
import { CHARACTERS, defaultConfig, sanitize, type AthleteConfig, type CharacterId } from './athlete.ts';

type PerSport<T> = Record<SportId, T>;

/**
 * What the player picked: sport, BOB or BOBBA, a saved look for every
 * sport and rider, and the best score per sport. Everything goes through
 * the safe storage, so the game works even when saving fails.
 */
export class Profile {
  sport: SportId;
  rider: CharacterId;
  readonly looks: PerSport<Record<CharacterId, AthleteConfig>>;
  readonly best: PerSport<number>;

  constructor() {
    const sport = load<unknown>('bob.sport', 'surf');
    this.sport = isSport(sport) ? sport : 'surf';
    this.rider = load<unknown>('bob.rider', 'bob') === 'bobba' ? 'bobba' : 'bob';
    this.looks = {} as PerSport<Record<CharacterId, AthleteConfig>>;
    this.best = {} as PerSport<number>;
    for (const s of SPORTS) {
      const looks = {} as Record<CharacterId, AthleteConfig>;
      for (const ch of CHARACTERS) {
        const look = sanitize(load<unknown>(`bob.look.${s}.${ch}`, null), s);
        // a look saved for one character never shows up on the other
        looks[ch] = look.character === ch ? look : defaultConfig(ch, s);
      }
      this.looks[s] = looks;
      const b = load<unknown>(`bob.best.${s}`, 0);
      this.best[s] = typeof b === 'number' && Number.isFinite(b) && b > 0 ? Math.floor(b) : 0;
    }
  }

  /** The look in use for a sport (the current one by default). */
  look(sport: SportId = this.sport): AthleteConfig {
    return this.looks[sport][this.rider];
  }

  setSport(sport: SportId): void {
    this.sport = sport;
    save('bob.sport', sport);
  }

  setRider(character: CharacterId): void {
    this.rider = character;
    save('bob.rider', character);
  }

  saveLook(sport: SportId = this.sport): void {
    for (const ch of CHARACTERS) save(`bob.look.${sport}.${ch}`, this.looks[sport][ch]);
  }

  setBest(sport: SportId, best: number): void {
    this.best[sport] = best;
    save(`bob.best.${sport}`, best);
  }
}
