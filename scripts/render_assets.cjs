const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ts = require('typescript');

const outDir = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\6147b986-1f3f-4350-bf6b-7a42d3f0693f';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempHtmlPath = path.join(outDir, 'scratch', 'temp_preview.html');

const src = fs.readFileSync('C:\\Users\\USER\\Documents\\Codice\\Game Dev\\mayonaka-cassette\\src\\road\\RoadsideProps.ts', 'utf8');
const transpiled = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 } }).outputText;

const assets = [
  {
    id: 'building_0',
    name: 'Palazzo 1: Akiba Megamart & Neon Blade Sign',
    category: 'Canyon Urbano',
    filename: 'asset_building_0.png',
    drawCode: `drawProp(ctx, 'building', 350, 490, 0.046, -1, 0, 0.8);`
  },
  {
    id: 'building_1',
    name: 'Palazzo 2: Shinjuku Cyber-Glass Skyscraper',
    category: 'Canyon Urbano',
    filename: 'asset_building_1.png',
    drawCode: `drawProp(ctx, 'building', 350, 500, 0.042, -1, 1, 0.8);`
  },
  {
    id: 'building_2',
    name: 'Palazzo 3: Showa Block & Rooftop Kanji Billboard',
    category: 'Canyon Urbano',
    filename: 'asset_building_2.png',
    drawCode: `drawProp(ctx, 'building', 350, 480, 0.048, -1, 2, 0.8);`
  },
  {
    id: 'pylon',
    name: 'Delta Transmission Pylon (Traliccio a Delta con Cavi)',
    category: 'Infrastruttura',
    filename: 'asset_pylon.png',
    drawCode: `drawProp(ctx, 'pylon', 300, 520, 0.042, 1, 0, 0);`
  },
  {
    id: 'vms',
    name: 'Variable Message Sign (Messaggio di Prova)',
    category: 'Segnaletica LED',
    filename: 'asset_vms.png',
    drawCode: `drawProp(ctx, 'vms', 300, 450, 0.092, 1, 0, 0.9);`
  },
  {
    id: 'shrub_0',
    name: 'Arbusto 1: Roadside Dome Hedge (Siepe a Cupola)',
    category: 'Vegetazione',
    filename: 'asset_shrub_0.png',
    drawCode: `drawProp(ctx, 'shrub', 300, 440, 0.22, 1, 0, 0);`
  },
  {
    id: 'shrub_1',
    name: 'Arbusto 2: Sculpted Japanese Niwaki (Arbusto a Palchi)',
    category: 'Vegetazione',
    filename: 'asset_shrub_1.png',
    drawCode: `drawProp(ctx, 'shrub', 300, 450, 0.20, 1, 1, 0);`
  },
  {
    id: 'sign_0',
    name: 'Cartello Stradale: Limite di Velocità 80',
    category: 'Segnaletica Normale',
    filename: 'asset_sign_0.png',
    drawCode: `drawProp(ctx, 'sign', 300, 460, 0.12, 1, 0, 0);`
  },
  {
    id: 'sign_1',
    name: 'Cartello Stradale: Shuto Uscita / Direzione C1',
    category: 'Segnaletica Normale',
    filename: 'asset_sign_1.png',
    drawCode: `drawProp(ctx, 'sign', 300, 460, 0.12, 1, 1, 0);`
  },
  {
    id: 'sign_2',
    name: 'Cartello Stradale: Rombo Pericolo Curva',
    category: 'Segnaletica Normale',
    filename: 'asset_sign_2.png',
    drawCode: `drawProp(ctx, 'sign', 300, 460, 0.12, 1, 2, 0);`
  },
  {
    id: 'gantry',
    name: 'Overhead Shuto Highway Gantry (Portal)',
    category: 'Infrastruttura Shuto',
    filename: 'asset_gantry.png',
    drawCode: `drawProp(ctx, 'gantry', 300, 460, 0.068, 1, 0, 0);`
  },
  {
    id: 'jihanki',
    name: 'Japanese Vending Machine (Jihanki)',
    category: 'Arredo Notturno',
    filename: 'asset_jihanki.png',
    drawCode: `drawProp(ctx, 'jihanki', 300, 470, 0.155, 1, 0, 0);`
  },
  {
    id: 'phonebooth',
    name: 'Koushuu Denwa (Japanese Public Phone Booth)',
    category: 'Arredo Notturno',
    filename: 'asset_phonebooth.png',
    drawCode: `drawProp(ctx, 'phonebooth', 300, 480, 0.145, 1, 0, 0);`
  },
  {
    id: 'chevron',
    name: 'Curving Rhythm Chevrons (Pulsing Arrows)',
    category: 'Segnaletica Dinamica',
    filename: 'asset_chevron.png',
    drawCode: `drawProp(ctx, 'chevron', 300, 440, 0.165, 1, 0, 0.85);`
  }
];

