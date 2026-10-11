import type { Context, Screen, ScreenId } from '../ui/screen.ts';
import { SupScreen } from './sup.ts';

/** Every game with its own screen, registered with the app. */
export function registerGames(ctx: Context, add: (id: ScreenId, screen: Screen) => void): void {
  add('sup', new SupScreen(ctx));
}
