# BOB — endless runner pixel art di sport d'acqua

Sei l'unico sviluppatore di questo progetto. Questo brief è la fonte di verità: salvalo subito in docs/BRIEF.md e crea un CLAUDE.md con le regole di lavoro qui sotto, così ogni sessione futura riparte da qui.

## Regole di lavoro
- Lavora per fasi, nell'ordine indicato. A fine fase: commit, preview su Vercel (dalla fase 2), riepilogo breve di cosa guardare e cosa testare. Poi FERMATI e aspetta il mio ok.
- Se trovi un problema di design o una scelta migliore, dimmelo prima di implementarla.
- Chiedimi prima di qualsiasi azione che costa: crediti Higgsfield oltre quelli della fase 1, piani a pagamento di Supabase o Vercel.

## FASI

### Fase 1 — Concept art con Higgsfield
- Usa il connettore MCP di Higgsfield. Se non è disponibile in questa sessione, fermati e dimmelo.
- Scegli il modello immagini più adatto all'illustrazione e genera 2 varianti per ciascuno dei 5 prompt sotto, sempre con STYLE in coda. Formato 16:9.
- Salva i risultati in /reference con nomi chiari (01-keyart-a.png, 01-keyart-b.png, ...).
- Mostrami le immagini e fermati: io scelgo quali tenere e tu cancelli le altre.
- Le immagini sono SOLO riferimento di stile, palette, luce e atmosfera. Non usarle mai come asset: la pixel art generata da AI ha una griglia incoerente.

STYLE: modern high-detail pixel art for a 2D side-scrolling mobile game, crisp hard-edged pixels on a consistent grid, no anti-aliasing, no blur, limited cohesive palette of about 32 colors, soft atmospheric lighting with rim light, stepped color bands instead of smooth gradients, light turquoise sky-blue sea, clean readable silhouettes, side view, no text, no logos, no UI.

> Aggiornamento (feedback utente): niente terraferma. La scena è solo mare aperto, cielo e ostacoli. Negli hydrofoil l'albero e l'ala stanno **sotto** la tavola, in acqua.

1. Key art (aggiornato: niente terraferma): Wide side-view scene of an open tropical sea for water sports, no land: light turquoise sea with layered rolling waves and white foam in the foreground, open horizon line, puffy clouds, midday sun. A surfer rides a wave, a kitesurfer jumps high with the kite in the sky, a wing foiler glides above the water holding an inflatable wing, standing on a foil board whose hydrofoil mast points straight down from the underside of the board into the water. A few sea obstacles: a navigation buoy, a small rock, a flying seagull. Clearly separated parallax layers: sky, clouds, far sea at the horizon, mid sea, foreground water. No land, no coast, no beach.

2. Time and weather (aggiornato: niente terraferma): The same open-sea side-view scene with no land (only sky, clouds, sea and a buoy) repeated in a 3x2 grid of panels with identical composition, only lighting and weather change: dawn with pink-orange sky; bright clear midday; sunset with deep orange-purple sky; night with full moon, stars and moonlight reflection; rain with grey sky and diagonal streaks; night thunderstorm with lightning. The sea keeps a light turquoise base hue, tinted by each lighting condition.

3. Athletes (versione aggiornata con BOB e BOBBA, sostituisce la lineup generica originale): Character lineup sheet on a plain flat background, two recurring characters shown in side view facing right, full body with gear: BOB (male) and BOBBA (female). Each appears three times, as a surfer on a shortboard, as a kitesurfer on a twin-tip board with harness and a small kite above, and as a wing foiler on a foil board holding a wing (the hydrofoil mast points straight down from the underside of the board, front wing at the bottom, below the board). Same face, hairstyle and signature colors for each character across all three sports. Medium stylized proportions (head slightly larger than realistic, athletic bodies, not chibi). No text or name labels in the image.

   <details><summary>Prompt 3 originale (superato)</summary>

   Athletes: Character lineup sheet on a plain flat background, six water-sports athletes in side view facing right, full body with gear, medium stylized proportions (head slightly larger than realistic, athletic bodies, not chibi): male and female surfer on shortboards, male and female kitesurfer on twin-tip boards with harness and a small kite above, male and female wing foiler on foil boards holding a wing. Varied skin tones and hairstyles, wetsuits and rash guards in different colors. Generic characters, not real people.
   </details>

