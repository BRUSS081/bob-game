# Pixel art di BOB: analisi e piano

Analisi fatta confrontando il gioco con giochi in pixel art premiati per la grafica e con le guide più citate dai pixel artist. Lo scopo è capire cosa rende "bella" una scena di mare in pixel art e applicarlo con il nostro metodo: tutto disegnato in codice, palette a indici, niente gradienti lisci.

## Riferimenti e cosa insegnano

| Gioco / fonte | Cosa prendiamo |
|---|---|
| **Kingdom Two Crowns** | L'acqua in primo piano riflette la scena (atleti, regno, cielo) e il riflesso si spezza in righe che ondeggiano. È l'effetto che rende "viva" una scena di profilo. |
| **Sea of Stars** | Luce dinamica legata al ciclo giorno/notte: la stessa pixel art cambia colore con l'ora. La luce racconta il momento della giornata più dei fondali. |
| **Alto's Adventure / Odyssey** (non pixel, ma stesso genere: runner a un tasto con ora e meteo) | Atmosfera fatta di livelli separati, tramonti caldi e luna fredda, meteo che cambia il colore di tutto, non solo il cielo. |
| **Hyper Light Drifter** | Palette forti e diverse per ogni ambiente, "impressionismo" più che dettaglio: colori decisi e sagome leggibili. |
| **Dead Cells** | Prima la leggibilità dei personaggi in movimento, poi la luce sopra la pixel art (luci dinamiche su sprite disegnati). |
| **Celeste** | Animazione: anticipazione, schiacciamento e allungamento, movimento secondario (capelli). Il personaggio piccolo deve leggersi a 1x. |
| Slynyrd (Raymond Schlitter), *Pixelblog: Color Palettes* e *Water in Motion* | Rampe con spostamento di tinta (ombre verso il blu/viola, luci verso il giallo). Onde: base a sinusoide con creste più ripide dei cavi, schiuma sulle creste, riflessi a linee orizzontali. |
| Lospec, *Pixel art outlines* | Contorno selettivo: dal lato della luce il contorno si schiarisce, dal lato in ombra resta scuro. Il contorno deve aumentare il contrasto, mai diminuirlo. |
| Guide su banding e pillow shading (Pixel Joint, Logbook Project, Pixel Parmesan) | Bande di colore parallele e ombre "a cuscino" sono gli errori tipici da principiante. Si correggono decidendo una direzione della luce e usando dithering o cluster per rompere i bordi. |

## Com'era il gioco (prima di questa passata)

- **Cielo**: 4 bande larghe con un bordo retinato di 4 righe. Leggibile, ma il banding si vede molto.
- **Sole**: anelli a righe orizzontali, sembrava uno schermo CRT più che luce.
- **Mare vicino**: una lastra turchese piatta con qualche trattino. Nella key art invece ci sono onde rotonde in primo piano con schiuma: era la differenza più grande tra concept e gioco.
- **Sprite**: belli di giorno, ma identici all'alba, al tramonto e di notte. Di notte l'atleta "brillava" come a mezzogiorno, e la scena perdeva coerenza.
- **Nessun riflesso** sull'acqua: atleti e ostacoli sembravano incollati sopra il mare.

## Cosa è stato applicato