if (!fs.existsSync(path.join(outDir, 'scratch'))) {
  fs.mkdirSync(path.join(outDir, 'scratch'), { recursive: true });
}

for (const asset of assets) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #080417;
      color: #f8f9fa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      width: 600px;
      height: 560px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      overflow: hidden;
      border: 2px solid #241442;
      border-radius: 12px;
      position: relative;
    }
    .header {
      width: 100%;
      padding: 16px 20px;
      background: linear-gradient(180deg, rgba(20, 10, 40, 0.95), rgba(12, 6, 26, 0.8));
      border-bottom: 1px solid rgba(0, 245, 212, 0.25);
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 10;
    }
    .title-group { display: flex; flex-direction: column; gap: 4px; }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: #00f5d4;
      background: rgba(0, 245, 212, 0.12);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid rgba(0, 245, 212, 0.35);
      width: fit-content;
    }
    .title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.5px;
    }
    .watermark {
      font-size: 12px;
      font-weight: 600;
      color: #ff2a85;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 600px;
      height: 560px;
      image-rendering: pixelated;
    }
    .footer-bar {
      position: absolute;
      bottom: 0;
      width: 100%;
      padding: 8px 20px;
      background: rgba(8, 4, 23, 0.85);
      border-top: 1px solid rgba(255, 42, 133, 0.2);
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #8b80a6;
      z-index: 10;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-group">
      <span class="badge">${asset.category}</span>
      <h1 class="title">${asset.name}</h1>
    </div>
    <div class="watermark">真夜中 CASSETTE</div>
  </div>

  <canvas id="stage" width="600" height="560"></canvas>

  <div class="footer-bar">
    <span>NATIVE 16-BIT PROCEDURAL CANVAS 2D</span>
    <span>ZERO GC ALLOCATIONS • SCALED VIA PPU</span>
  </div>

  <script>
    var exports = {};
    ${transpiled}
    var drawProp = exports.drawProp;

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');

    // Studio Background & Retro Perspective Grid
    ctx.fillStyle = '#080417';
    ctx.fillRect(0, 0, 600, 560);

    // Floor shadow baseline
    const groundY = 500;
    const floorGrad = ctx.createLinearGradient(0, groundY - 80, 0, 560);
    floorGrad.addColorStop(0, '#080417');
    floorGrad.addColorStop(0.3, '#100826');
    floorGrad.addColorStop(1, '#1b0c3b');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, groundY - 40, 600, 560 - groundY + 40);

    // Perspective Studio Floor Grid
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.18)';
    ctx.lineWidth = 1;
    for (let gy = groundY - 20; gy <= 550; gy += 15) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(600, gy);
      ctx.stroke();
    }
    for (let gx = -100; gx <= 700; gx += 50) {
      ctx.beginPath();
      ctx.moveTo(gx, 560);
      ctx.lineTo(300 + (gx - 300) * 0.4, groundY - 30);
      ctx.stroke();
    }

    // Vignette / studio rim light
    ctx.fillStyle = 'rgba(255, 42, 133, 0.08)';
    ctx.fillRect(0, 0, 600, 560);

    // Draw the asset
    ${asset.drawCode}
  </script>
