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

- [ ] Stile plancia anni '80 (display fluorescente VFD):
  - Tachimetro e contagiri a segmenti digitali verdi e turchesi, ispirati ai cruscotti giapponesi dell'epoca (Toyota Soarer, Subaru XT).
  - Indicatore di marcia retroilluminato per il beat-shift.
- [ ] Indicatore del Groove a cassetta:
  - Disegnare la barra del Groove come una musicassetta in pixel art, con le bobine che ruotano a seconda della velocità e del livello di Groove (`LOW`, `MEDIUM`, `HIGH`, `SSS`).
  - Animazione del nastro allentato in caso di impatto o calo di Groove.
- [ ] Indicatori di ritmo:
  - Riposizionare i giudizi (`PERFECT`, `GOOD`, `EARLY`, `LATE`) sui montanti o vicino alle marce, lasciando libera la visuale della strada.
  - Leggero impulso visivo sulla cornice a tempo di cassa.
- [ ] Adattabilità dello schermo:
  - Supporto per display ultrawide (21:9) e finestre ridotte, mantenendo il canvas a 640×360 centrato con integer scaling.
  - Tasto rapido per nascondere l'HUD e guidare a schermo pulito.

---

## 2. Nuovi elementi a bordo strada

Aggiungere varietà agli ostacoli e alle decorazioni nei `RoadChunks`:

- [ ] Insegne al neon e cartelloni:
  - Cartelloni con finte pubblicità vaporwave: bibite giapponesi, sintetizzatori vintage (Roland, Korg), cassette a nastro (Maxell, TDK).
  - Varianti con luci neon animate a ritmo di musica.
- [ ] Arredo autostradale giapponese:
  - Distributori automatici (jihanki) illuminati a bordo strada.
  - Cabine telefoniche verdi e guardrail continui lungo le curve da drift.
  - Lampioni ad arco della Shuto Expressway che sfilano a tempo.
- [ ] Gallerie e sovrappassi:
  - Sottopassi e tunnel con luci stroboscopiche arancioni o gialle.
- [ ] Varietà nel traffico:
  - Nuovi veicoli oltre al kei truck: berline squadrate anni '80, furgoni per le consegne e motociclette con scia luminosa.

---

## 3. Nuovi ambienti e biomi

Aggiungere scenari alternativi caricati tra una canzone e l'altra o al cambio di stage:

- [ ] Tokyo Midnight Expressway (Shuto / Wangan): skyline con grattacieli pixelati, luci rosse sulle torri di trasmissione e asfalto scuro con riflessi blu e viola.
- [ ] Sunset Coastal Highway: costa al tramonto arancione e magenta, sole basso a strisce, palme e gradiente marino.
- [ ] Mount Haruna / Touge notturno: strada di montagna tra i pini, tornanti stretti, nebbia viola sui crinali e luna piena.
- [ ] Cyber Megacity: asfalto bagnato con riflessi di luce, pioggia leggera e atmosfera notturna.
- [ ] Transizioni di palette: dissolvenza graduale dei colori tra cielo e orizzonte durante il passaggio tra i brani.

---

## 4. Raccolta feedback e bilanciamento

Strumenti per raccogliere impressioni di guida e bilanciare la fisica:

### Canali di raccolta
- [ ] Pulsante rapido per il feedback:
  - Voce nel menu di pausa (`Escape`) e nella schermata di fine corsa per inviare commenti o aprire una issue precompilata su GitHub.
  - Inclusione di dati tecnici utili nei parametri URL: browser, risoluzione, framerate medio, brano giocato e stato della modalità Tofu.
- [ ] Spazi di discussione:
  - Categorie dedicate su GitHub Discussions per nuove idee, bilanciamento del modello di guida, analisi dei brani e bug.
  - Canale della community per condividere punteggi, registrazioni e consigli sui brani.

### Bilanciamento prioritario
- [ ] Finestre di beat-shift: verificare se le tolleranze attuali (±50 ms per `PERFECT`, ±100 ms per `GOOD`) funzionano bene anche con tastiere economiche o controller wireless con latenza variabile.
- [ ] Sensibilità della melon soda (Tofu Mode): regolare la soglia in modo che una derapata controllata inclini il bicchiere senza farlo traboccare, punendo solo cambi bruschi di traiettoria e frenate improvvise.
- [ ] Traffico: regolare distanza di avvistamento e velocità dei furgoncini per evitare impatti inevitabili all'uscita delle curve cieche.
- [ ] Passo ibrido spazio-tempo: affinare la velocità di riferimento e il riallineamento elastico per far coincidere lo scollinamento con il drop sia per chi guida pulito sia per chi rallenta.

---

## 5. Prestazioni e rendering

- [ ] Controllo delle allocazioni nel loop di rendering: assicurarsi che nessun fotogramma crei oggetti temporanei (vettori, array o stringhe) durante `RoadRenderer.render`.
- [ ] Supporto per frequenze elevate (120 Hz, 144 Hz, 240 Hz): mantenere l'interpolazione temporale in `FixedStepper` priva di scatti o tremolii della telecamera a framerate elevati.
- [ ] Disegno e cache off-screen: pre-renderizzare forme ed elementi statici su canvas secondari per velocizzare la composizione.
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
- [ ] Scenari reattivi alla musica: grattacieli, stelle e insegne che pulsano in sincrono con i bassi e la cassa della traccia.
- [ ] Scratch e riavvolgimento ai bivi: accompagnare il cambio di brano al bivio con un breve effetto di scratch o nastro che si riavvolge.
- [ ] Particelle al neon:
  - Fumo color magenta e turchese dalle gomme durante le derapate ad alto Groove.
  - Scintille dal fondo piatto quando l'auto tocca l'asfalto al termine di una discesa ripida.
  - Gocce di soda che lasciano un alone temporaneo sul parabrezza prima di svanire.
