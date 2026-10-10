# BOB

One-button pixel art endless runner: surf, kitesurf and wing foil with BOB and BOBBA.
Vite + TypeScript + Canvas 2D, no game engine. Spec and phases: [docs/BRIEF.md](docs/BRIEF.md).

## Commands

```bash
npm install
npm run dev        # dev server (window.game is exposed in dev builds)
npm test           # Vitest: pure logic (layout, loop, physics, obstacles, score, a bot that plays full runs)
npm run typecheck
npm run build      # typecheck + production build into dist/
npm run reference  # re-render the pixel art references in /reference
```

## Layout

- `src/core`: display (integer pixel scaling), fixed-timestep loop, one-button input, storage, RNG
- `src/game`: surf rules (surfer, obstacles, score, game phases), no DOM
- `src/render`: master palette, 5×7 bitmap font, renderer
- `src/i18n/strings.ts`: every UI string
- `scripts`: reference renderer
