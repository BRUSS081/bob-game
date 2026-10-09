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
- Fase 1: account Higgsfield su piano free (1.52 crediti all'avvio). GPT Image 2.5 richiede il piano Basic; l'unico modello che rientra nel saldo è Z Image (0.15 crediti/immagine, 16:9, 2048×1152), con rate limit di circa un job alla volta.
- Z Image è fallito 5 volte di fila (coda bloccata). L'utente genera le immagini da solo con i prompt di `docs/PROMPTS.md` e le carica in `/reference`.
- Il CDN delle immagini Higgsfield (`d8j0ntlcm91z4.cloudfront.net`) è bloccato dalla network policy dell'ambiente: per salvare i PNG in `/reference` va aggiunto agli Allowed domains.
