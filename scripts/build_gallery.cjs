const fs = require('fs');
const path = require('path');

const outDir = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\6147b986-1f3f-4350-bf6b-7a42d3f0693f';

const assets = [
  { id: 'all', name: 'Lineup Completa (Tutti i Prop)', category: 'Panoramica', file: 'asset_showcase_all.png', desc: 'Confronto in scala di tutti gli 8 nuovi asset procedurali della Fase 4 posizionati lungo la pista.', specs: '8 asset | Zero-GC | Scaler pseudo-3D' },
  { id: 'building', name: 'Akihabara High-Rise Facade', category: 'Canyon Urbano', file: 'asset_building.png', desc: 'Edificio commerciale multilivello con finestre illuminate e insegna verticale a lama sporgente con neon pulsanti a ritmo.', specs: 'Offset laterale >= ±1.6 | Beat-reactive | Zero-GC' },
  { id: 'gantry', name: 'Shuto Highway Gantry', category: 'Infrastruttura', file: 'asset_gantry.png', desc: 'Portale autostradale a scavalco completo con travatura reticolare e cartelli verdi bilingue (Kanji/Romaji) Shuto Expressway.', specs: 'Drive-under clearance (No collision) | Offset 0' },
  { id: 'vms', name: 'Variable Message Sign (VMS)', category: 'Segnaletica LED', file: 'asset_vms.png', desc: 'Tabellone informativo con matrice di punti LED ambra e messaggi ironici Future Funk (\'NEXT DROP 1KM\', \'SLOW DOWN\').', specs: 'Drive-under clearance | Matrice ambra' },
  { id: 'jihanki', name: 'Japanese Vending Machine', category: 'Arredo Notturno', file: 'asset_jihanki.png', desc: 'Distributore automatico di bevande stile Boss Coffee / Melon Soda con canopy retroilluminata, doppie file di lattine e slot monete.', specs: 'Collisione fisica attiva | Particelle cromatiche dedicate' },
  { id: 'phonebooth', name: 'Koushuu Denwa (Cabina Telefonica)', category: 'Arredo Notturno', file: 'asset_phonebooth.png', desc: 'Tipica cabina telefonica pubblica verde smeraldo con vetrate trasparenti, telefono interno e cupola illuminata a ritmo.', specs: 'Collisione fisica attiva | Trasparenze 90s' },
  { id: 'chevron', name: 'Curving Rhythm Chevrons', category: 'Segnaletica Guida', file: 'asset_chevron.png', desc: 'Pannelli direzionali a freccia giallo/nera montati sui guardrail che pulsano a ritmo di musica per guidare in curva.', specs: 'Beat-reactive | Guida visiva curve strette' },
  { id: 'pylon', name: 'Power Pylon (Traliccio)', category: 'Infrastruttura Industriale', file: 'asset_pylon.png', desc: 'Traliccio d\'acciaio per linee elettriche ad alta tensione tipico della cintura metropolitana di Tokyo.', specs: 'Carpenteria reticolare | Bordo pista' },
  { id: 'shrub', name: 'Roadside Shrub (Arbusto)', category: 'Vegetazione Stradale', file: 'asset_shrub.png', desc: 'Siepe autostradale frondosa multilivello a tre sfumature per aumentare la sensazione di velocita periferica.', specs: 'LOD scalare | Transizione verde/pastello' }
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
  <title>Galleria Asset Fase 4 - 真夜中Cassette</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    .pixelated {
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
    }
    .retro-glow {
      box-shadow: 0 0 20px rgba(236, 72, 153, 0.2), 0 0 40px rgba(6, 182, 212, 0.1);
    }
  </style>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3 font-sans select-none">
  <div class="bg-[var(--card,#12111d)] text-[var(--foreground,#f8fafc)] border border-[var(--border,#2b2844)] rounded-2xl p-5 shadow-2xl retro-glow max-w-5xl mx-auto">
    
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border,#2b2844)] pb-4 mb-5">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30">FASE 4</span>
          <h1 class="text-xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-fuchsia-300 to-cyan-400">
            真夜中Cassette — Asset Viewer
          </h1>
        </div>
        <p class="text-xs text-[var(--muted-foreground,#94a3b8)] mt-1">
          Scenografia e arredo urbano procedurale pixel-art con LOD, animazione ritmica e zero GC (Risoluzione nativa 640×360)
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
          60 FPS Locked
        </span>
        <span class="text-xs px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
          Zero-GC
        </span>
      </div>
    </div>

    <!-- Main Active Preview -->
    <div id="featured-card" class="bg-black/60 rounded-xl border border-[var(--border,#2b2844)] p-4 mb-6 flex flex-col md:flex-row gap-5 items-center">
      <div class="w-full md:w-3/5 bg-slate-950/90 rounded-lg p-3 border border-slate-800/80 flex items-center justify-center min-h-[280px] overflow-hidden">
        <img id="featured-img" src="${dataMap['all']}" alt="Asset Preview" class="pixelated max-h-[340px] max-w-full object-contain transition-all duration-200 rounded" />
      </div>
      <div class="w-full md:w-2/5 flex flex-col justify-between space-y-4">
        <div>
          <div class="flex items-center gap-2 mb-1.5">
            <span id="featured-category" class="text-xs font-semibold uppercase tracking-wider text-cyan-400 font-mono">Panoramica</span>
            <span id="featured-id" class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">prop: all</span>
          </div>
          <h2 id="featured-name" class="text-xl font-bold text-white tracking-tight">Lineup Completa (Tutti i Prop)</h2>
          <p id="featured-desc" class="text-sm text-slate-300 mt-2 leading-relaxed">
            Confronto in scala di tutti gli 8 nuovi asset procedurali della Fase 4 posizionati lungo la pista.
          </p>
        </div>
        <div class="bg-slate-900/90 rounded-lg p-3 border border-slate-800 text-xs font-mono space-y-1.5">
          <div class="text-slate-400 uppercase text-[10px] tracking-wider">Specifiche Tecniche:</div>
          <div id="featured-specs" class="text-pink-300 font-semibold text-xs">8 asset | Zero-GC | Scaler pseudo-3D</div>
        </div>
        <div class="text-xs text-slate-400 flex items-center gap-1.5">
          <span class="inline-block w-2 h-2 rounded-full bg-pink-400 animate-pulse"></span>
          Clicca sulle miniature in basso per ispezionare ogni singolo prop
        </div>
      </div>
    </div>

    <!-- Thumbnails Grid -->
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
        Seleziona un asset per visualizzarlo ingrandito
      </h3>
      <span class="text-[11px] text-slate-500 font-mono">9 viste disponibili</span>
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

const targetHtml = path.join(outDir, 'props_gallery.html');
fs.writeFileSync(targetHtml, html, 'utf8');
console.log('Galleria generata con successo:', targetHtml);
