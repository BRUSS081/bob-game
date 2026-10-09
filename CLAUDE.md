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

## Stato
| Fase | Stato |
|---|---|
| 1 — Concept art (Higgsfield) | in corso: immagini generate, in attesa della scelta dell'utente |
| 2 — Setup e loop di gioco | da fare |
| 3 — Ambiente | da fare |
| 4 — Sprite e personalizzazione | da fare |
| 5 — Kitesurf e wing foil | da fare |
| 6 — Classifica globale | da fare |
| 7 — Rifinitura | da fare |

Aggiorna questa tabella a ogni fine fase.

## Note per le sessioni future
- Fase 1: modello usato GPT Image 2.5 (variant flare, quality low, 1k, 16:9). Saldo Higgsfield all'avvio: 1.52 crediti (piano free); 10 immagini = 1.25 crediti.
