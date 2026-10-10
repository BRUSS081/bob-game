import { computeLayout, type Layout } from './layout.ts';

/**
 * Owns the visible canvas and a low-resolution buffer. Everything is drawn
 * into the buffer at internal resolution, then blitted with an integer
 * nearest-neighbor scale, so pixels are never blurred or uneven.
 */
export class Display {
  readonly view: HTMLCanvasElement;
  readonly buffer: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  layout: Layout;
  private readonly viewCtx: CanvasRenderingContext2D;
  private readonly listeners: ((layout: Layout) => void)[] = [];
  private dprQuery: MediaQueryList | null = null;

  constructor(view: HTMLCanvasElement) {
    this.view = view;
    this.buffer = document.createElement('canvas');
    const ctx = this.buffer.getContext('2d', { alpha: false });
    const viewCtx = view.getContext('2d', { alpha: false });
    if (!ctx || !viewCtx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.viewCtx = viewCtx;
    this.layout = this.measure();
    this.apply();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
  }

  onResize(listener: (layout: Layout) => void): void {
    this.listeners.push(listener);
  }

  /** Copies the buffer to the screen. */
  present(): void {
    this.viewCtx.drawImage(this.buffer, 0, 0, this.layout.deviceWidth, this.layout.deviceHeight);
  }

  private readonly resize = (): void => {
    this.layout = this.measure();
    this.apply();
    for (const listener of this.listeners) listener(this.layout);
  };

  private measure(): Layout {
    return computeLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  }

  private apply(): void {
    const l = this.layout;
    this.buffer.width = l.width;
    this.buffer.height = l.height;
    this.view.width = l.deviceWidth;
    this.view.height = l.deviceHeight;
    const style = this.view.style;
    style.width = `${l.cssWidth}px`;
    style.height = `${l.cssHeight}px`;
    style.left = `${l.cssLeft}px`;
    style.top = `${l.cssTop}px`;
    // resizing a canvas resets its context state
    this.ctx.imageSmoothingEnabled = false;
    this.viewCtx.imageSmoothingEnabled = false;
    this.watchPixelRatio();
  }

  /** Browser zoom or moving to another monitor changes devicePixelRatio. */
  private watchPixelRatio(): void {
    this.dprQuery?.removeEventListener('change', this.resize);
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.resize);
  }
}
