import { load, save } from '../core/storage.ts';
import { isRunMode, type RunMode } from '../game/modes.ts';
import { SPORTS, isSport, type SportId } from '../game/sport.ts';
import { isGameId, type GameId } from '../games/registry.ts';
import { BODY_KEYS, CHARACTERS, defaultConfig, sanitize, type AthleteConfig, type CharacterId, type Unlocked } from './athlete.ts';

type PerSport<T> = Record<SportId, T>;

/** Today's daily challenge for one sport: best score and the ghost of that run. */
export interface DailyRecord {
  day: string;
  best: number;
  /** Encoded GhostTrack, empty when there is none. */
  ghost: string;
}

/**
 * What the player picked: sport, BOB or BOBBA, a saved look for every
 * sport and rider, and the best score per sport. Everything goes through
 * the safe storage, so the game works even when saving fails.
 */
export class Profile {
  sport: SportId;
  rider: CharacterId;
  /** Game shown on the home carousel. */
  game: GameId;
  /** Last runner mode chosen. */
  mode: RunMode;
  readonly looks: PerSport<Record<CharacterId, AthleteConfig>>;
  readonly best: PerSport<number>;
  private readonly bests = new Map<string, number>();
  private readonly tour = new Map<string, number>();
  /** Sports whose first-run tutorial is done. */
  readonly tutorialDone = new Set<SportId>();

  constructor(unlocked: Unlocked = new Set()) {
    const sport = load<unknown>('bob.sport', 'surf');
    this.sport = isSport(sport) ? sport : 'surf';
    this.rider = load<unknown>('bob.rider', 'bob') === 'bobba' ? 'bobba' : 'bob';
    const game = load<unknown>('bob.game', 'runner');
    this.game = isGameId(game) ? game : 'runner';
    const mode = load<unknown>('bob.mode', 'endless');
    this.mode = isRunMode(mode) ? mode : 'endless';
    this.looks = {} as PerSport<Record<CharacterId, AthleteConfig>>;
    this.best = {} as PerSport<number>;
    for (const s of SPORTS) {
      const looks = {} as Record<CharacterId, AthleteConfig>;
      for (const ch of CHARACTERS) {
        const look = sanitize(load<unknown>(`bob.look.${s}.${ch}`, null), s, unlocked);
        // a look saved for one character never shows up on the other
        looks[ch] = look.character === ch ? look : defaultConfig(ch, s);
      }
      this.looks[s] = looks;
      const b = load<unknown>(`bob.best.${s}`, 0);
      this.best[s] = typeof b === 'number' && Number.isFinite(b) && b > 0 ? Math.floor(b) : 0;
    }
    const tour = load<unknown>('bob.tour', {});
    if (typeof tour === 'object' && tour !== null) {
      for (const [id, v] of Object.entries(tour as Record<string, unknown>)) {
        if (typeof v === 'number' && v >= 1 && v <= 3) this.tour.set(id, Math.floor(v));
      }
    }
    const done = load<unknown>('bob.tutorial', []);
    if (Array.isArray(done)) for (const s of done) if (isSport(s)) this.tutorialDone.add(s);
    // the body is shared: older saves may differ per sport, the current sport wins
    for (const ch of CHARACTERS) this.copyBody(this.sport, ch);
  }

  /** Copies the body options of one sport's look to the same rider in the other sports. */
  private copyBody(from: SportId, character: CharacterId): void {
    const src = this.looks[from][character];
    for (const s of SPORTS) {
      if (s === from) continue;
      const dst = this.looks[s][character];
      for (const key of BODY_KEYS) dst[key] = src[key];
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

  setGame(game: GameId): void {
    this.game = game;
    save('bob.game', game);
  }

  setMode(mode: RunMode): void {
    this.mode = mode;
    save('bob.mode', mode);
  }

  setRider(character: CharacterId): void {
    this.rider = character;
    save('bob.rider', character);
  }

  /** Saves the look of the current rider; the body goes to every sport. */
  saveLook(sport: SportId = this.sport): void {
    this.copyBody(sport, this.rider);
    for (const s of SPORTS) save(`bob.look.${s}.${this.rider}`, this.looks[s][this.rider]);
  }

  /** Today's record for a sport; a record from another day starts over. */
  daily(sport: SportId, day: string): DailyRecord {
    const raw = load<unknown>(`bob.daily.${sport}`, null);
    if (typeof raw === 'object' && raw !== null) {
      const r = raw as Record<string, unknown>;
      if (r.day === day && typeof r.best === 'number' && Number.isFinite(r.best) && r.best > 0) {
        return { day, best: Math.floor(r.best), ghost: typeof r.ghost === 'string' ? r.ghost : '' };
      }
    }
    return { day, best: 0, ghost: '' };
  }

  saveDaily(sport: SportId, record: DailyRecord): void {
    save(`bob.daily.${sport}`, record);
  }

  finishTutorial(sport: SportId): void {
    this.tutorialDone.add(sport);
    save('bob.tutorial', [...this.tutorialDone]);
  }

  /** Stars of a world tour spot, 0 to 3. */
  spotStars(id: string): number {
    return this.tour.get(id) ?? 0;
  }

  /** Keeps the best star count of a spot. */
  setSpotStars(id: string, stars: number): void {
    if (stars <= this.spotStars(id)) return;
    this.tour.set(id, stars);
    save('bob.tour', Object.fromEntries(this.tour));
  }

  tourStars(): number {
    let n = 0;
    for (const v of this.tour.values()) n += v;
    return n;
  }

  /** Best score of any game or runner mode, by key ("sixty.surf", "fishing"...). */
  gameBest(key: string): number {
    let v = this.bests.get(key);
    if (v === undefined) {
      const raw = load<unknown>(`bob.best.${key}`, 0);
      v = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
      this.bests.set(key, v);
    }
    return v;
  }

  setGameBest(key: string, value: number): void {
    this.bests.set(key, value);
    save(`bob.best.${key}`, value);
  }

  setBest(sport: SportId, best: number): void {
    this.best[sport] = best;
    save(`bob.best.${sport}`, best);
  }
}
