# BOB — istruzioni per Claude

Endless runner pixel art a un solo tasto (surf, kitesurf, wing foil) con i personaggi BOB e BOBBA.
La fonte di verità è **[docs/BRIEF.md](docs/BRIEF.md)**: leggilo per intero all'inizio di ogni sessione.

## Regole di lavoro
- Lavora per fasi, nell'ordine del brief (1 → 7). Non anticipare lavoro di fasi successive.
- A fine fase: commit, preview su Vercel (dalla fase 2), riepilogo breve di cosa guardare e cosa testare. Poi **FERMATI** e aspetta l'ok esplicito dell'utente.
- Se trovi un problema di design o una scelta migliore, proponila **prima** di implementarla.
- Chiedi **prima** di qualsiasi azione che costa: crediti Higgsfield oltre quelli della fase 1, piani a pagamento di Supabase o Vercel.
- Comunica con l'utente in italiano. Codice, commenti e commit in inglese.

## Vincoli che valgono sempre
- Le immagini in `/reference` sono **solo** riferimento di stile, palette, luce e atmosfera. Non usarle mai come asset di gioco.
- Sprite disegnati in codice: matrici di indici palette in file TypeScript, layer modulari con rampe dedicate (personalizzazione = palette swap), pre-render in cache su canvas offscreen.
- Pixel perfect: risoluzione interna ~270 px di altezza, nearest-neighbor, `imageSmoothingEnabled = false`, devicePixelRatio gestito. Niente gradienti lisci: bande a gradini o dithering ordinato.
- Stack: Vite + TypeScript + Canvas 2D, nessun game engine. Timestep fisso 60 Hz, rendering interpolato. Vitest per la logica pura.
- Nessuna allocazione nel loop principale; object pooling per ostacoli e particelle.
- Niente audio. Nessun tracking, nessun dato personale.
- Nella UI: "BOB / BOBBA", mai "maschio / femmina". EN di default, IT e PT; tutte le stringhe in un unico file.
- localStorage sempre dentro try/catch: il gioco funziona anche se il salvataggio fallisce.
- Niente grafica, nomi o suoni di Google (si prende il genere del dino, non gli asset).
- Scena: niente terraferma, solo mare aperto, cielo e ostacoli. Hydrofoil: albero e ala sempre **sotto** la tavola, in acqua.
- Su telefono il gioco prende tutto lo schermo anche in verticale (niente fascia).

