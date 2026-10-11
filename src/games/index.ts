import type { Context, Screen, ScreenId } from '../ui/screen.ts';
import { GullScreen } from './gull.ts';
import { SupScreen } from './sup.ts';
import { SwellsScreen } from './swells.ts';
import { WreckScreen } from './wreck.ts';

/** Every game with its own screen, registered with the app. */
export function registerGames(ctx: Context, add: (id: ScreenId, screen: Screen) => void): void {
  add('sup', new SupScreen(ctx));
  add('gull', new GullScreen(ctx));
  add('wreck', new WreckScreen(ctx));
  add('swells', new SwellsScreen(ctx));
}
