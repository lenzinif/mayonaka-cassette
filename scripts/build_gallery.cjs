const fs = require('fs');
const path = require('path');

const outDir = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\6147b986-1f3f-4350-bf6b-7a42d3f0693f';

const assets = [
  { id: 'all', name: 'Lineup Completa (Tutti gli Asset)', category: 'Panoramica Pista', file: 'asset_showcase_all.png', desc: 'Panoramica completa con tutti i nuovi prop posizionati lungo la carreggiata e lo skyline notturno di Tokyo.', specs: '15 varianti | Zero-GC | Scaler 640x360' },
  { id: 'pylon', name: 'Delta Transmission Pylon (Traliccio a Delta)', category: 'Infrastruttura', file: 'asset_pylon.png', desc: 'Traliccio ad alta tensione a calice/delta con apertura a V, 5 isolatori ceramici e cavi elettrici che attraversano il cielo.', specs: 'Design a Delta conforme a referenza | 5 cavi orizzontali catenari | Luce di segnalazione rossa' },
  { id: 'vms', name: 'Variable Message Sign (Messaggio di Prova)', category: 'Segnaletica LED', file: 'asset_vms.png', desc: 'Display a matrice di LED ambra con visualizzazione attiva di test: "PROVA" e "TEST IN CORSO" con lampeggio diagnostico a ritmo.', specs: 'Caratteri LED a matrice | Messaggio di prova | Segnalatori di pericolo lampeggianti' },
  { id: 'building_0', name: 'Palazzo 1: Akiba Megamart & Insegna a Lama', category: 'Canyon Urbano', file: 'asset_building_0.png', desc: 'Grande palazzo commerciale in stile Akihabara con facciata a finestre retroilluminate, tenda arcade/karaoke e insegna a lama verticale.', specs: 'Insegna verticale a lama sporgente | Neon a ritmo di musica | Vetrine pianterreno' },
  { id: 'building_1', name: 'Palazzo 2: Shinjuku Cyber-Glass Skyscraper', category: 'Canyon Urbano', file: 'asset_building_1.png', desc: 'Grattacielo moderno a gradoni con fasce orizzontali continue di vetrate illuminate ciano/cobalto, logo geometrico e doppia antenna di vertice.', specs: 'Sagoma a gradoni rastremata | Fasce di vetro orizzontali continue | Doppia luce rossa ostacolo al volo' },
  { id: 'building_2', name: 'Palazzo 3: Showa Block & Cartellone Kanji a Tetto', category: 'Canyon Urbano', file: 'asset_building_2.png', desc: 'Edificio Showa in mattoni con scale antincendio esterne a zigzag in acciaio, condizionatori sporgenti e grande cartellone al neon sul tetto (カセット).', specs: 'Scala di sicurezza a zigzag | Unità AC sporgenti | Cartellone pubblicitario al neon sul tetto' },
  { id: 'shrub_0', name: 'Arbusto 1: Siepe a Cupola Bassa (Dome Hedge)', category: 'Vegetazione Stradale', file: 'asset_shrub_0.png', desc: 'Siepe autostradale densa e arrotondata a tre livelli per delimitare il bordo carreggiata e aumentare la sensazione di scorrimento.', specs: 'Sagoma bassa allungata | Tre sfumature di verde | Ombra di contatto' },
  { id: 'shrub_1', name: 'Arbusto 2: Niwaki Giapponese a Nuvole (Cloud Shrub)', category: 'Vegetazione Stradale', file: 'asset_shrub_1.png', desc: 'Secondo sprite di arbusto: cespuglio sagomato a palchi asimmetrici (stile Niwaki/bonsai da giardino urbano) con gemme e fiori neon.', specs: 'Nuova sagoma a palchi asimmetrici | Fusto legnoso visibile | Infiorescenze neon magenta/ciano' },
  { id: 'sign_0', name: 'Cartello Stradale: Limite 80 (Circolare)', category: 'Segnaletica Normale', file: 'asset_sign_0.png', desc: 'Classico cartello stradale circolare con corona rossa, disco bianco e cifra 80 blu con placchetta ausiliaria di inizio zona sottostante.', specs: 'Palo in acciaio zincato | Corona circolare rossa ad alta visibilità | Grafica standard' },
  { id: 'sign_1', name: 'Cartello Stradale: Shuto Uscita C1 (Rettangolare Verde)', category: 'Segnaletica Normale', file: 'asset_sign_1.png', desc: 'Cartello autostradale giapponese verde con scudo identificativo della circonvallazione interna C1, freccia di deviazione e indicazioni.', specs: 'Pannello verde autostradale bilingue | Scudo percorso C1 | Freccia di corsia/uscita' },
  { id: 'sign_2', name: 'Cartello Stradale: Rombo Pericolo Curva (Giallo)', category: 'Segnaletica Normale', file: 'asset_sign_2.png', desc: 'Rombo giallo di pericolo orientato a 45 gradi con bordo nero e freccia a gomito/tornante per segnalare le pieghe più strette.', specs: 'Rombo di pericolo inclinabile per curva dx/sx | Giallo riflettente | Supporto monotubo' },
  { id: 'gantry', name: 'Shuto Highway Gantry (Portale Autostradale)', category: 'Infrastruttura', file: 'asset_gantry.png', desc: 'Portale autostradale a scavalco completo con travatura reticolare e cartelli verdi bilingue Shuto Expressway.', specs: 'Drive-under clearance (No collision) | Offset 0 | Traliccio a reticolo' },
  { id: 'jihanki', name: 'Japanese Vending Machine (Jihanki)', category: 'Arredo Notturno', file: 'asset_jihanki.png', desc: 'Distributore automatico con canopy illuminata, file di lattine calde/fredde e slot monete.', specs: 'Collisione fisica attiva | Particelle cromatiche dedicate' },
  { id: 'phonebooth', name: 'Koushuu Denwa (Cabina Telefonica)', category: 'Arredo Notturno', file: 'asset_phonebooth.png', desc: 'Cabina verde smeraldo con vetrate trasparenti, telefono pubblico NTT e cupola illuminata a ritmo.', specs: 'Collisione fisica attiva | Trasparenze 90s' },
  { id: 'chevron', name: 'Curving Rhythm Chevrons', category: 'Segnaletica Guida', file: 'asset_chevron.png', desc: 'Frecce direzionali catarifrangenti animate a tempo di beat lungo i guardrail delle curve cieche.', specs: 'Beat-reactive | Guida visiva curve strette' }
];

