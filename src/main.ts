import './style.css';
import { App } from './app.ts';
import { Display } from './core/display.ts';
import { Input } from './core/input.ts';
import { Loop } from './core/loop.ts';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');

const display = new Display(canvas);
const input = new Input(window);
const app = new App(display, input);

// pause automatically when the tab or the window loses focus
document.addEventListener('visibilitychange', () => {
  if (document.hidden) app.blur();
});
window.addEventListener('blur', () => app.blur());

const loop = new Loop(
  (dt) => app.update(dt),
  (alpha) => app.render(alpha),
);
loop.start();

// installable and playable offline: the service worker exists only in the built site
// (it does not on a page served from elsewhere, and then nothing happens)
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

// development only: inspect and drive the game from the console
if (import.meta.env.DEV) Object.assign(window, { app });
