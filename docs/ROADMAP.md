# 真夜中Cassette (Mayonaka Cassette) — Roadmap & TODO List

Documento strategico per l'evoluzione di *Mayonaka Cassette* dallo stato attuale (**Playable Alpha v0.1.0-alpha**) verso la **Beta** e il rilascio finale.

---

## 📑 Indice dei Macro-Obiettivi

1. [HUD Overhaul (Rifacimento Plancia & Interfaccia)](#1-hud-overhaul-rifacimento-plancia--interfaccia)
2. [Nuovi Asset nei Chunk di Strada (Roadside Props)](#2-nuovi-asset-nei-chunk-di-strada-roadside-props)
3. [Nuovi Ambienti & Biomi (Theme Expansion)](#3-nuovi-ambienti--biomi-theme-expansion)
4. [Feedback & Balance Pipeline (Ascolto dei Giocatori)](#4-feedback--balance-pipeline-ascolto-dei-giocatori)
5. [Ottimizzazione Performance & Rendering](#5-ottimizzazione-performance--rendering)
6. [Nuove Feature di Gameplay & Progressione](#6-nuove-feature-di-gameplay--progressione)
7. [Funkier (Juice, Audio-Visual Flair & Tape Magic)](#7-funkier-juice-audio-visual-flair--tape-magic)

---

## 1. HUD Overhaul (Rifacimento Plancia & Interfaccia)

*Terminologia tecnica:* **HUD Overhaul** (o **HUD Redesign** se puramente estetico). Nel contesto di un arcade driving game anni '80, l'overhaul prevede sia il restyling visivo diegetico sia la separazione ottimizzata della pipeline di telemetria.

- [ ] **Stile Plancia Anni '80 (VFD / LED fluorescente):**
  - Tachimetro e contagiri (RPM) ridisegnati con grafica a segmenti digitali verdi/turchese brillante tipici delle cruscotti digitali giapponesi anni '80 (es. Toyota Soarer / Subaru XT / Testarossa).
  - Indicatore di marcia gigante con animazione retroilluminata per il beat-shift.
- [ ] **Cassette Tape Groove Meter Diegetico:**
  - Trasformare la barra del Groove in una vera musicassetta illustrata in pixel art: le bobine del nastro girano più velocemente all'aumentare della velocità e del tier di Groove (`LOW`, `MEDIUM`, `HIGH`, `SSS`).
  - Effetto nastro srotolato o nastro allentato nei momenti di impatto o caduta di Groove.
- [ ] **Feedback Ritmico Visivo Integrato:**
  - Flash di giudizio (`PERFECT`, `GOOD`, `EARLY`, `LATE`) posizionati in modo più leggibile senza ostruire la linea visiva della strada (ad esempio sui montanti del cruscotto o sul quadrante marce).
  - Beat-pulse discreto che fa pulsare la cornice dell'HUD a tempo di cassa/kick.
- [ ] **Layout Modulare & Scalabilità Display:**
  - Ottimizzazione per display ultrawide (21:9) e schermi ridotti (modalità finestra / tablet), mantenendo il canvas a 640×360 centrato e scalato con integer scaling (`pixelated`).
  - Opzione per HUD "minimal" o "cinema" (toggle per nascondere tutto e godersi la guida).

---

## 2. Nuovi Asset nei Chunk di Strada (Roadside Props)

Espansione della varietà visiva degli ostacoli e delle decorazioni a bordo carreggiata, arricchendo i `RoadChunks`:

- [ ] **Insegne al Neon & Cartelloni Pubblicitari Retro:**
  - Cartelloni luminosi con finte pubblicità Future Funk/Vaporwave: brand di bevande gassate giapponesi, sintetizzatori vintage (Roland, Korg), marchi di cassette vergini (Maxell, TDK).
  - Varianti animate o a sequenza di colori neon sincronizzate con l'illuminazione notturna.
- [ ] **Arredo Urbano Autostradale Giapponese:**
  - Distributori automatici giapponesi (Jihanki) illuminati a bordo strada su marciapiedi sopraelevati.
  - Cabine telefoniche verdi illuminate al neon, guardrail metallici continui nelle curve tecniche da drift.
  - Lampioni autostradali Shuto Expressway ad arco, con pali che sfilano fluidamente a ritmo.
- [ ] **Tunnel & Sovrappassi:**
  - Chunk di strada con gallerie e sottopassi illuminati da luci stroboscopiche arancioni/gialle a ritmo di musica.
- [ ] **Varietà del Traffico AI:**
  - Oltre al Kei Truck: berline anni '80 (es. silhouette squadrata stile Toyota Mark II/Chaser), furgoncini di consegne notturne, motociclette veloci con scia di luce posteriore stile cyberpunk.

---

## 3. Nuovi Ambienti & Biomi (Theme Expansion)

Oltre al tramonto synthwave base, introduzione di temi e palette distinte caricate o alternate durante i cambi di stage / canzoni:

- [ ] **Bioma 1: Tokyo Midnight Expressway (Shuto / Wangan):**
  - Sfondo con skyline denso di grattacieli con finestre accese pixelate, torri di trasmissione rosse lampeggianti, asfalto scuro con riflessi blu/viola.
- [ ] **Bioma 2: Sunset Coastal Highway (Enoshima / Pacific Coast):**
  - Tramonto arancione e magenta, sole basso a strisce, filari di palme tropicali e mare con gradiente a onde riflesso in pseudo-3D sul lato strada.
- [ ] **Bioma 3: Mount Haruna / Touge Notturno:**
  - Strada montuosa alberata con pini scuri, tornanti tecnici, nebbia viola volumetrica sui picchi montani e cielo stellato limpido con luna piena.
- [ ] **Bioma 4: Cyber Megacity Rainy Run:**
  - Asfalto lucido con effetto bagnato (specular reflection delle luci), pioggia leggera stilizzata e atmosfera club sotterranea.
- [ ] **Palette Transitions:**
  - Dissolvenza e interpolazione morbida dei colori cielo/orizzonte durante le transizioni di stage tra brani.

---

## 4. Feedback & Balance Pipeline (Ascolto dei Giocatori)

Come strutturare e gestire il ciclo di feedback della community per bilanciare le meccaniche di guida e audio:

### Canali di Raccolta
- [ ] **In-Game Quick Feedback Button:**
  - Pulsante non invasivo nel menu di pausa (`Escape`) e nella schermata finale del voto (`GradeScreen`): *"Invia Feedback / Segnala Bug"*.
  - Apre un form leggero (Tally.so o Google Form) o indirizza a GitHub Issues pre-compilato.
  - **Inclusione automatica di telemetria anonima nei parametri URL:** browser/OS, risoluzione schermo, FPS medio della sessione, titolo/BPM del brano giocato, Tofu Mode on/off.
- [ ] **GitHub Discussions Hub:**
  - Categorie dedicate sul repository:
    - 💡 *Idee & Nuove Meccaniche*
    - ⚖️ *Bilanciamento (Fisica, Drift, Beat-Shift, Melon Soda)*
    - 🎵 *Canzoni & Analisi Audio (brani che generano piste perfette vs tracce problematiche)*
    - 🐛 *Bug Report & Performance*
- [ ] **Community Discord / Forum:**
  - Canale per condividere screenshot dei punteggi SSS, registrazioni di derapate e consigli sui brani musicali migliori.

### Aree di Bilanciamento Primarie
- [ ] **Tolleranza Beat-Shift:**
  - Validare se le finestre attuali (±50ms `PERFECT`, ±100ms `GOOD`) risultano troppo severe o permissive con tastiere economiche o controller Bluetooth con latenza variabile.
- [ ] **Sensibilità al Jerk della Melon Soda (Tofu Mode):**
  - Calibrare la soglia di sversamento: una bella derapata continua deve inclinare la soda senza versarla; cambi bruschi di direzione o frenate da panico devono farla traboccare.
- [ ] **Aggressività del Traffico:**
  - Regolare distanza di avvistamento e velocità dei Kei truck per evitare collisioni inevitabili in uscita da curve cieche.
- [ ] **Passo Ibrido Spazio-Tempo (A1/A2):**
  - Continuare a calibrare la velocità di riferimento e il fattore elastico per fare in modo che sia il giocatore cauto che quello aggressivo arrivino all'orizzonte sincronizzati col drop.

---

## 5. Ottimizzazione Performance & Rendering

- [ ] **Zero-Allocation Canvas Loop Audit:**
  - Verificare costantemente che nessun frame generi garbage collection (array temporanei, oggetti point `Vector2/3`, stringhe generate dinamicamente nei loop di rendering `RoadRenderer.render`).
- [ ] **Supporto Monitor High-Refresh Rate (120Hz, 144Hz, 240Hz):**
  - Ottimizzare il rendering a frame rate sbloccato garantendo che l'interpolazione temporale `alpha` di `FixedStepper` azzeri qualsiasi micro-stuttering o jittering dell'auto e della telecamera.
- [ ] **Sprite Batching & Cache Off-Screen:**
  - Pre-renderizzare e scalare i poligoni e gli elementi decorativi statici su offscreen canvas prima di blittarli durante il Painter's Algorithm.
- [ ] **Memory Management Playlist Lunghe:**
  - Rilasciare i buffer PCM o gestire una cache LRU per sessioni di gioco prolungate con dozzine di brani importati.

---

## 6. Nuove Feature di Gameplay & Progressione

- [ ] **Ghost Car / Replay del Miglior Giro:**
  - Visualizzare l'auto fantasma semitrasparente che riproduce la traiettoria e la velocità del record personale sulla traccia corrente.
- [ ] **Cassette Collection & Album Cover Art:**
  - Creare un "Cassette Rack" virtuale nel menu dove ogni traccia completata con grado S o SSS riceve una cassetta personalizzata con etichetta pixel art generata dal titolo del brano.
- [ ] **Personalizzazione Estetica Auto:**
  - Selezione del colore della carrozzeria della vettura (Testarossa rosso corsa, bianco perla, viola synthwave, nero notte) e varianti di cerchi.
- [ ] **Zen / Cruise Mode:**
  - Modalità rilassata opzionale: collisioni e sversamenti disattivati, cambio marce automatico, per guidare ascoltando la propria musica in puro flow-state contemplativo.
- [ ] **Biforcazioni di Stage Avanzate:**
  - Rendere le due strade del bivio visivamente e tematicamente differenti (es. biforcazione a sinistra: rampa sopraelevata panoramica; biforcazione a destra: tunnel sotterraneo).

---

## 7. Funkier (Juice, Audio-Visual Flair & Tape Magic)

Migliorare l'impatto emotivo, il ritmo e l'atmosfera "Future Funk" (il cosiddetto *game juice*):

- [ ] **Tape Audio Wow & Flutter:**
  - Nelle curve al limite o quando si subisce un urto con un guardrail, oltre al muffle del filtro passa-basso, introdurre una leggera ondulazione di pitch tipica di un registratore a nastro portatile con le pile scariche.
- [ ] **Audio-Reactive Scenery Pulse:**
  - Grattacieli, stelle e insegne al neon dell'orizzonte che pulsano di luminosità in sincrono con i bassi e la cassa della traccia audio.
- [ ] **DJ Scratch & Backspin alle Biforcazioni:**
  - Quando si imbocca una diramazione al bivio di fine canzone, accompagnare il crossfade con un effetto sonoro analogico di scratch o reverse tape rewind per accentuare il passaggio al nuovo brano.
- [ ] **Particelle al Neon:**
  - Fumo rosa/turchese dalle gomme in derapata ad alto Groove.
  - Scintille dal fondo della scocca quando la macchina scollina bruscamente da una discesa ripida.
  - Gocce di soda fluorescente che lasciano un breve alone semitrasparente sul parabrezza prima di evaporare.