## Stato
| Fase | Stato |
|---|---|
| 1 — Concept art | fatta: pixel art di riferimento disegnate in codice (`npm run reference` → `/reference`) |
| 2 — Setup e loop di gioco | fatta |
| 3 — Ambiente | da fare (prossima: le fasi 4 e 5 sono state anticipate su richiesta dell'utente) |
| 4 — Sprite e personalizzazione | fatta, in attesa di ok: sprite BOB/BOBBA in codice, `/dev/sprites`, home con sport e BOB/BOBBA, personalizzazione a 3 schede |
| 5 — Kitesurf e wing foil | fatta, in attesa di ok: meccaniche, ostacoli e power-up per sport, bot su 3 sport, 122 test |
| Extra — proposte di gameplay | fatte, in attesa di ok (autonomia piena data dall'utente): al pelo, ritmo a ondate, flow nel wing, rivali vivi, delfini, sfida del giorno con fantasma, missioni con colori speciali, tutorial, effetti, cartolina; 144 test |
| 6 — Classifica globale | da fare |
| 7 — Rifinitura | da fare |

Aggiorna questa tabella a ogni fine fase.

## Note per le sessioni future
- Fase 1: account Higgsfield su piano free (1.52 crediti all'avvio). GPT Image 2.5 richiede il piano Basic; l'unico modello che rientra nel saldo è Z Image (0.15 crediti/immagine, 16:9, 2048×1152), con rate limit di circa un job alla volta.
- Z Image è fallito 5 volte di fila (coda bloccata). L'utente genera le immagini da solo con i prompt di `docs/PROMPTS.md` e le carica in `/reference`.
- Alla fine l'utente ha chiesto di disegnare io le pixel art di riferimento ispirandomi alle immagini AI (non scaricabili per la network policy): `scripts/render-reference.ts`, palette master in `src/render/palette.ts`.
- Generate anche via MCP: 5 su Figma (gemini-3.1-flash-image, piano Starter, 1376×768, link validi 7 giorni) e 5 su Canva (il quinto, ostacoli, è riuscito al secondo tentativo). Anche `www.figma.com` è bloccato dalla network policy, quindi i file vanno caricati in `/reference` a mano.
- Il CDN delle immagini Higgsfield (`d8j0ntlcm91z4.cloudfront.net`) è bloccato dalla network policy dell'ambiente: per salvare i PNG in `/reference` va aggiunto agli Allowed domains.
- Fase 2: tuning surf in `src/game/config.ts`. `tests/game.test.ts` contiene un bot che gioca 150 s su più seed: se un cambio di tuning rende impossibile una sequenza, fallisce.
- Vercel: account Hobby, progetto `bob-game` (`prj_M889Vz8ZFCT4SN3LtonHIkKFDsle`) collegato a GitHub: ogni push crea un deploy. Con il connettore MCP chiama i tool **senza** `teamId`/`slug` (con `teamId` risponde 403 sullo scope `bruss1`). Vercel Authentication disattivata su richiesta dell'utente: le preview si aprono senza login. URL: https://bob-game-tau.vercel.app (alias del branch: `bob-game-git-claude-vigilant-hawking-qmmxhx-bruss1.vercel.app`). I push sul branch creano solo preview (il branch di produzione è `main`): per aggiornare la produzione usa `create_deployment` con `deploymentId` dell'ultima preview e `target: "production"` (`request_promote` risponde 422). Il connettore non può cancellare singoli deploy: si fa dalla dashboard. `*.vercel.app` è bloccato dalla network policy di questo ambiente.
- Fasi 4–5: `src/app.ts` gestisce le schermate in `src/ui/` (home, customize, play). Profilo in `src/custom/profile.ts`: chiavi `bob.sport`, `bob.rider` (BOB/BOBBA unico per tutti gli sport), `bob.look.<sport>.<bob|bobba>`, `bob.best.<sport>`. Modello di personalizzazione in `src/custom/athlete.ts` (OPTIONS, schede athlete/suit/gear); sprite composti in `src/sprites/compose.ts`, palette swap con le rampe di `src/sprites/ramps.ts`, cache in `src/sprites/sheet.ts`. Tuning per sport in `src/game/config.ts` (SURF, KITE, WING); il bot in `tests/helpers/bot.ts` prova che ogni sport è risolvibile.
- Extra: logica in `src/game/` (`daily.ts` seme del giorno, `ghost.ts` traccia fantasma compressa, `dolphins.ts`, sezioni di ritmo e salti dei rivali in `obstacles.ts`, popup/statistiche/flow/al pelo in `game.ts`), missioni in `src/custom/missions.ts`, UI in `src/ui/` (`missions.ts`, `tutorial.ts`, `postcard.ts`). Chiavi localStorage: `bob.daily.<sport>` (giorno, record, fantasma), `bob.missions`, `bob.tutorial`. Gli ostacoli nascono a `SPAWN_X` fisso (648): a parità di seme la run è identica su ogni schermo. Colori speciali: indici da `BASE_GEAR_COUNT` (11) in poi in `GEAR_COLORS`.
- Pagina di revisione sprite: `npm run dev` → `/dev/sprites/` (solo sviluppo, non va in build).
- Oltre a Vercel, la build giocabile è pubblicata come Artifact privato: https://claude.ai/artifact/HntjK84i2eX8KPYm4UGLjL (file unico generato da `dist/` con JS e CSS inline).
