import type { Context, Screen, ScreenId } from '../ui/screen.ts';
import { AquariumScreen } from './aquarium.ts';
import { FishingScreen } from './fishing.ts';
import { FreediveScreen } from './freedive.ts';
import { GullScreen } from './gull.ts';
import { RaftScreen } from './raft.ts';
import { ReefScreen } from './reef.ts';
import { RegattaScreen } from './regatta.ts';
import { SlalomScreen } from './slalom.ts';
import { SnapScreen } from './snap.ts';
import { SupScreen } from './sup.ts';
import { SwellsScreen } from './swells.ts';
import { WreckScreen } from './wreck.ts';

/** Every game with its own screen, registered with the app. */
export function registerGames(ctx: Context, add: (id: ScreenId, screen: Screen) => void): void {
  add('sup', new SupScreen(ctx));
  add('gull', new GullScreen(ctx));
  add('wreck', new WreckScreen(ctx));
  add('swells', new SwellsScreen(ctx));
  add('fishing', new FishingScreen(ctx));
  add('freedive', new FreediveScreen(ctx));
  add('snap', new SnapScreen(ctx));
  add('aquarium', new AquariumScreen(ctx));
  add('slalom', new SlalomScreen(ctx));
  add('regatta', new RegattaScreen(ctx));
  add('raft', new RaftScreen(ctx));
  add('reef', new ReefScreen(ctx));
}
