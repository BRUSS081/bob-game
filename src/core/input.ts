const KEYS = new Set(['Space', 'ArrowUp']);

/**
 * The game's single button: Space, Arrow Up, mouse click or a tap anywhere.
 * Presses are queued so none is lost between fixed steps; `held` tells
 * whether the button is down right now.
 */
export class OneButton {
  private presses = 0;
  private keyDown = false;
  private pointers = 0;

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerUp);
    target.addEventListener('blur', this.release);
    // mobile: no scrolling, no double-tap zoom, no long-press menu or callout
    const block = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    target.addEventListener('touchstart', block, opts);
    target.addEventListener('touchmove', block, opts);
    target.addEventListener('touchend', block, opts);
    target.addEventListener('contextmenu', block);
    target.addEventListener('dblclick', block);
    target.addEventListener('gesturestart', block, opts);
  }

  get held(): boolean {
    return this.keyDown || this.pointers > 0;
  }

  /** Takes one queued press, if any. */
  consumePress(): boolean {
    if (this.presses === 0) return false;
    this.presses--;
    return true;
  }

  private press(): void {
    // a burst of presses beyond a few is noise, not intent
    if (this.presses < 3) this.presses++;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.keyDown = true;
    this.press();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (KEYS.has(e.code)) this.keyDown = false;
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.pointers++;
    this.press();
  };

  private readonly onPointerUp = (): void => {
    this.pointers = Math.max(0, this.pointers - 1);
  };

  private readonly release = (): void => {
    this.keyDown = false;
    this.pointers = 0;
  };
}