4. Equipment: Asset sheet on a plain flat background, side views: four surfboards with different graphics, four leading-edge inflatable kites with different patterns, four handheld foil wings with patterns and a clear window, three hydrofoil boards with the mast pointing straight down from the underside of the board and the front wing at the bottom of the mast, plus helmets, sunglasses and harnesses in several colors.

5. Obstacles and power-ups: Props sheet on a plain flat background, side views: navigation buoys, sea rocks of different sizes, jellyfish, seaweed, flying seagulls, a small fishing boat, a floating wreck plank, a generic rival rider silhouette, and two power-up icons: a wind gust and a perfect curling wave.

### Fase 2 — Setup e loop di gioco
Vite + TypeScript + Canvas 2D, Vitest, collegamento del repository a Vercel. Loop di gioco con rettangoli placeholder, solo surf: input desktop e mobile, collisioni, punteggio, game over, restart.

> Nota: su richiesta dell'utente le fasi 4 e 5 (BOB/BOBBA, personalizzazione, cambio sport, kitesurf e wing foil) sono state anticipate e fatte prima della fase 3.

### Fase 3 — Ambiente
Parallax, mare, sistema ora/meteo, particelle.

### Fase 4 — Sprite e personalizzazione
Sprite modulari del surf (M/F), pagina /dev/sprites, schermata di personalizzazione.

### Fase 5 — Kitesurf e wing foil
Sprite e meccaniche dedicate, bilanciamento tra i tre sport.

### Fase 6 — Classifica globale
Progetto Supabase su piano free: tabelle, RLS, Edge Functions, anti-cheat.

### Fase 7 — Rifinitura
PWA, lingue, performance su mobile, deploy finale in produzione.

## SPECIFICA

### Obiettivo
Minigioco web endless runner a un solo tasto, nello spirito del dinosauro di Chrome: si prende il genere, non gli asset (niente grafica, nomi o suoni di Google). Al posto del dinosauro c'è un atleta di surf, kitesurf o wing foil, maschio o femmina, con atleta e attrezzatura completamente personalizzabili. Pixel art "HD" moderna e atmosferica. Desktop e mobile hanno la stessa priorità.

### Stack
- Vite + TypeScript, Canvas 2D, nessun game engine. Timestep fisso a 60 Hz con rendering interpolato.
- Supabase per la classifica, deploy su Vercel.
- PWA installabile e giocabile offline (classifica disattivata quando sei offline).
- Vitest per la logica pura: collisioni, punteggio, calcolo ora/meteo/fase lunare, validazione dei punteggi.

