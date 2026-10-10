import './style.css';
import { Display } from './core/display.ts';
import { OneButton } from './core/input.ts';
import { Loop } from './core/loop.ts';
import { load, save } from './core/storage.ts';
import { Game } from './game/game.ts';
import { Renderer } from './render/renderer.ts';

const BEST_KEY = 'bob.best.surf';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');

const display = new Display(canvas);
const input = new OneButton(window);
const game = new Game(load(BEST_KEY, 0), {
  onGameOver: (_score, best) => save(BEST_KEY, best),
});
const renderer = new Renderer(display);

game.setViewWidth(display.layout.width);
display.onResize((layout) => game.setViewWidth(layout.width));

// pause automatically when the tab or the window loses focus
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});
window.addEventListener('blur', () => game.pause());

const loop = new Loop(
  (dt) => game.update(dt, input.consumePress(), input.held),
  (alpha) => renderer.render(game, alpha),
);
loop.start();

// development only: inspect and drive the game from the console
if (import.meta.env.DEV) Object.assign(window, { game });