</body>
</html>`;

  fs.writeFileSync(tempHtmlPath, html);
  const outPngPath = path.join(outDir, asset.filename);
  const fileUrl = 'file:///' + tempHtmlPath.replace(/\\/g, '/');
  
  console.log(`Rendering ${asset.filename}...`);
  execSync(`"${chromePath}" --headless=new --disable-gpu --window-size=600,560 --screenshot="${outPngPath}" "${fileUrl}"`);
}

// Generate the 15th combined scene showcase!
const combinedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #080417;
      color: #f8f9fa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      width: 1200px;
      height: 600px;
      overflow: hidden;
      position: relative;
    }
    canvas {
      width: 1200px;
      height: 600px;
      image-rendering: pixelated;
    }
    .overlay-title {
      position: absolute;
      top: 16px;
      left: 20px;
      background: rgba(12, 6, 26, 0.88);
      padding: 10px 18px;
      border-radius: 8px;
      border: 1px solid rgba(0, 245, 212, 0.35);
      z-index: 10;
    }
    .overlay-title h1 {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.5px;
    }
    .overlay-title p {
      font-size: 11px;
      color: #00f5d4;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="overlay-title">
    <h1>FASE 4: COMPREHENSIVE ROAD PROPS & SCENOGRAPHY</h1>
    <p>Akihabara Canyon, Delta Pylon, VMS Test, Shuto Signs & Shrub Variants</p>
  </div>
  <canvas id="stage" width="1200" height="600"></canvas>
  <script>
    var exports = {};
    ${transpiled}
    var drawProp = exports.drawProp;

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, 420);
    sky.addColorStop(0, '#060312');
    sky.addColorStop(0.65, '#12082b');
    sky.addColorStop(1, '#2c0c4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1200, 600);

    // Road ground
    const roadY = 510;
    ctx.fillStyle = '#0f1424';
    ctx.fillRect(0, roadY, 1200, 90);
    ctx.fillStyle = '#1c243a';
    ctx.fillRect(0, roadY - 10, 1200, 10);

    // Left Akiba Urban Canyon: 3 Buildings side by side
    drawProp(ctx, 'building', 130, roadY, 0.046, -1, 0, 0.8); // Akiba Mart
    drawProp(ctx, 'building', 260, roadY, 0.040, -1, 1, 0.8); // Shinjuku Cyber Glass
    drawProp(ctx, 'building', 390, roadY, 0.044, -1, 2, 0.8); // Showa Block with Billboard

    // Center Roadway: Overhead Gantry & VMS with Test Message
    drawProp(ctx, 'gantry', 600, roadY, 0.052, 1, 0, 0.8);
    drawProp(ctx, 'vms', 770, roadY, 0.065, 1, 0, 0.9);

    // Vending machine & phonebooth on sidewalk
    drawProp(ctx, 'jihanki', 465, roadY, 0.075, 1, 0, 0);
    drawProp(ctx, 'phonebooth', 510, roadY, 0.075, 1, 0, 0);

    // Right Shoulder: Road Signs, Shrubs, Chevrons, Delta Pylon
    drawProp(ctx, 'sign', 860, roadY, 0.09, 1, 0, 0); // Speed 80
    drawProp(ctx, 'sign', 915, roadY, 0.09, 1, 1, 0); // Highway Exit C1
    drawProp(ctx, 'sign', 960, roadY, 0.09, 1, 2, 0); // Curve Diamond
    drawProp(ctx, 'shrub', 1010, roadY, 0.12, 1, 0, 0); // Dome hedge
    drawProp(ctx, 'shrub', 1055, roadY, 0.12, 1, 1, 0); // Tiered Niwaki
    drawProp(ctx, 'chevron', 890, roadY, 0.08, -1, 0, 0.9);
    drawProp(ctx, 'pylon', 1130, roadY, 0.040, 1, 0, 0); // Delta Pylon with cables!
  </script>
</body>
</html>`;

const combinedHtmlPath = path.join(outDir, 'scratch', 'combined_preview.html');
fs.writeFileSync(combinedHtmlPath, combinedHtml);
const combinedPngPath = path.join(outDir, 'asset_showcase_all.png');
const combinedUrl = 'file:///' + combinedHtmlPath.replace(/\\/g, '/');

console.log('Rendering asset_showcase_all.png...');
execSync(`"${chromePath}" --headless=new --disable-gpu --window-size=1200,600 --screenshot="${combinedPngPath}" "${combinedUrl}"`);

console.log('All asset preview PNGs successfully generated!');
