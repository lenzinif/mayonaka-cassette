# 真夜中Cassette (Mayonaka Cassette): roadmap e attività

Piano di sviluppo per portare il gioco dalla versione alpha attuale (v0.1.0-alpha) alla beta e al rilascio.

---

## Indice

1. [Rifacimento plancia e HUD](#1-rifacimento-plancia-e-hud)
2. [Nuovi elementi a bordo strada](#2-nuovi-elementi-a-bordo-strada)
3. [Nuovi ambienti e biomi](#3-nuovi-ambienti-e-biomi)
4. [Raccolta feedback e bilanciamento](#4-raccolta-feedback-e-bilanciamento)
5. [Prestazioni e rendering](#5-prestazioni-e-rendering)
6. [Meccaniche di gioco e progressione](#6-meccaniche-di-gioco-e-progressione)
7. [Dettagli visivi e sonori](#7-dettagli-visivi-e-sonori)

---

## 1. Rifacimento plancia e HUD

Ridisegnare il cruscotto con elementi grafici anni '80 e ottimizzare la telemetria a schermo.

- [x] Stile plancia anni '80 (display fluorescente VFD):
  - [x] Tachimetro e contagiri a segmenti digitali verdi e turchesi, ispirati ai cruscotti giapponesi dell'epoca (Toyota Soarer, Subaru XT).
  - [x] Indicatore di marcia retroilluminato per il beat-shift.
- [x] Indicatore del Groove a cassetta:
  - [x] Disegnare la barra del Groove come una musicassetta in pixel art, con le bobine che ruotano a seconda della velocità e del livello di Groove (`LOW`, `MEDIUM`, `HIGH`, `SSS`).
  - [x] Animazione del nastro allentato in caso di impatto o calo di Groove.
- [x] Indicatori di ritmo:
  - [x] Riposizionare i giudizi (`PERFECT`, `GOOD`, `EARLY`, `LATE`) sui montanti o vicino alle marce, lasciando libera la visuale della strada.
  - [x] Leggero impulso visivo sulla cornice a tempo di cassa.
- [x] Adattabilità dello schermo:
  - [x] Supporto per display ultrawide (21:9) e finestre ridotte, mantenendo il canvas a 640×360 centrato con integer scaling.
  - [x] Tasto rapido per nascondere l'HUD e guidare a schermo pulito (`H`).

---

## 2. Nuovi elementi a bordo strada

Aggiungere varietà agli ostacoli e alle decorazioni nei `RoadChunks`:

- [x] Insegne al neon e cartelloni (Fase 4):
  - [x] Cartelloni e palazzi in stile Akihabara con insegne a lama verticali animate a tempo di beat (`building`).
  - [x] Tre stili architettonici urbani: Akiba Megamart, Grattacielo Cyber-Glass a fasce e Showa Block con cartellone al neon a tetto (`カセット`).
- [x] Arredo autostradale e scenografia giapponese (Fase 4):
  - [x] Distributori automatici (*jihanki*) illuminati a bordo strada con lattine calde/fredde e particelle dedicate.
  - [x] Cabine telefoniche pubbliche verdi (*kōshū denwa*) con vetrate trasparenti e luce interna.
  - [x] Portali a scavalco autostradale Shuto (*gantry*) bilingue e tabelloni a messaggio variabile (*vms*) con messaggi di prova LED ambra.
  - [x] Traliccio ad alta tensione a Delta con cavi aerei catenari e isolatori in ceramica (`pylon`).
  - [x] Frecce direzionali animate a ritmo di musica per le curve cieche (`chevron`).
  - [x] Arbusti e siepi a bordo carreggiata a doppia sagoma (siepe a cupola e *niwaki* a palchi asimmetrici).
  - [x] Segnaletica stradale normale: limite circolare 80 km/h, uscita autostradale verde Shuto C1, rombo giallo di pericolo curva (`sign`).
- [x] Gallerie e sovrappassi (Ponti & Tunnel):
  - [x] **Ponte A (Cavalcavia / Overpass a scavalco):** Struttura sopraelevata in cemento armato con travature in acciaio e piloni di sostegno laterali sotto cui l'auto transita a tutta velocità (`offset: 0`).
  - [x] **Ponte B (Sezione su Ponte Sospeso / Rainbow Bridge):** Tratto di strada con barriere metalliche a traliccio continuo sul bordo asfalto, torri monumentali ad arco bianco/arancio e tiranti diagonali illuminati.
  - [x] **Tunnel A (Portale d'Ingresso Tunnel):** Imboccatura monumentale ad arco in cemento armato con bande riflettenti di sagoma giallo/nere e luci di galleria.
  - [x] **Tunnel B (Interno Galleria con Luci al Neon):** Centine ad arco continuo a soffitto con tubi al neon arancioni al sodio o ciano che sfilano in rapida successione prospettica a ritmo di musica.
- [ ] Varietà nel traffico:
  - [ ] Nuovi veicoli oltre al kei truck: berline squadrate anni '80, furgoni per le consegne e motociclette con scia luminosa.

---

## 3. Nuovi ambienti e biomi

Aggiungere scenari alternativi caricati tra una canzone e l'altra o al cambio di stage:

- [x] Tokyo Midnight Expressway (Shuto / Wangan): skyline con grattacieli pixelati, luci rosse sulle torri di trasmissione e asfalto scuro con riflessi blu e viola (`night` / `MAYONAKA BAY`).
- [x] Sunset Coastal Highway: costa al tramonto arancione e magenta, sole basso a strisce, palme e gradiente marino (`og_future_funk` / `SUNSET BOULEVARD`).
- [ ] Mount Haruna / Touge notturno: strada di montagna tra i pini, tornanti stretti, nebbia viola sui crinali e luna piena.
- [x] Cyber Megacity: asfalto bagnato con riflessi di luce, pioggia leggera e atmosfera notturna (`akiba_night` con meteo dinamico).
- [ ] Transizioni di palette: dissolvenza graduale dei colori tra cielo e orizzonte durante il passaggio tra i brani.

---

## 4. Raccolta feedback e bilanciamento

Strumenti per raccogliere impressioni di guida e bilanciare la fisica:

### Canali di raccolta
- [ ] Pulsante rapido per il feedback:
  - [x] Voce nel menu di pausa (`Escape`) e nella schermata di fine corsa per inviare commenti o aprire una issue precompilata su GitHub.
  - [ ] Inclusione di dati tecnici utili nei parametri URL: browser, risoluzione, framerate medio, brano giocato e stato della modalità Tofu.
- [ ] Spazi di discussione:
  - [x] Categorie dedicate su GitHub Discussions per nuove idee, bilanciamento del modello di guida, analisi dei brani e bug (`.github/DISCUSSION_TEMPLATE/`).
  - [ ] Canale della community per condividere punteggi, registrazioni e consigli sui brani.

### Bilanciamento prioritario
- [x] Finestre di beat-shift: verificare se le tolleranze attuali (±50 ms per `PERFECT`, ±100 ms per `GOOD`) funzionano bene anche con tastiere economiche o controller wireless con latenza variabile.
- [x] Sensibilità della melon soda (Tofu Mode): regolare la soglia in modo che una derapata controllata inclini il bicchiere senza farlo traboccare, punendo solo cambi bruschi di traiettoria e frenate improvvise.
- [x] Traffico: regolare distanza di avvistamento e velocità dei furgoncini per evitare impatti inevitabili all'uscita delle curve cieche.
- [x] Passo ibrido spazio-tempo: affinare la velocità di riferimento e il riallineamento elastico per far coincidere lo scollinamento con il drop sia per chi guida pulito sia per chi rallenta.

---

## 5. Prestazioni e rendering

- [x] Controllo delle allocazioni nel loop di rendering: assicurarsi che nessun fotogramma crei oggetti temporanei (vettori, array o stringhe) durante `RoadRenderer.render`.
- [x] Supporto per frequenze elevate (120 Hz, 144 Hz, 240 Hz): mantenere l'interpolazione temporale in `FixedStepper` priva di scatti o tremolii della telecamera a framerate elevati.
- [x] Disegno e cache off-screen: pre-renderizzare forme ed elementi statici su canvas secondari per velocizzare la composizione (es. nuvole procedurali e gradienti del cielo).
- [ ] Gestione della memoria per playlist lunghe: liberare i buffer audio non utilizzati o implementare una cache per sessioni prolungate con molti brani.

---

## 6. Meccaniche di gioco e progressione

- [ ] Auto fantasma: mostrare una sagoma semitrasparente che ripercorre traiettoria e tempi del proprio record personale sulla traccia.
- [ ] Raccolta cassette: schermata dedicata in cui ogni brano completato con grado S o SSS assegna una cassetta personalizzata in pixel art con il titolo del brano.
- [ ] Colori della vettura: selezione della livrea (rosso corsa, bianco perla, viola o nero) e varianti di cerchioni.
- [ ] Modalità crociera (Zen): guida rilassata senza collisioni né sversamenti, con cambio automatico, per ascoltare la musica senza penalità.
- [ ] Bivi di percorso differenziati: rendere le due diramazioni visivamente distinte, ad esempio una rampa panoramica sopraelevata a sinistra e un sottopasso a destra.

---

## 7. Dettagli visivi e sonori

Dettagli per rafforzare l'atmosfera retro e il ritmo:

- [ ] Effetto nastro rovinato (wow e flutter): aggiungere una leggera oscillazione di tonalità tipica delle cassette usurate quando si urta un guardrail o si esce di strada.
- [x] Scenari reattivi alla musica: grattacieli, stelle e insegne che pulsano in sincrono con i bassi e la cassa della traccia.
- [ ] Scratch e riavvolgimento ai bivi: accompagnare il cambio di brano al bivio con un breve effetto di scratch o nastro che si riavvolge.
- [ ] Particelle al neon:
  - [x] Fumo color magenta e turchese dalle gomme durante le derapate ad alto Groove.
  - [ ] Scintille dal fondo piatto quando l'auto tocca l'asfalto al termine di una discesa ripida.
  - [ ] Gocce di soda che lasciano un alone temporaneo sul parabrezza prima di svanire.
