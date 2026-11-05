const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const outDir = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\6147b986-1f3f-4350-bf6b-7a42d3f0693f';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempHtmlPath = path.join(outDir, 'scratch', 'temp_preview.html');

const roadsidePropsCode = fs.readFileSync('C:\\Users\\USER\\Documents\\Codice\\Game Dev\\mayonaka-cassette\\src\\road\\RoadsideProps.ts', 'utf8')
  // Strip TypeScript types so it runs in browser JS
  .replace(/import type .*/g, '')
  .replace(/export function drawProp/g, 'function drawProp')
  .replace(/: CanvasRenderingContext2D/g, '')
  .replace(/: number/g, '')
  .replace(/: void/g, '')
  .replace(/: PropKind/g, '')
  .replace(/ as const/g, '');

const assets = [
  {
    id: 'building',
    name: 'Akiba High-Rise Facade & Vertical Blade Sign',
    category: 'Canyon Urbano',
    filename: 'asset_building.png',
    drawCode: `drawProp(ctx, 'building', 350, 490, 0.046, -1, 0, 0.8);`
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
    id: 'gantry',
    name: 'Overhead Shuto Highway Gantry (Portal)',
    category: 'Infrastruttura Shuto',
    filename: 'asset_gantry.png',
    drawCode: `drawProp(ctx, 'gantry', 300, 460, 0.068, 1, 0, 0);`
  },
  {
    id: 'vms',
    name: 'Variable Message Sign (Amber LED Matrix)',
    category: 'Infrastruttura Shuto',
    filename: 'asset_vms.png',
    drawCode: `drawProp(ctx, 'vms', 300, 450, 0.092, 1, 0, 0.9);`
  },
  {
    id: 'chevron',
    name: 'Curving Rhythm Chevrons (Pulsing Arrows)',
    category: 'Segnaletica Dinamica',
    filename: 'asset_chevron.png',
    drawCode: `drawProp(ctx, 'chevron', 300, 440, 0.165, 1, 0, 0.85);`
  },
  {
    id: 'pylon',
    name: 'Japanese Electrical Transmission Pylon',
    category: 'Paesaggio Suburbano',
    filename: 'asset_pylon.png',
    drawCode: `drawProp(ctx, 'pylon', 300, 510, 0.044, 1, 0, 0);`
  },
  {
    id: 'shrub',
    name: 'Roadside Shrub / Synthwave Foliage',
    category: 'Vegetazione',
    filename: 'asset_shrub.png',
    drawCode: `drawProp(ctx, 'shrub', 300, 440, 0.22, 1, 0, 0);`
  }
];

// Ensure scratch dir exists
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
    ${roadsidePropsCode}

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

    // Subtle Perspective Studio Floor Grid
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

// Generate the 9th combined scene showcase!
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
      width: 960,
      height: 540;
      overflow: hidden;
      position: relative;
    }
    canvas {
      width: 960px;
      height: 540px;
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
    <h1>FASE 4: COMPREHENSIVE ASSET SHOWCASE</h1>
    <p>Akihabara Night Rush & Shuto Expressway Props Lineup</p>
  </div>
  <canvas id="stage" width="960" height="540"></canvas>
  <script>
    ${roadsidePropsCode}

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');

    // Synthwave Night Sky Gradient
    const sky = ctx.createLinearGradient(0, 0, 0, 380);
    sky.addColorStop(0, '#060312');
    sky.addColorStop(0.65, '#12082b');
    sky.addColorStop(1, '#2c0c4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 960, 540);

    // Road & Pavement ground
    const roadY = 460;
    ctx.fillStyle = '#0f1424';
    ctx.fillRect(0, roadY, 960, 80);
    ctx.fillStyle = '#1c243a';
    ctx.fillRect(0, roadY - 10, 960, 10); // Sidewalk curb

    // Overhead Gantry spanning across center
    drawProp(ctx, 'gantry', 480, roadY, 0.055, 1, 0, 0.8);

    // Left Akiba Urban Canyon: High-rise facade
    drawProp(ctx, 'building', 150, roadY, 0.048, -1, 0, 0.8);
    // Vending machine beside building
    drawProp(ctx, 'jihanki', 205, roadY, 0.075, 1, 0, 0);
    // Curving chevron on left curve
    drawProp(ctx, 'chevron', 270, roadY, 0.09, -1, 0, 0.9);

    // Right Highway Shoulder: VMS, Power Pylon, Phonebooth, Shrub
    drawProp(ctx, 'vms', 700, roadY, 0.065, 1, 0, 0.8);
    drawProp(ctx, 'phonebooth', 795, roadY, 0.08, 1, 0, 0);
    drawProp(ctx, 'shrub', 845, roadY, 0.12, 1, 0, 0);
    drawProp(ctx, 'pylon', 900, roadY, 0.042, 1, 0, 0);
  </script>
</body>
</html>`;

const combinedHtmlPath = path.join(outDir, 'scratch', 'combined_preview.html');
fs.writeFileSync(combinedHtmlPath, combinedHtml);
const combinedPngPath = path.join(outDir, 'asset_showcase_all.png');
const combinedUrl = 'file:///' + combinedHtmlPath.replace(/\\/g, '/');

console.log('Rendering asset_showcase_all.png...');
execSync(`"${chromePath}" --headless=new --disable-gpu --window-size=960,540 --screenshot="${combinedPngPath}" "${combinedUrl}"`);

console.log('All asset preview PNGs successfully generated!');