1. **Luce della scena sugli sprite** (`src/render/light.ts`). Ogni sprite viene ricolorato una volta, quando entra in cache, per l'ora e il meteo:
   - giorno sereno: identico al disegno;
   - alba e tramonto: tinta calda e una **luce di contorno dal lato del sole** (a sinistra all'alba, a destra al tramonto). Va sul primo pixel dentro il contorno, così la sagoma resta leggibile;
   - notte: più scura e fredda, con luce di contorno pallida della luna dall'alto;
   - pioggia, temporale, nebbia: luce piatta e desaturata, senza contorno.

   Vale per l'atleta, i rivali, le pose dei mini-giochi, gli ostacoli e i delfini. L'anteprima della personalizzazione resta a luce piena, per vedere i colori veri.
2. **Riflessi alla Kingdom** (`Renderer.reflect`): sotto atleti, rivali e ostacoli c'è il riflesso capovolto in due toni d'acqua (più scuro o più chiaro del mare), una riga su due (una su quattro più in basso). Ondeggia di lato di più in profondità e col mare mosso. Più l'atleta salta in alto, più il riflesso sparisce.
3. **Onde in primo piano come nella key art** (`src/render/waves.ts`): tre fasce che alternano due toni di mare. Ogni fascia ha creste trocoidi (picchi stretti, cavi larghi), schiuma e spruzzi sul picco e una striscia di luce sul fronte. Le fasce più vicine sono più alte e più veloci (parallasse); col temporale crescono. Una tessera pre-renderizzata per fascia, ripetuta: nessun costo nel loop.
4. **Cielo più morbido**: transizioni retinate di 8 righe invece di 4 e una sottile fascia di foschia sull'orizzonte (prospettiva aerea).
5. **Alone del sole retinato**: un alone a dithering radiale nel colore del cielo al posto degli anelli a righe, più un anello netto e il nucleo chiaro. All'alba il sole è dorato con un anello arancio, così si stacca dalla banda gialla.
6. **Meteo** (fase 3): nebbia che vela davvero il cielo e nasconde il mare lontano (grigia di notte), mare più scuro col temporale.

## Prossimi passi (non ancora fatti)

| Idea | Riferimento | Impatto | Costo |
|---|---|---|---|
| Animazione: fotogrammi di anticipazione allo stacco, schiacciamento all'atterraggio, capelli che seguono il movimento | Celeste | alto | medio (nuovi fotogrammi in `compose.ts`) |
| Scia di luce della luna e del sole sul mare vicino, non solo su quello lontano | Kingdom, Alto | medio | basso |
| Nuvole illuminate dal lato del sole (bordo caldo al tramonto, grigio in basso) | Sea of Stars, Alto | medio | basso |
| Lampo che illumina per un istante sprite e mare | Alto | medio | basso (una luce "flash" in più) |
| Rampe della personalizzazione con spostamento di tinta (ombre più fredde, luci più calde) | Slynyrd | medio | medio (rivedere `ramps.ts`) |
| Piccolo scuotimento dello schermo e pausa di un fotogramma alla caduta | Celeste, Dead Cells | medio | basso |
| Caustiche e raggi di luce più ricchi sott'acqua (apnea, pesca, Clic!) | Sea of Stars | medio | medio |

## Fonti

- [Slynyrd, Pixelblog 1: Color Palettes](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes)
- [Slynyrd, Pixelblog 10: Water in Motion](https://slynyrd.com/blog/2018/10/12/pixelblog-10-water-in-motion)
- [Lospec, Pixel art outlines](https://lospec.com/articles/pixel-art-outlines) e [parte 2: using color](https://lospec.com/articles/pixel-art-outlines-part-2-using-color)
- [Playdate dev forum, 2D water reflection (ispirato a Kingdom)](https://devforum.play.date/t/2d-water-reflection/15205)
- [Wikipedia, Kingdom Two Crowns](https://en.wikipedia.org/wiki/Kingdom_Two_Crowns)
- [Gematsu, annuncio di Sea of Stars (luce dinamica e ciclo giorno/notte)](https://www.gematsu.com/2020/03/sabotage-studio-announces-sea-of-stars-a-turn-based-rpg-prequel-story-to-the-messenger-for-consoles-and-pc)
- [Alto's Odyssey, press kit](https://altosodyssey.com/press)
- [80.lv, intervista agli sviluppatori di Dead Cells](https://80.lv/articles/interview-with-the-developers-of-dead-cells)
- [Creative Bloq, da Hyper Light Drifter a Hyper Light Breaker](https://creativebloq.com/3d/video-game-design/from-pixels-to-polygons-making-hyper-light-breaker-s-cel-shaded-world)
- [Pixel Parmesan, Anti-aliasing fundamentals](https://pixelparmesan.com/blog/anti-aliasing-fundamentals-for-pixel-artists)
- [The Logbook Project, banding e pillow shading](https://the-logbook-project.blogspot.com/2013/04/pixel-art-lessons-jiinchus-darkness.html)
- [Pixel Joint, The Pixel Art Tutorial](https://pixeljoint.com/forum/forum_posts.asp?TID=11299)
