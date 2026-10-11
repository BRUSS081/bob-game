import { load, save } from '../core/storage.ts';

export interface CatchRecord {
  count: number;
  /** Biggest one, in centimeters. */
  best: number;
}

/**
 * The shared collection of every game: fish caught (fishing), creatures
 * seen (freedive, aquarium visitors), best photo per creature (snap),
 * treasures found (wreck hook) and shells collected. Saved in localStorage.
 */
export class Album {
  readonly caught = new Map<string, CatchRecord>();
  readonly seen = new Set<string>();
  readonly photos = new Map<string, number>();
  readonly treasures = new Map<string, number>();
  shells = 0;

  constructor() {
    const raw = load<unknown>('bob.album', null);
    if (typeof raw !== 'object' || raw === null) return;
    const r = raw as Record<string, unknown>;
    if (typeof r.caught === 'object' && r.caught !== null) {
      for (const [id, v] of Object.entries(r.caught as Record<string, unknown>)) {
        const c = v as Partial<CatchRecord>;
        if (typeof c?.count === 'number' && typeof c.best === 'number') this.caught.set(id, { count: c.count, best: c.best });
      }
    }
    if (Array.isArray(r.seen)) for (const id of r.seen) if (typeof id === 'string') this.seen.add(id);
    if (typeof r.photos === 'object' && r.photos !== null) {
      for (const [id, v] of Object.entries(r.photos as Record<string, unknown>)) if (typeof v === 'number') this.photos.set(id, v);
    }
    if (typeof r.treasures === 'object' && r.treasures !== null) {
      for (const [id, v] of Object.entries(r.treasures as Record<string, unknown>)) if (typeof v === 'number') this.treasures.set(id, v);
    }
    if (typeof r.shells === 'number' && Number.isFinite(r.shells)) this.shells = Math.max(0, Math.floor(r.shells));
  }

  private save(): void {
    save('bob.album', {
      caught: Object.fromEntries(this.caught),
      seen: [...this.seen],
      photos: Object.fromEntries(this.photos),
      treasures: Object.fromEntries(this.treasures),
      shells: this.shells,
    });
  }

  /** Records a catch; true when the species is new to the album. */
  catch(id: string, size: number): boolean {
    const rec = this.caught.get(id);
    this.seen.add(id);
    if (rec) {
      rec.count++;
      rec.best = Math.max(rec.best, size);
    } else {
      this.caught.set(id, { count: 1, best: size });
    }
    this.save();
    return !rec;
  }

  /** Marks a creature as seen; true when it is new. */
  see(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.save();
    return true;
  }

  /** Keeps the best photo score per creature; true when it beats the old one. */
  photo(id: string, score: number): boolean {
    this.seen.add(id);
    const old = this.photos.get(id) ?? 0;
    if (score <= old) return false;
    this.photos.set(id, score);
    this.save();
    return true;
  }

  /** Records a treasure; true when it is the first of its kind. */
  treasure(id: string): boolean {
    const n = this.treasures.get(id) ?? 0;
    this.treasures.set(id, n + 1);
    this.save();
    return n === 0;
  }

  addShells(n: number): void {
    if (n <= 0) return;
    this.shells += n;
    this.save();
  }
}
