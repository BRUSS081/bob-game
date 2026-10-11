/** Keys that act as the game's single button. */
const GAME_KEYS = new Set(['Space', 'ArrowUp']);
/** Keys used by menus; all of them are kept from scrolling the page. */
const MENU_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Enter', 'Escape', 'Tab', 'KeyR', 'KeyA', 'KeyD']);
/** Keys that steer in the games seen from above. */
const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);

export type InputKind = 'pointer' | 'key';

export interface InputEvent {
  kind: InputKind;
  /** Pointer position in CSS pixels (viewport). */
  x: number;
  y: number;
  /** KeyboardEvent.code for keys. */
  code: string;
}

const CAPACITY = 16;

/**
 * Keyboard, mouse and touch. Presses become queued events (taps keep their
 * position, so menus can hit-test them); `held` is the state of the game's
 * single button: Space, Arrow Up, or any finger or mouse button down.
 * The queue is preallocated: no garbage while playing.
 */
export class Input {
  readonly events: InputEvent[] = [];
  count = 0;
  private keyDown = false;
  private pointers = 0;
  /** A pointer that started on a button does not count as holding the game button. */
  private suppressed = false;
  private leftKey = false;
  private rightKey = false;
  /** Position of the last pointer that is down, in CSS pixels (steering by touch). */
  pointerX = 0;
  pointerY = 0;

  constructor(target: Window = window) {
    for (let i = 0; i < CAPACITY; i++) this.events.push({ kind: 'key', x: 0, y: 0, code: '' });
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointermove', this.onPointerMove);
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
    return this.keyDown || (this.pointers > 0 && !this.suppressed);
  }

  /** A pointer is down and not on a button (for touch steering with pointerX). */
  get pointerHeld(): boolean {
    return this.pointers > 0 && !this.suppressed;
  }

  get leftHeld(): boolean {
    return this.leftKey;
  }

  get rightHeld(): boolean {
    return this.rightKey;
  }

  /** Call when a pointer press was used by a button, so holding it does not drive the game. */
  suppressHeld(): void {
    if (this.pointers > 0) this.suppressed = true;
  }

  clear(): void {
    this.count = 0;
  }

  private push(kind: InputKind, x: number, y: number, code: string): void {
    if (this.count >= CAPACITY) return;
    const e = this.events[this.count++];
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.code = code;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const game = GAME_KEYS.has(e.code);
    if (!game && !MENU_KEYS.has(e.code)) return;
    e.preventDefault();
    if (LEFT_KEYS.has(e.code)) this.leftKey = true;
    if (RIGHT_KEYS.has(e.code)) this.rightKey = true;
    if (e.repeat) return;
    if (game) this.keyDown = true;
    this.push('key', 0, 0, e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (GAME_KEYS.has(e.code)) this.keyDown = false;
    if (LEFT_KEYS.has(e.code)) this.leftKey = false;
    if (RIGHT_KEYS.has(e.code)) this.rightKey = false;
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.pointers++;
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
    this.push('pointer', e.clientX, e.clientY, '');
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.pointers === 0) return;
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
  };

  private readonly onPointerUp = (): void => {
    this.pointers = Math.max(0, this.pointers - 1);
    if (this.pointers === 0) this.suppressed = false;
  };

  private readonly release = (): void => {
    this.keyDown = false;
    this.leftKey = false;
    this.rightKey = false;
    this.pointers = 0;
    this.suppressed = false;
  };
}

/** Is this key one of the game's single-button keys? */
export function isGameKey(code: string): boolean {
  return GAME_KEYS.has(code);
}