### Resa grafica
- Pixel perfect: risoluzione interna bassa (altezza ~270 px, larghezza in base all'aspect ratio), scaling nearest-neighbor, imageSmoothingEnabled = false, gestione corretta del devicePixelRatio. Mai pixel sfocati o di dimensioni diverse.
- Su telefono il gioco prende tutto lo schermo, sia in verticale sia in orizzontale (aggiornamento dell'utente: in origine il verticale era una fascia come nel dino). In verticale la larghezza di gioco resta la stessa e l'altezza in più si divide tra cielo e mare.
- Una palette unica (~32 colori + rampe per le parti personalizzabili). Niente gradienti lisci: bande a gradini o dithering ordinato.

### Sprite: li disegni tu in codice
Nessun artista umano. Ogni sprite è una matrice di indici palette in file TypeScript (una stringa per riga, un carattere = un indice), convertita in bitmap a runtime.
- Layer modulari: corpo (M/F + pelle), capelli, muta/lycra, casco, occhiali, harness, tavola, kite, wing, foil. Ogni layer ha rampe palette dedicate (3–4 toni), così la personalizzazione è un palette swap.
- Ogni combinazione si pre-renderizza una sola volta in un canvas offscreen e va in cache.
- Atleta alto circa 48–64 px, tavola inclusa. Proporzioni intermedie: testa leggermente grande, corpo atletico, non chibi.
- Animazioni per sport: ride (loop di 4–6 frame), stacco, in aria, trick (rotazione), atterraggio, caduta. Il kite è uno sprite separato, collegato all'atleta con linee disegnate.
- Qualità: rim light, ombre a cluster, silhouette leggibili a 1x, niente pixel orfani, outline selettivo.
- Pagina /dev/sprites (solo in sviluppo): tutti i frame, animazioni in loop, zoom x1/x4/x8, combinazioni casuali. È lo strumento con cui revisiono gli sprite.

### Ambiente procedurale
- Parallax a 4+ livelli, niente terraferma (solo mare aperto, cielo e ostacoli): cielo, nuvole, mare lontano all'orizzonte, mare medio, onde in primo piano.
- Mare celeste/turchese chiaro, animato a pixel: onde, schiuma, riflessi di sole e luna, scintillii. La luce lo tinge, ma deve restare riconoscibile come celeste.
- Particelle: spruzzi allo stacco e all'atterraggio, scia, schiuma, pioggia, linee di vento.

### Ora e meteo
- L'ora del giorno segue l'orario locale reale del dispositivo: alba, giorno, tramonto, notte, con transizioni a gradini. Sole e luna si muovono su un arco, stelle di notte, fase lunare reale calcolata dalla data.
- Meteo casuale per ogni partita: sereno, nuvoloso, pioggia, temporale (lampi, mare più mosso), nebbia leggera.
- Nelle impostazioni si possono forzare ora e meteo.

### Gameplay (un solo tasto)
Input: Spazio / Freccia su / click / tap ovunque. Su mobile blocca scroll, zoom da doppio tap e menu del long press. Velocità e densità degli ostacoli crescono nel tempo. Punteggio = distanza + trick, con moltiplicatore per trick consecutivi atterrati puliti.

Surf
- Tap = salto basso e veloce; tenere premuto lo allunga fino a un massimo.
- Secondo tap in aria = trick. Se atterri a metà rotazione cadi.
- Ostacoli: rocce, boe, altri surfisti, alghe, meduse.
- Power-up "Onda perfetta": tubo, invulnerabile e punti doppi per qualche secondo.

Kitesurf
- Tap = salto alto con hangtime lungo; tenere premuto in aria = trick (più rotazioni possibili).
- Il kite ha una sua hitbox: i gabbiani in quota possono colpire la vela anche quando l'atleta è basso.
- Ostacoli: gabbiani, boe, rocce, barche, altri rider.
- Power-up "Raffica di vento": mega salto.

Wing foil
- Tenere premuto = il foil sale; rilasciare = scende.
- Troppo alto = breach e caduta; troppo basso = la tavola tocca l'acqua e rallenti.
- Ostacoli in superficie (boe, rocce basse, relitti) da superare stando alti; ostacoli sott'acqua (meduse, alghe) che colpiscono l'albero del foil se stai troppo basso; gabbiani in quota.
- Power-up "Raffica di vento" (velocità e altezza extra) e "Onda perfetta" (spinta e punti doppi).

Le tre modalità devono avere difficoltà simile. Dopo i playtest proponimi tu gli aggiustamenti.

### Aggiunte di gameplay (proposte da Claude, approvate dall'utente)
- Bonus "al pelo": passare a 4 px o meno da un ostacolo stando in aria dà punti; saltare sopra rivali, kiter e barche dà un bonus.
- Ritmo a ondate: tratti normali, "serie" fitte e pause calme per i trick. Il gap minimo non cambia, quindi resta tutto superabile. La velocità sale più in fretta all'inizio e più piano vicino al massimo.
- Wing foil, zona flow: volare appena sotto il limite di breach riempie un moltiplicatore dei punti distanza fino a x3.
- Rivali vivi: fanno un salto lontano dal giocatore.
- Delfini: evento raro, saltare insieme a loro dà un bonus.
- Sfida del giorno per sport: stesso seme per tutti nello stesso giorno, record giornaliero, fantasma della run migliore e bandierina dove è finita.
- Missioni: 12, tre aperte alla volta; ognuna sblocca un colore speciale.
- Tutorial alla prima partita di ogni sport: il gioco si ferma e mostra TAP / HOLD nel momento giusto, senza poter cadere.
- Effetti: fermo immagine e scossa alla caduta, moltiplicatore combo che pulsa.
- Cartolina pixel art di fine partita da condividere o scaricare.

### Modalità e altri giochi (approvati dall'utente)
- La home è un carosello di giochi, uno alla volta (icona, nome, una riga), con GIOCA; sotto solo ASPETTO, MISSIONI e ALBUM. Il runner apre una schermata di scelta: sport e modalità.
- Modalità del runner: Infinita, Sfida del giorno, Triathlon (cambia sport ogni 40 s), 60 secondi (niente game over, cadere costa 2 s), Onda gigante (un'onda insegue), Giro del mondo (12 spot con 3 stelle), Free ride (niente ostacoli né punteggio). Un record per modalità.
- Altri giochi con BOB / BOBBA, tutti a un tasto o quasi, in mare aperto: Onde lunghe, Pesca, Apnea, Clic! (foto), Gara SUP, Regata, Surf dall'alto (sterzo con frecce o metà schermo), Gancio del relitto, Zattera, Difendi la barriera, Gabbiano, Acquario (senza punteggio). Un record per gioco (`bob.best.<gioco>`).
- Album condiviso (`bob.album`): pesci pescati con taglia, foto con stelle, creature viste, tesori, conchiglie. 34 creature e 13 tesori disegnati in codice.
- Dettagli e stato delle idee: `docs/IDEE.md`.

### Schermate
- Home: scelta dello sport, BOB / BOBBA, gioca, sfida del giorno, missioni, personalizzazione, classifica, impostazioni. Sullo sfondo l'atleta animato con ora e meteo live.
- Personalizzazione, tutto sbloccato da subito:
  - Atleta: M/F, tono pelle (almeno 6), capelli (stile + colore), muta/lycra (2 colori), casco, occhiali, harness.
  - Attrezzatura: tavola (colore + grafica), kite, wing, foil (colori + pattern).
  - Anteprima animata live e pulsante "casuale". Ogni sport ricorda la propria configurazione di muta e attrezzatura; il corpo (pelle, capelli, casco, occhiali) è condiviso tra gli sport (modifica approvata dall'utente).
  - In più del catalogo base, 12 colori speciali si sbloccano con le missioni (aggiunta approvata dall'utente): il catalogo base resta tutto sbloccato da subito.
  - Salvataggio in localStorage dentro try/catch: il gioco deve funzionare anche se il salvataggio fallisce.
- Game over: punteggio, record personale, invio in classifica con nickname, restart con un tap.
- Lingue: EN di default, IT e PT. Tutte le stringhe in un unico file.
- Niente audio, così chi gioca può tenere la propria musica in sottofondo. Vibrazione leggera su Android allo stacco e alla caduta, disattivabile.

### Classifica globale
- Una classifica per sport, all-time e settimanale: top 50 + la posizione del giocatore.
- Nessun account: nickname di 3–12 caratteri con filtro parolacce (EN, IT, PT, ES), salvato in locale.
- RLS con sola lettura pubblica; la scrittura passa solo da un'Edge Function.
- Anti-cheat base:
  - a inizio partita un'Edge Function emette un token di sessione con timestamp;
  - all'invio verifica il token, la durata e la plausibilità del punteggio (rispetto alla durata e al massimo teorico al secondo);
  - rate limit sugli invii.
  In v2, se serve, si passa a seed dal server + replay degli input.
- Nessun dato personale, nessun tracking, nessun cookie di profilazione.

### Performance
- 60 fps stabili su un telefono di fascia media.
- Object pooling per ostacoli e particelle, nessuna allocazione nel loop principale.
- Pausa automatica quando la tab perde il focus.
- Bundle leggero, nessuna dipendenza superflua.

### Personaggi
- L'atleta maschio si chiama BOB, la femmina BOBBA. Sono due personaggi fissi e ognuno può fare tutti e tre gli sport.
- Ovunque nel brief compare "M/F" si intende BOB/BOBBA.
- Nella UI la scelta del personaggio è "BOB / BOBBA", mai "maschio / femmina". Il nome compare anche nel game over e in classifica accanto al nickname.
- Ognuno ha un look di default riconoscibile (viso, capelli, colori firma), uguale in tutti gli sport. Proponimelo tu in fase 4.
- La personalizzazione modifica il look di default, ma il personaggio resta riconoscibile.
