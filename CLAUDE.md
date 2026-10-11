# BOB — istruzioni per Claude

Endless runner pixel art a un solo tasto (surf, kitesurf, wing foil) con i personaggi BOB e BOBBA.
La fonte di verità è **[docs/BRIEF.md](docs/BRIEF.md)**: leggilo per intero all'inizio di ogni sessione.

## Regole di lavoro
- Lavora per fasi, nell'ordine del brief (1 → 7). Non anticipare lavoro di fasi successive.
- **Piena autonomia** (decisione dell'utente): non chiedere l'ok per idee, migliorie o passaggi di fase. Implementa e basta, poi riassumi cosa hai fatto.
- A fine fase: commit, deploy in produzione e Artifact aggiornati, riepilogo breve di cosa guardare e cosa testare; poi prosegui.
- Se trovi un problema di design o una scelta migliore, applicala e segnalala nel riepilogo.
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
| 3 — Ambiente | fatta, in attesa di ok: ora reale (alba, giorno, tramonto, notte, sole e luna su un arco, fase lunare vera), meteo casuale per partita (sereno, nuvoloso, pioggia, temporale, nebbia), particelle, schermata impostazioni |
| 4 — Sprite e personalizzazione | fatta e approvata: sprite BOB/BOBBA in codice, `/dev/sprites`, home con sport e BOB/BOBBA, personalizzazione a 3 schede |
| 5 — Kitesurf e wing foil | fatta e approvata: meccaniche, ostacoli e power-up per sport, bot su 3 sport |
| Extra — proposte di gameplay | fatte e approvate: al pelo, ritmo a ondate, flow nel wing, rivali vivi, delfini, sfida del giorno con fantasma, missioni con colori speciali, tutorial, effetti, cartolina |
| Extra — modalità e altri giochi | fatti e approvati: home a carosello, 5 modalità del runner, 12 giochi nuovi, album condiviso |
| Extra — passata di pixel art | fatta, in attesa di ok: analisi con riferimenti in `docs/PIXEL-ART.md`, luce dell'ora sugli sprite, riflessi sull'acqua, onde in primo piano, cielo e sole più morbidi; 232 test |
| 6 — Classifica globale | pronta nel codice, da collegare: database, Edge Function con anti-trucco, schermata RANKS con nickname, invio a fine partita, 248 test (+8 Deno). Manca il progetto Supabase: la creazione è stata bloccata dai permessi della sessione, serve l'ok dell'utente (piano free, costo zero) |
| 7 — Rifinitura | da fare |

Aggiorna questa tabella a ogni fine fase.

## Note per le sessioni future
- Fase 1: account Higgsfield su piano free (1.52 crediti all'avvio). GPT Image 2.5 richiede il piano Basic; l'unico modello che rientra nel saldo è Z Image (0.15 crediti/immagine, 16:9, 2048×1152), con rate limit di circa un job alla volta.
- Z Image è fallito 5 volte di fila (coda bloccata). L'utente genera le immagini da solo con i prompt di `docs/PROMPTS.md` e le carica in `/reference`.
- Alla fine l'utente ha chiesto di disegnare io le pixel art di riferimento ispirandomi alle immagini AI (non scaricabili per la network policy): `scripts/render-reference.ts`, palette master in `src/render/palette.ts`.
- Generate anche via MCP: 5 su Figma (gemini-3.1-flash-image, piano Starter, 1376×768, link validi 7 giorni) e 5 su Canva (il quinto, ostacoli, è riuscito al secondo tentativo). Anche `www.figma.com` è bloccato dalla network policy, quindi i file vanno caricati in `/reference` a mano.
- Il CDN delle immagini Higgsfield (`d8j0ntlcm91z4.cloudfront.net`) è bloccato dalla network policy dell'ambiente: per salvare i PNG in `/reference` va aggiunto agli Allowed domains.
- Fase 2: tuning surf in `src/game/config.ts`. `tests/game.test.ts` contiene un bot che gioca 150 s su più seed: se un cambio di tuning rende impossibile una sequenza, fallisce.
- Vercel: account Hobby, progetto `bob-game` (`prj_M889Vz8ZFCT4SN3LtonHIkKFDsle`) collegato a GitHub: ogni push crea un deploy. Con il connettore MCP chiama i tool **senza** `teamId`/`slug` (con `teamId` risponde 403 sullo scope `bruss1`). Vercel Authentication disattivata su richiesta dell'utente: le preview si aprono senza login. URL: https://bob-game-tau.vercel.app (alias del branch: `bob-game-git-claude-vigilant-hawking-qmmxhx-bruss1.vercel.app`). I push sul branch creano solo preview (il branch di produzione è `main`): per aggiornare la produzione usa `create_deployment` con `deploymentId` dell'ultima preview e `target: "production"` (`request_promote` risponde 422). Se la preview dell'ultimo push non compare, aggiungi `withLatestCommit: true`: il deploy di produzione prende l'ultimo commit del branch. Il connettore non può cancellare singoli deploy: si fa dalla dashboard. `*.vercel.app` è bloccato dalla network policy di questo ambiente.
- Fasi 4–5: `src/app.ts` gestisce le schermate in `src/ui/` (home, customize, play). Profilo in `src/custom/profile.ts`: chiavi `bob.sport`, `bob.rider` (BOB/BOBBA unico per tutti gli sport), `bob.look.<sport>.<bob|bobba>`, `bob.best.<sport>`. Modello di personalizzazione in `src/custom/athlete.ts` (OPTIONS, schede athlete/suit/gear); sprite composti in `src/sprites/compose.ts`, palette swap con le rampe di `src/sprites/ramps.ts`, cache in `src/sprites/sheet.ts`. Tuning per sport in `src/game/config.ts` (SURF, KITE, WING); il bot in `tests/helpers/bot.ts` prova che ogni sport è risolvibile.
- Extra: logica in `src/game/` (`daily.ts` seme del giorno, `ghost.ts` traccia fantasma compressa, `dolphins.ts`, sezioni di ritmo e salti dei rivali in `obstacles.ts`, popup/statistiche/flow/al pelo in `game.ts`), missioni in `src/custom/missions.ts`, UI in `src/ui/` (`missions.ts`, `tutorial.ts`, `postcard.ts`). Chiavi localStorage: `bob.daily.<sport>` (giorno, record, fantasma), `bob.missions`, `bob.tutorial`. Gli ostacoli nascono a `SPAWN_X` fisso (648): a parità di seme la run è identica su ogni schermo. Colori speciali: indici da `BASE_GEAR_COUNT` (11) in poi in `GEAR_COLORS`.
- BOBBA (ridisegnata su richiesta dell'utente, "non sembra una donna"): busto a clessidra con seno (`TORSO_BOBBA` in `compose.ts`), braccia più sottili, ciglia e labbra (`HEADS.bobba`, `l` = labbra), coda lunga fino alle spalle; nessuna acconciatura deve coprirle l'occhio (test in `tests/sprites.test.ts`). Costumi `swimsuit` e `bikini`; il costume intero è il default di BOBBA nel surf, e un look casuale di BOB non pesca costume o bikini.
- Idee discusse con l'utente (modalità approvate, altri giochi proposti, ordine da confermare): `docs/IDEE.md`. Aggiornalo quando l'utente approva o scarta un'idea.
- Giochi nuovi: uno per file in `src/games/` (classe di logica pura testata in `tests/games/` + schermata che estende `MiniGame` di `src/games/kit.ts`: carta iniziale, pausa, fine, record, popup), registrati in `src/games/index.ts`; elenco e ordine del carosello in `src/games/registry.ts`. Parole di ogni gioco in `gameText.<gioco>` di `strings.ts`. Pose nuove di BOB/BOBBA in `src/sprites/actor.ts` (`ctx.actor(kind)`: paddle, fish, swim, photo, stand, slope, top, boat), creature in `src/games/sealife.ts` + `src/sprites/fish.ts`, tesori in `src/games/treasures.ts`, fondali in `src/render/sea.ts`, album in `src/custom/album.ts` + `src/ui/album.ts`. Modalità del runner: `src/game/modes.ts`, `src/game/tour.ts`, schermate `src/ui/setup.ts` e `src/ui/tour.ts`.
- Con 5 agenti in parallelo il limite di utilizzo dell'account si è esaurito in pochi minuti: meglio lavorare in sequenza.
- Fase 3: logica pura in `src/env/` (`sky.ts` ora, alba e tramonto stagionali senza posizione, fase lunare; `weather.ts` meteo e probabilità; `environment.ts` stato condiviso `r.env`, lampi). Disegno in `src/render/sky.ts` (cielo, sole/luna, stelle, nuvole, nebbia, pioggia e lampi davanti alla scena con `r.weatherFront`), particelle in `src/render/particles.ts`. Impostazioni in `src/ui/settings.ts`, chiave `bob.settings` (`sky`, `weather`: valore o `auto`). Per provare un cielo dalla console: `app.r.env.apply('night', 'storm')`.
- Pixel art: `src/render/light.ts` ricolora gli sprite per ora e meteo quando entrano in cache (`r.light` lo imposta `backdrop()`, le cache di sprite, pose e ostacoli lo usano come chiave; la personalizzazione forza `DAYLIGHT`). Riflessi in `Renderer.reflect`, onde in primo piano in `src/render/waves.ts`. Home e scelta modalità scelgono la misura più grande che entra (su telefono in orizzontale rimpiccioliscono la scheda, mai i pulsanti).
- Fase 6: tutto in `supabase/` (vedi `supabase/README.md`): migrazione, Edge Function `leaderboard` (`handler.ts` testato con Deno e un database finto), regole condivise in `supabase/functions/_shared/rules.ts` (importate anche dal gioco). Client in `src/net/` (`leaderboard.ts` letture e chiamate con timeout, `ranks.ts` sessione per partita e invii in attesa del nickname, `config.ts` URL e chiave pubblica: vuoti finché il progetto non esiste, e il gioco mostra "GLOBAL RANKS COMING SOON"). Schermata `src/ui/ranks.ts` con tastierino del nickname; chiavi `bob.nick` e `bob.player` (segreto casuale del dispositivo, sul server solo il suo SHA-256). Organizzazione Supabase `ygyfohahziywpjmxefht` (piano free, nessun progetto). Deno per i test: `npm install deno` in una cartella fuori dal repo.
- Pagina di revisione sprite: `npm run dev` → `/dev/sprites/` (solo sviluppo, non va in build).
- Oltre a Vercel, la build giocabile è pubblicata come Artifact privato: https://claude.ai/artifact/HntjK84i2eX8KPYm4UGLjL (file unico generato da `dist/` con JS e CSS inline).