const dataMap = {};
for (const a of assets) {
  const p = path.join(outDir, a.file);
  if (fs.existsSync(p)) {
    const b64 = fs.readFileSync(p).toString('base64');
    dataMap[a.id] = 'data:image/png;base64,' + b64;
  } else {
    console.error('File non trovato:', p);
  }
}

const html = `<!DOCTYPE html>
<html lang="it" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Galleria Asset Aggiornata Fase 4 - 真夜中Cassette</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    .pixelated {
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
    }
    .retro-glow {
      box-shadow: 0 0 25px rgba(236, 72, 153, 0.25), 0 0 50px rgba(6, 182, 212, 0.15);
    }
  </style>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3 font-sans select-none">
  <div class="bg-[var(--card,#12111d)] text-[var(--foreground,#f8fafc)] border border-[var(--border,#2b2844)] rounded-2xl p-5 shadow-2xl retro-glow max-w-6xl mx-auto">
    
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border,#2b2844)] pb-4 mb-5">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30">FASE 4 REVISION</span>
          <h1 class="text-xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-fuchsia-300 to-cyan-400">
            真夜中Cassette — Galleria Asset Scenografia & Cartellonistica
          </h1>
        </div>
        <p class="text-xs text-[var(--muted-foreground,#94a3b8)] mt-1">
          Traliccio Delta con cavi, VMS con messaggio di prova, 3 varianti di palazzi, 2 varietà di arbusti e segnaletica stradale standard
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
          135/135 Test Passati
        </span>
        <span class="text-xs px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
          Zero GC • 60 FPS
        </span>
      </div>
    </div>

    <!-- Main Active Preview -->
    <div id="featured-card" class="bg-black/60 rounded-xl border border-[var(--border,#2b2844)] p-4 mb-6 flex flex-col md:flex-row gap-5 items-center">
      <div class="w-full md:w-3/5 bg-slate-950/95 rounded-lg p-3 border border-slate-800/80 flex items-center justify-center min-h-[300px] overflow-hidden">
        <img id="featured-img" src="${dataMap['all']}" alt="Asset Preview" class="pixelated max-h-[360px] max-w-full object-contain transition-all duration-200 rounded" />
      </div>
      <div class="w-full md:w-2/5 flex flex-col justify-between space-y-4">
        <div>
          <div class="flex items-center gap-2 mb-1.5">
            <span id="featured-category" class="text-xs font-semibold uppercase tracking-wider text-cyan-400 font-mono">Panoramica Pista</span>
            <span id="featured-id" class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">prop: all</span>
          </div>
          <h2 id="featured-name" class="text-xl font-bold text-white tracking-tight">Lineup Completa (Tutti gli Asset)</h2>
          <p id="featured-desc" class="text-sm text-slate-300 mt-2 leading-relaxed">
            Panoramica completa con tutti i nuovi prop posizionati lungo la carreggiata e lo skyline notturno di Tokyo.
          </p>
        </div>
        <div class="bg-slate-900/90 rounded-lg p-3 border border-slate-800 text-xs font-mono space-y-1.5">
          <div class="text-slate-400 uppercase text-[10px] tracking-wider">Specifiche & Implementazione:</div>
          <div id="featured-specs" class="text-pink-300 font-semibold text-xs leading-snug">15 varianti | Zero-GC | Scaler 640x360</div>
        </div>
        <div class="text-xs text-slate-400 flex items-center gap-1.5">
          <span class="inline-block w-2 h-2 rounded-full bg-pink-400 animate-pulse"></span>
          Clicca sulle miniature sottostanti per esaminare ciascun prop
        </div>
      </div>
    </div>

    <!-- Thumbnails Grid -->
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
        Seleziona un elemento da esaminare (${assets.length} elementi disponibili)
      </h3>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      ${assets.map((a, idx) => `
        <button onclick="selectAsset('${a.id}')" 
          id="btn-${a.id}"
          class="asset-btn group text-left bg-black/40 hover:bg-slate-900 border ${idx === 0 ? 'border-pink-500 ring-2 ring-pink-500/30' : 'border-[var(--border,#2b2844)]'} rounded-xl p-2.5 transition-all duration-150 flex flex-col gap-2 cursor-pointer">
          <div class="w-full aspect-[4/3] bg-slate-950/80 rounded-lg border border-slate-800/80 flex items-center justify-center p-1.5 overflow-hidden">
            <img src="${dataMap[a.id]}" alt="${a.name}" class="pixelated max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-150" />
          </div>
          <div>
            <div class="text-[10px] text-cyan-400 font-mono font-medium truncate">${a.category}</div>
            <div class="text-xs font-semibold text-slate-200 truncate group-hover:text-white">${a.name}</div>
          </div>
        </button>
      `).join('')}
    </div>

  </div>

  <script>
    const assetsData = ${JSON.stringify(assets)};
    const dataMap = ${JSON.stringify(dataMap)};

    function selectAsset(id) {
      const a = assetsData.find(item => item.id === id);
      if (!a) return;

      document.getElementById('featured-img').src = dataMap[id];
      document.getElementById('featured-name').textContent = a.name;
      document.getElementById('featured-category').textContent = a.category;
      document.getElementById('featured-id').textContent = 'prop: ' + a.id;
      document.getElementById('featured-desc').textContent = a.desc;
      document.getElementById('featured-specs').textContent = a.specs;

      document.querySelectorAll('.asset-btn').forEach(btn => {
        btn.classList.remove('border-pink-500', 'ring-2', 'ring-pink-500/30');
        btn.classList.add('border-[var(--border,#2b2844)]');
      });
      const activeBtn = document.getElementById('btn-' + id);
      if (activeBtn) {
        activeBtn.classList.remove('border-[var(--border,#2b2844)]');
        activeBtn.classList.add('border-pink-500', 'ring-2', 'ring-pink-500/30');
      }
    }
  </script>
</body>
</html>`;

const targetHtml = path.join(outDir, 'props_gallery_v3.html');
fs.writeFileSync(targetHtml, html, 'utf8');
console.log('Galleria v3 generata con successo:', targetHtml);
