# 真夜中Cassette (Mayonaka Cassette): roadmap e attività

Piano di sviluppo per portare il gioco dalla versione alpha attuale (v0.6.0) alla beta e al rilascio.

---

## Indice

0. [Roadmap attiva — Prossimo ciclo di sviluppo](#0-roadmap-attiva--prossimo-ciclo-di-sviluppo)
1. [Nuovi elementi a bordo strada](#1-nuovi-elementi-a-bordo-strada)
2. [Nuovi ambienti e biomi](#2-nuovi-ambienti-e-biomi)
3. [Raccolta feedback](#3-raccolta-feedback)
4. [Prestazioni e rendering](#4-prestazioni-e-rendering)
5. [Meccaniche di gioco e progressione](#5-meccaniche-di-gioco-e-progressione)
6. [Dettagli visivi e sonori](#6-dettagli-visivi-e-sonori)

---

## 0. Roadmap attiva — Prossimo ciclo di sviluppo

Obiettivi fissati e ordinati per priorità e dipendenze tecniche. I punti di fondazione (P0) vanno chiusi e verificati prima di introdurre nuove feature (P1–P4).

### P0 — Fondamenta: Rendering (Bloccanti)
#### P0.1 — Rework sostanziale del rendering progressivo
- [ ] **Eliminare gli stacchi netti di profondità:**
  - [ ] Eliminare la linea di demarcazione netta a metà altezza dello schermo che separa chiaramente il confine di disegno/profondità.
  - [ ] Rimuovere gli stati discreti e gli scatti visivi dei prop a soglie fisse di distanza (es. edifici con 3 stati netti, alberi con 2 stati): sostituire con una transizione/scalatura continua e progressiva o con un livello di dettaglio fluido privo di pop-in e salti visivi, preservando gli attuali 60 FPS stabili.

#### P0.2 — Terreno migliorato (nel budget dei 60 FPS)
- [ ] **Terreno migliorato (oltre il monocolore):**
  - [ ] Superare l'attuale resa piatta a tinta unita del terreno fuori strada con dettagli procedurali/gradiente/texture coerenti con la profondità e il bioma, restando rigorosamente dentro il budget dei 60 FPS.

### P1 — Gameplay & Interattività sui Beat Veloci (Subito dopo P0)
- [ ] **Velocità e interattività nei tratti a beat veloci:**
  - [ ] Alzare leggermente la velocità massima raggiungibile.
  - [ ] Rendere più interattivi i tratti in cui i beat sono più veloci, incentivando attivamente l'uso del cambio marcia e del beat-shift.
  - [ ] Verificare la leggibilità anticipata delle curve (segnaletica/`chevron`) e la tolleranza della derapata affinché l'aumento di velocità e ritmo non comprometta il *flow state* né causi urti inevitabili col traffico.

### P2 — Identità Estetica (Due Filoni Distinti) & HUD
- [ ] **Filone 1 — UI e Menù (Esperienza Walkman):**
  - [ ] Risolvere la discordanza attuale tra i due stili dei menu ("slick elettrico" vs "nostalgico mellow") unificando schermata del titolo, menu principale e menu secondari attorno all'esperienza tattile del **"caricare una cassetta nel Walkman, interagire con le varie opzioni del dispositivo e far partire la musica"**.
  - [ ] Perfezionare estetica, leggibilità e feedback visivo del widget cassetta (`CassetteTapeWidget`) in coerenza con questa identità.
- [x] **Filone 2 — Estetica della Guida (Cockpit Diegetico, Lussurioso, Rilassato e Funky):**
  - [x] Evolvere la visuale esterna dall'alto in modo che simuli la sensazione di una visuale in prima persona attraverso elementi diegetici dell'abitacolo, **tutti togglable** singolarmente (per consentire una schermata volutamente ricca/*cluttered* o pulita a scelta del giocatore):
    - [x] **Tofu Mode sul cruscotto:** rendere chiaramente leggibile il bicchiere appoggiato sul cruscotto.
    - [x] **Foto su aletta parasole:** permettere di caricare immagini manga/anime localmente dal dispositivo dell'utente e fissarle su un'aletta parasole.
    - [x] **Contagiri e velocimetro:** integrarli come strumentazione della plancia.
    - [x] **Plancia della playlist:** integrare il controllo/visualizzazione della playlist come autoradio/console di bordo.

### P3 — Personalizzazione Auto
- [ ] **Personalizzazione estetica del veicolo:**
  - [ ] Selezione di livree/colori (es. rosso corsa, bianco perla, viola o nero), varianti di cerchioni, dettagli e finiture in continuità con lo stile dell'abitacolo.

### P4 — Long Term Theorycrafting
- [ ] **Redesign UI del menù (Cassette Player diegetico):**
  - [ ] Trasformare il menù principale in un vero e proprio *cassette player* interattivo e tattile.
  - [ ] Dopo aver caricato le tracce, premendo **DRIVE** parte una breve animazione fluida di inserimento della cassetta nel lettore, seguita da una transizione verso la schermata di gioco (design della transizione da definire).
- [ ] **Nuovi tipi di macchina:**
  - [ ] Introdurre nuovi modelli/tipi di vettura selezionabili dal giocatore (oltre al modello base).
- [ ] **Modalità prima persona:**
  - [ ] Implementare una visuale in prima persona completa a pieno schermo dalla postazione di guida.

---

## 1. Nuovi elementi a bordo strada

- [ ] Distributori automatici (*jihanki*) illuminati a bordo strada: **temporaneamente sospesi dallo spawn** finché non verrà implementato il sistema di archetipi ambientali per chunk (`urbano` / `semiurbano`).
- [ ] Varietà nel traffico:
  - [ ] Nuovi veicoli oltre al kei truck: berline squadrate anni '80, furgoni per le consegne e motociclette con scia luminosa.

---

## 2. Nuovi ambienti e biomi

- [ ] Mount Haruna / Touge notturno: strada di montagna tra i pini, tornanti stretti, nebbia viola sui crinali e luna piena.
- [ ] Transizioni di palette: dissolvenza graduale dei colori tra cielo e orizzonte durante il passaggio tra i brani.
- [ ] **Sistema di Archetipi Ambientali per Chunk:** categorizzare i `RoadChunk` (es. `urbano`, `semiurbano`, `rurale`, `foresta`, `deserto`, `costiero`) affinché la densità, i prop stradali, i vignette (incluso il ritorno contestuale dei *jihanki*) e i corridoi di vegetazione siano coerenti col carattere ambientale del chunk.

---

## 3. Raccolta feedback

- [ ] Pulsante rapido per il feedback:
  - [ ] Inclusione di dati tecnici utili nei parametri URL: browser, risoluzione, framerate medio, brano giocato e stato della modalità Tofu.
- [ ] Spazi di discussione:
  - [ ] Canale della community per condividere punteggi, registrazioni e consigli sui brani.

---

## 4. Prestazioni e rendering

- [ ] Gestione della memoria per playlist lunghe: liberare i buffer audio non utilizzati o implementare una cache per sessioni prolungate con molti brani.

---

## 5. Meccaniche di gioco e progressione

- [ ] Modalità crociera (Zen): guida rilassata senza collisioni né sversamenti, con cambio automatico, per ascoltare la musica senza penalità.
- [ ] Bivi di percorso differenziati: rendere le due diramazioni visivamente distinte, ad esempio una rampa panoramica sopraelevata a sinistra e un sottopasso a destra.

---

## 6. Dettagli visivi e sonori

- [ ] Effetto nastro rovinato (wow e flutter): aggiungere una leggera oscillazione di tonalità tipica delle cassette usurate quando si urta un guardrail o si esce di strada.
- [ ] Scratch e riavvolgimento ai bivi: accompagnare il cambio di brano al bivio con un breve effetto di scratch o nastro che si riavvolge.
- [ ] Particelle al neon:
  - [ ] Scintille dal fondo piatto quando l'auto tocca l'asfalto al termine di una discesa ripida.
  - [ ] Gocce di soda che lasciano un alone temporaneo sul parabrezza prima di svanire.
