import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'audit-out');
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const args = new Set(process.argv.slice(2));
const IS_BASELINE = args.has('--baseline');
const SKIP_SWEEP = args.has('--skip-sweep');
const FULL_SONG = args.has('--full-song');
const DRAW_DIST_ARG = process.argv.find((a) => a.startsWith('--drawDistance='));
const OVERRIDE_DRAW_DIST = DRAW_DIST_ARG ? Number(DRAW_DIST_ARG.split('=')[1]) : null;
const BENCH_SEC_ARG = process.argv.find((a) => a.startsWith('--benchSec='));
const BENCH_SEC = BENCH_SEC_ARG ? Math.max(3, Number(BENCH_SEC_ARG.split('=')[1])) : 6;

fs.mkdirSync(OUT_DIR, { recursive: true });

function saveDataUrlPng(dataUrl, outFile) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
}

async function launchChrome() {
  const userDataDir = path.join(os.tmpdir(), 'mayonaka-audit-chrome-profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,720',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    'about:blank',
  ];

  const proc = spawn(CHROME_PATH, chromeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => {
      reject(new Error(`Chrome DevTools WS timeout. stderr:\n${stderr}`));
    }, 15000);

    proc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      stderr += s;
      const m = s.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited prematurely (${code}). stderr:\n${stderr}`));
    });
  });

  return { proc, wsUrl };
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evalJs(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const text =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        JSON.stringify(res.exceptionDetails);
      throw new Error(`Browser JS exception: ${text}`);
    }
    return res.result?.value;
  }
}

async function connectCdpTarget(browserWsUrl) {
  const browserWs = new WebSocket(browserWsUrl);
  await new Promise((resolve, reject) => {
    browserWs.addEventListener('open', resolve);
    browserWs.addEventListener('error', reject);
  });
  const browserCdp = new CdpClient(browserWs);
  const { targetInfos } = await browserCdp.send('Target.getTargets');
  let pageTarget = targetInfos.find((t) => t.type === 'page');
  if (!pageTarget) {
    const created = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
    pageTarget = { targetId: created.targetId };
  }
  const parsed = new URL(browserWsUrl);
  const pageWsUrl = `ws://${parsed.host}/devtools/page/${pageTarget.targetId}`;
  const pageWs = new WebSocket(pageWsUrl);
  await new Promise((resolve, reject) => {
    pageWs.addEventListener('open', resolve);
    pageWs.addEventListener('error', reject);
  });
  const pageCdp = new CdpClient(pageWs);
  await pageCdp.send('Page.enable');
  await pageCdp.send('Runtime.enable');
  return {
    pageCdp,
    close: () => {
      try { pageWs.close(); } catch {}
      try { browserWs.close(); } catch {}
    },
  };
}

async function waitForPageReady(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await cdp.evalJs(`
    new Promise((resolve, reject) => {
      const start = performance.now();
      const check = () => {
        if (window.__MAYONAKA_DIAG__ && window.__MAYONAKA_DIAG__.game) {
          resolve(true);
          return;
        }
        if (performance.now() - start > 25000) {
          reject(new Error('Timed out waiting for __MAYONAKA_DIAG__'));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })
  `);
}

async function runPropDistanceSweep(cdp, baseUrl) {
  const sweepUrl = `${baseUrl}/?nocrt&nohud`;
  await waitForPageReady(cdp, sweepUrl);

  const sweepResult = await cdp.evalJs(`(async () => {
    const propsMod = await import('/src/road/RoadsideProps.ts');
    const paletteMod = await import('/src/road/palette.ts');
    let registryMod = null;
    try {
      registryMod = await import('/src/road/PropRegistry.ts');
    } catch {
      registryMod = null;
    }

    const kinds = registryMod?.ALL_PROP_KINDS ?? [
      'palm','street-tree','pine','lamp','billboard','building','jihanki','phonebooth',
      'gantry','vms','chevron','pylon','shrub','sign','overpass','suspension-tower',
      'kiosk','bench','bus-stop','canopy','torii','toro'
    ];

    const standardPpus = [0.0025, 0.0035, 0.0045, 0.006, 0.008, 0.0105, 0.0135, 0.017, 0.021, 0.026, 0.032, 0.040];
    const overheadPpus = [0.002, 0.0028, 0.0036, 0.0045, 0.0056, 0.0068, 0.008, 0.0094, 0.0108, 0.0122, 0.0136, 0.015];
    const cellW = 200;
    const cellH = 200;
    const cols = 6;
    const rows = Math.ceil(standardPpus.length / cols);

    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = cellW;
    cellCanvas.height = cellH;
    const cellCtx = cellCanvas.getContext('2d', { willReadFrequently: true });
    cellCtx.imageSmoothingEnabled = false;

    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = cols * cellW;
    stripCanvas.height = rows * cellH;
    const stripCtx = stripCanvas.getContext('2d');
    stripCtx.imageSmoothingEnabled = false;

    propsMod.setPropTheme(paletteMod.PALETTE_NIGHT_FUNK.scenery);
    propsMod.setPropAtmosphere('#0a102b', '#070b20', '#056e68');

    const reports = [];
    const filmstrips = {};

    for (const kind of kinds) {
      if (kind === 'tree') continue;
      const ppus = (kind === 'gantry' || kind === 'overpass' || kind === 'suspension-tower') ? overheadPpus : standardPpus;
      stripCtx.fillStyle = '#090b16';
      stripCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);

      const samples = [];
      for (let i = 0; i < ppus.length; i++) {
        const ppu = ppus[i];
        const fogFactor = Math.max(0, Math.min(0.85, (0.014 - ppu) / 0.014 * 0.85));
        cellCtx.fillStyle = '#090b16';
        cellCtx.fillRect(0, 0, cellW, cellH);

        const groundY = cellH - 22;
        cellCtx.fillStyle = '#182038';
        cellCtx.fillRect(0, groundY, cellW, 22);

        propsMod.drawProp(cellCtx, kind, cellW * 0.5, groundY, ppu, -1, 0, 0.5, 0, Infinity, fogFactor);

        const img = cellCtx.getImageData(0, 0, cellW, groundY).data;
        let litPixels = 0;
        let minY = groundY;
        let maxY = -1;
        for (let y = 0; y < groundY; y++) {
          for (let x = 0; x < cellW; x++) {
            const idx = (y * cellW + x) * 4;
            const dr = Math.abs(img[idx] - 9);
            const dg = Math.abs(img[idx + 1] - 11);
            const db = Math.abs(img[idx + 2] - 22);
            if (dr + dg + db > 6) {
              litPixels++;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        const heightPx = maxY >= minY ? maxY - minY + 1 : 0;
        const groundGapPx = maxY >= 0 ? (groundY - 1 - maxY) : -1;
        samples.push({ ppu, litPixels, heightPx, groundGapPx });

        const gx = (i % cols) * cellW;
        const gy = Math.floor(i / cols) * cellH;
        stripCtx.drawImage(cellCanvas, gx, gy);
        stripCtx.strokeStyle = '#242b47';
        stripCtx.strokeRect(gx + 0.5, gy + 0.5, cellW - 1, cellH - 1);
        stripCtx.fillStyle = '#80f6ff';
        stripCtx.font = '10px monospace';
        stripCtx.fillText(kind + ' ppu=' + ppu.toFixed(4), gx + 4, gy + 12);
      }

      // Check continuity: no abrupt zero->huge drops, no floating base when visible
      let maxDropRatio = 0;
      let maxJumpRatio = 0;
      let floatingCount = 0;
      for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1];
        const cur = samples[i];
        if (prev.heightPx > 4 && cur.heightPx < prev.heightPx * 0.65) {
          maxDropRatio = Math.max(maxDropRatio, (prev.heightPx - cur.heightPx) / prev.heightPx);
        }
        if (prev.litPixels >= 12 && cur.litPixels > prev.litPixels * 2.8) {
          maxJumpRatio = Math.max(maxJumpRatio, cur.litPixels / prev.litPixels);
        }
      }
      const isOverhead = kind === 'gantry' || kind === 'overpass' || kind === 'suspension-tower';
      for (const s of samples) {
        if (!isOverhead && s.litPixels > 10 && s.groundGapPx > 3) {
          floatingCount++;
        }
      }

      const ok =
        maxDropRatio === 0 &&
        maxJumpRatio === 0 &&
        floatingCount === 0 &&
        samples[samples.length - 1].litPixels > 0;
      reports.push({ kind, ok, maxDropRatio, maxJumpRatio: Math.round(maxJumpRatio * 100) / 100, floatingCount, samples });
      filmstrips[kind] = stripCanvas.toDataURL('image/png');
    }
    return { reports, filmstrips };
  })()`);

  for (const [kind, dataUrl] of Object.entries(sweepResult.filmstrips)) {
    saveDataUrlPng(dataUrl, path.join(OUT_DIR, `prop_sweep_${kind}.png`));
  }
  return sweepResult.reports;
}

async function captureScenarios(cdp, baseUrl) {
  const diagUrl = `${baseUrl}/?autostart&nohud&nocrt`;
  await waitForPageReady(cdp, diagUrl);
  if (OVERRIDE_DRAW_DIST) {
    await cdp.evalJs(`window.__MAYONAKA_DIAG__.game && (import('/src/config/tuning.ts').then(m => m.tuning.drawDistance = ${OVERRIDE_DRAW_DIST}))`);
  }

  // Helper injected into page to seek fractional bars accurately and render game canvas into a filmstrip
  await cdp.evalJs(`
    window.__AUDIT_SEEK__ = function(barFloat) {
      const g = window.__MAYONAKA_DIAG__.game;
      const d = window.__MAYONAKA_DIAG__;
      d.seekToBar(barFloat);
      g.car.x = 0;
      g.car.prevX = 0;
    };
    window.__AUDIT_CAPTURE__ = {
      frames: [],
      reset() { this.frames = []; },
      grab(label) {
        const c = document.querySelector('canvas');
        const tmp = document.createElement('canvas');
        tmp.width = 640;
        tmp.height = 360;
        const tctx = tmp.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(c, 0, 0, 640, 360);
        const img = tctx.getImageData(0, 0, 640, 360);
        this.frames.push({ label, canvas: tmp, data: img.data });
      },
      buildFilmstrip(cols = 2) {
        const n = this.frames.length;
        const rows = Math.ceil(n / cols);
        const out = document.createElement('canvas');
        out.width = cols * 640;
        out.height = rows * 360;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#050712';
        ctx.fillRect(0, 0, out.width, out.height);
        for (let i = 0; i < n; i++) {
          const f = this.frames[i];
          const x = (i % cols) * 640;
          const y = Math.floor(i / cols) * 360;
          ctx.drawImage(f.canvas, x, y);
          ctx.fillStyle = 'rgba(0,0,0,0.72)';
          ctx.fillRect(x + 8, y + 8, 360, 22);
          ctx.fillStyle = '#00f5d4';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(f.label, x + 14, y + 23);
        }
        return out.toDataURL('image/png');
      }
    };
  `);

  const scenarioResults = {};

  // Scenario 1 & 2 & 3: City Night Shadows (curved road + bridge + lamps + lane stripes)
  await cdp.evalJs(`window.__MAYONAKA_DIAG__.loadTestTrack('city_night')`);
  await new Promise((r) => setTimeout(r, 800));
  const cityInfo = await cdp.evalJs(`(() => {
    const g = window.__MAYONAKA_DIAG__.game;
    g.setPaused(true);
    const track = g.track;
    const bp = track.blueprint;
    const bridgeChunk = bp?.chunks?.find(c => c.env === 'bridge');
    const curveChunk = bp?.chunks?.find(c => c.env === 'standard' && c.maneuvers.some(m => Math.abs(m.curve) >= 2.0));
    const pylonRun = bp?.powerLineRuns?.[0] ?? null;
    return {
      totalBars: g.totalBars,
      bridgeStart: bridgeChunk ? bridgeChunk.startBar : null,
      bridgeBars: bridgeChunk ? bridgeChunk.bars : null,
      curveStart: curveChunk ? curveChunk.startBar : 4,
      pylonStart: pylonRun ? pylonRun.startBar : null,
    };
  })()`);

  // Scenario 2: Bridge checks on city_night + barbarian
  if (cityInfo.bridgeStart !== null) {
    const bridgeCheck = await cdp.evalJs(`(() => {
      const g = window.__MAYONAKA_DIAG__.game;
      const d = window.__MAYONAKA_DIAG__;
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      window.__AUDIT_CAPTURE__.reset();
      const bars = [
        Math.max(0, ${cityInfo.bridgeStart} - 0.8),
        ${cityInfo.bridgeStart} + 0.5,
        ${cityInfo.bridgeStart} + ${cityInfo.bridgeBars} * 0.45,
        ${cityInfo.bridgeStart} + ${cityInfo.bridgeBars} - 0.6,
      ];
      const symMetrics = [];
      let bridgeSegFrames = 0;
      for (const b of bars) {
        window.__AUDIT_SEEK__(b);
        g.car.x = 0;
        g.car.prevX = 0;
        const headEnv = g.track.segments[Math.floor(g.position / g.track.segmentLength) & (g.track.ringMask ?? 0)]?.env ?? 'standard';
        if (headEnv === 'bridge') bridgeSegFrames++;
        g.render(ctx, 1, 60);
        window.__AUDIT_CAPTURE__.grab('city_night bridge bar=' + b.toFixed(1));
        const f = window.__AUDIT_CAPTURE__.frames[window.__AUDIT_CAPTURE__.frames.length - 1];
        // Compute curve-aware horizontal road midpoint at bridge height [y=220..290]
        let sumRoadX = 0;
        let roadSamples = 0;
        for (let y = 220; y < 290; y += 4) {
          let rowMin = 640;
          let rowMax = -1;
          for (let x = 20; x < 620; x++) {
            const idx = (y * 640 + x) * 4;
            const r = f.data[idx], gr = f.data[idx + 1], bl = f.data[idx + 2];
            const isCyanOrAmber = (gr > 170 && bl > 160 && r < 120) || (r > 180 && gr > 110 && bl < 100);
            if (isCyanOrAmber) {
              if (x < rowMin) rowMin = x;
              if (x > rowMax) rowMax = x;
            }
          }
          if (rowMax > rowMin + 40) {
            sumRoadX += (rowMin + rowMax) * 0.5;
            roadSamples++;
          }
        }
        const midRoadX = Math.max(180, Math.min(460, Math.round(roadSamples > 0 ? sumRoadX / roadSamples : 320)));
        const leftStart = Math.max(10, midRoadX - 280);
        const leftEnd = midRoadX - 10;
        const rightStart = midRoadX + 10;
        const rightEnd = Math.min(630, midRoadX + 280);
        // Check left/right symmetry of bright bridge lights around dynamic road midpoint
        let leftBright = 0;
        let rightBright = 0;
        for (let y = 185; y < 310; y++) {
          for (let x = leftStart; x < leftEnd; x++) {
            const idx = (y * 640 + x) * 4;
            const r = f.data[idx], gr = f.data[idx + 1], bl = f.data[idx + 2];
            const isCyanOrAmber = (gr > 170 && bl > 160 && r < 120) || (r > 180 && gr > 110 && bl < 100);
            if (isCyanOrAmber) leftBright++;
          }
          for (let x = rightStart; x < rightEnd; x++) {
            const idx = (y * 640 + x) * 4;
            const r = f.data[idx], gr = f.data[idx + 1], bl = f.data[idx + 2];
            const isCyanOrAmber = (gr > 170 && bl > 160 && r < 120) || (r > 180 && gr > 110 && bl < 100);
            if (isCyanOrAmber) rightBright++;
          }
        }
        symMetrics.push({ bar: b, env: headEnv, midRoadX, leftBright, rightBright });
      }
      return { bridgeSegFrames, filmstrip: window.__AUDIT_CAPTURE__.buildFilmstrip(2), symMetrics };
    })()`);
    saveDataUrlPng(bridgeCheck.filmstrip, path.join(OUT_DIR, `${IS_BASELINE ? 'baseline_' : ''}scenario_bridge.png`));
    scenarioResults.bridge = bridgeCheck.symMetrics;
    scenarioResults.bridgeSegFrames = bridgeCheck.bridgeSegFrames;
  }

  // Scenario 3: Curved road & lane stripes
  const laneCheck = await cdp.evalJs(`(() => {
    const g = window.__MAYONAKA_DIAG__.game;
    const d = window.__MAYONAKA_DIAG__;
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    window.__AUDIT_CAPTURE__.reset();
    for (const offset of [0, 1.5, 3.0, 4.5]) {
      const b = ${cityInfo.curveStart} + offset;
      window.__AUDIT_SEEK__(b);
      g.car.x = 0;
      g.car.prevX = 0;
      g.render(ctx, 1, 60);
      window.__AUDIT_CAPTURE__.grab('city_night curve bar=' + b.toFixed(1));
    }
    return { filmstrip: window.__AUDIT_CAPTURE__.buildFilmstrip(2) };
  })()`);
  saveDataUrlPng(laneCheck.filmstrip, path.join(OUT_DIR, `${IS_BASELINE ? 'baseline_' : ''}scenario_lanes_props.png`));

  // Scenario 1: Pylon wires on Barbarian (has coastal/semiurban powerlines + curved bridge)
  await cdp.evalJs(`window.__MAYONAKA_DIAG__.loadTestTrack('barbarian')`);
  await new Promise((r) => setTimeout(r, 800));
  const pylonCheck = await cdp.evalJs(`(() => {
    const g = window.__MAYONAKA_DIAG__.game;
    const d = window.__MAYONAKA_DIAG__;
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    g.setPaused(true);
    const bp = g.track.blueprint;
    const run = bp?.powerLineRuns?.[0];
    const startBar = run ? Math.max(0, run.startBar - 0.6) : 2;
    window.__AUDIT_SEEK__(startBar);
    window.__AUDIT_CAPTURE__.reset();
    for (let step = 0; step < 6; step++) {
      g.setPaused(false);
      g.position += 800; // 4 segments per frame step
      g.prevPosition = g.position;
      g.lastInternalPosition = g.position;
      g.update(1 / 120);
      g.setPaused(true);
      g.render(ctx, 1, 60);
      window.__AUDIT_CAPTURE__.grab('barbarian pylon step=' + step + ' bar=' + g.roadBarIndex);
    }
    return { hasPylonRun: Boolean(run), filmstrip: window.__AUDIT_CAPTURE__.buildFilmstrip(3) };
  })()`);
  saveDataUrlPng(pylonCheck.filmstrip, path.join(OUT_DIR, `${IS_BASELINE ? 'baseline_' : ''}scenario_pylon_wires.png`));
  scenarioResults.pylon = { hasPylonRun: pylonCheck.hasPylonRun };

  // Scenario 4: Tunnel in Cant Stop Loving U
  await cdp.evalJs(`window.__MAYONAKA_DIAG__.loadTestTrack('cant_stop')`);
  await new Promise((r) => setTimeout(r, 900));
  const tunnelCheck = await cdp.evalJs(`(() => {
    const g = window.__MAYONAKA_DIAG__.game;
    const d = window.__MAYONAKA_DIAG__;
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    g.setPaused(true);
    const bp = g.track.blueprint;
    const span = bp?.tunnelSpans?.[0] ?? { startBar: 32, endBar: 38 };
    const bars = [
      Math.max(0, span.startBar - 1.2),
      span.startBar - 0.15,
      span.startBar + 0.5,
      span.startBar + (span.endBar - span.startBar) * 0.45,
      span.endBar - 1.2,
      span.endBar - 0.2,
    ];
    window.__AUDIT_CAPTURE__.reset();
    const deepSkyLeakChecks = [];
    let entranceInteriorCheck = null;
    for (let idx = 0; idx < bars.length; idx++) {
      const b = bars[idx];
      window.__AUDIT_SEEK__(b);
      g.car.x = 0;
      g.car.prevX = 0;
      const headEnv = g.track.segments[Math.floor(g.position / g.track.segmentLength) & (g.track.ringMask ?? 0)]?.env ?? 'standard';
      g.render(ctx, 1, 60);
      window.__AUDIT_CAPTURE__.grab('cant_stop tunnel bar=' + b.toFixed(2) + ' env=' + headEnv);
      const f = window.__AUDIT_CAPTURE__.frames[window.__AUDIT_CAPTURE__.frames.length - 1];
      if (idx === 1) {
        // Outside portal approach: central bore mouth [x=240..400, y=100..240] MUST show illuminated interior/exit, never solid #070510 black
        let visibleInteriorPixels = 0;
        for (let y = 100; y <= 240; y++) {
          for (let x = 240; x <= 400; x++) {
            const pIdx = (y * 640 + x) * 4;
            const sum = f.data[pIdx] + f.data[pIdx + 1] + f.data[pIdx + 2];
            if (sum > 45) visibleInteriorPixels++;
          }
        }
        entranceInteriorCheck = { bar: b, env: headEnv, visibleInteriorPixels };
      }
      if (idx === 2 || idx === 3) {
        // Deep inside tunnel: top sky corner (x=20,y=15) MUST be dark tunnel surround, never bright sky/sun!
        const pIdx = (15 * 640 + 20) * 4;
        const sumRgb = f.data[pIdx] + f.data[pIdx + 1] + f.data[pIdx + 2];
        deepSkyLeakChecks.push({ bar: b, env: headEnv, cornerRgbSum: sumRgb });
      }
    }
    return { span, entranceInteriorCheck, deepSkyLeakChecks, filmstrip: window.__AUDIT_CAPTURE__.buildFilmstrip(3) };
  })()`);
  saveDataUrlPng(tunnelCheck.filmstrip, path.join(OUT_DIR, `${IS_BASELINE ? 'baseline_' : ''}scenario_tunnel_cant_stop.png`));
  scenarioResults.tunnel = {
    span: tunnelCheck.span,
    entranceInteriorCheck: tunnelCheck.entranceInteriorCheck,
    deepSkyLeakChecks: tunnelCheck.deepSkyLeakChecks,
  };

  // Scenario 5: Final Fork (Attached Carriageways)
  const forkCheck = await cdp.evalJs(`(() => {
    const g = window.__MAYONAKA_DIAG__.game;
    const d = window.__MAYONAKA_DIAG__;
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    g.setPaused(true);
    d.triggerForkTest();
    const forkStart = g.getForkZoneStartZ();
    const span = Math.max(1, g.track.length - forkStart);
    const ts = [0.15, 0.42, 0.72, 0.90];
    const xs = [-0.6, 0.6, -0.5, 0.5];
    window.__AUDIT_CAPTURE__.reset();
    const forkChecks = [];
    for (let i = 0; i < ts.length; i++) {
      g.setPaused(false);
      g.position = forkStart + span * ts[i];
      g.prevPosition = g.position;
      g.lastInternalPosition = g.position;
      g.car.x = xs[i];
      g.car.prevX = xs[i];
      g.update(1 / 120);
      g.render(ctx, 1, 60);
      window.__AUDIT_CAPTURE__.grab('fork t=' + ts[i].toFixed(2) + ' choice=' + g.forkChoice);
      // Sample center road pixels at y=280, x=320 to check asphalt vs green grass
      const f = window.__AUDIT_CAPTURE__.frames[window.__AUDIT_CAPTURE__.frames.length - 1];
      const cIdx = (280 * 640 + 320) * 4;
      const choiceAfterMove = g.forkChoice;
      const carXAfterMove = g.car.x;
      g.car.x = 0;
      g.car.prevX = 0;
      g.update(1 / 120);
      const off = g.car.isOffRoad;
      g.car.x = carXAfterMove;
      g.car.prevX = carXAfterMove;
      g.update(1 / 120);
      g.setPaused(true);
      forkChecks.push({
        t: ts[i],
        carX: carXAfterMove,
        choice: choiceAfterMove,
        isOffRoadAtZero: off,
        centerPixel: [f.data[cIdx], f.data[cIdx + 1], f.data[cIdx + 2]],
      });
    }
    return { forkChecks, filmstrip: window.__AUDIT_CAPTURE__.buildFilmstrip(2) };
  })()`);
  saveDataUrlPng(forkCheck.filmstrip, path.join(OUT_DIR, `${IS_BASELINE ? 'baseline_' : ''}scenario_fork.png`));
  scenarioResults.fork = forkCheck.forkChecks;

  return scenarioResults;
}

async function run60FpsBenchmarks(cdp, baseUrl) {
  const tracks = FULL_SONG ? ['city_night', 'barbarian'] : ['city_night', 'barbarian', 'cant_stop'];
  const results = [];

  for (const trackQuery of tracks) {
    const url = `${baseUrl}/?autostart&autopilot&debug&track=${encodeURIComponent(trackQuery)}`;
    await waitForPageReady(cdp, url);
    if (OVERRIDE_DRAW_DIST) {
      await cdp.evalJs(`import('/src/config/tuning.ts').then(m => { m.tuning.drawDistance = ${OVERRIDE_DRAW_DIST}; })`);
    }
    // Wait for track load & warmup
    await new Promise((r) => setTimeout(r, 1500));

    if (FULL_SONG) {
      await cdp.evalJs(`(() => {
        const g = window.__MAYONAKA_DIAG__.game;
        window.__MAYONAKA_DIAG__.seekToBar(0);
        g.setPaused(false);
        g.hasStartedDriving = true;
        g.car.speed = 11000;
        g.car.gearbox.gear = 6;
        window.__MAYONAKA_DIAG__.resetBenchmark();
      })()`);

      const startWall = Date.now();
      const maxWaitMs = 260000;
      let prevStage = -1;
      while (Date.now() - startWall < maxWaitMs) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await cdp.evalJs(`(() => {
          const g = window.__MAYONAKA_DIAG__.game;
          return {
            stage: g.runManager.stageNumber,
            bar: g.roadBarIndex,
            totalBars: g.totalBars,
            forkActive: g.forkActive,
          };
        })()`);
        if (prevStage === -1) prevStage = st.stage;
        if (st.stage > prevStage || st.bar >= st.totalBars - 1.5) {
          break;
        }
      }
      const report = await cdp.evalJs(`window.__MAYONAKA_DIAG__.getFullReport()`);
      results.push({
        query: trackQuery,
        mode: 'full-song',
        title: report.trackTitle,
        frames: report.session.frames,
        avgFps: report.session.avgFps,
        minFps: report.session.minFps,
        avgFrameMs: report.session.avgFrameMs,
        p95FrameMs: report.session.p95FrameMs,
        maxFrameMs: report.session.maxFrameMs,
        pct60Fps: report.session.pct60Fps,
        compositorGapMs: report.latestFrame.compositorGapMs,
        renderTimeMs: report.latestFrame.renderTimeMs,
        drawnSegments: report.latestFrame.drawnSegments,
        drawnProps: report.latestFrame.drawnProps,
        worstBars: (report.worstBars || []).slice(0, 5),
      });
    } else {
      // Sample 3 representative sections (intro, bridge/curve, drop/peak) instead of intro-only
      const probeBars = await cdp.evalJs(`(() => {
        const bp = window.__MAYONAKA_DIAG__.game.track.blueprint;
        const total = Math.max(16, bp?.totalBars ?? 48);
        const bridge = bp?.chunks?.find((c) => c.env === 'bridge');
        const dropSec = bp?.sections?.find((s) => s.role === 'drop');
        return [
          0,
          bridge ? Math.max(0, bridge.startBar - 0.5) : Math.floor(total * 0.28),
          dropSec ? dropSec.startBar : Math.floor(total * 0.55),
        ];
      })()`);

      const perWinMs = Math.max(2500, Math.round((BENCH_SEC * 1000) / probeBars.length));
      let started = false;
      for (const b of probeBars) {
        await cdp.evalJs(`(() => {
          const g = window.__MAYONAKA_DIAG__.game;
          window.__MAYONAKA_DIAG__.seekToBar(${b});
          g.setPaused(false);
          g.hasStartedDriving = true;
          g.car.speed = 11000;
          g.car.gearbox.gear = 6;
          ${!started ? 'window.__MAYONAKA_DIAG__.resetBenchmark();' : ''}
        })()`);
        started = true;
        await new Promise((r) => setTimeout(r, perWinMs));
      }

      const report = await cdp.evalJs(`window.__MAYONAKA_DIAG__.getFullReport()`);
      results.push({
        query: trackQuery,
        mode: 'multi-section',
        title: report.trackTitle,
        frames: report.session.frames,
        avgFps: report.session.avgFps,
        minFps: report.session.minFps,
        avgFrameMs: report.session.avgFrameMs,
        p95FrameMs: report.session.p95FrameMs,
        maxFrameMs: report.session.maxFrameMs,
        pct60Fps: report.session.pct60Fps,
        compositorGapMs: report.latestFrame.compositorGapMs,
        renderTimeMs: report.latestFrame.renderTimeMs,
        drawnSegments: report.latestFrame.drawnSegments,
        drawnProps: report.latestFrame.drawnProps,
      });
    }
  }
  return results;
}

function writeHtmlReport(data) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Mayonaka Cassette — Rendering Audit Report</title>
  <style>
    body { background: #0a0c16; color: #e2e8f0; font-family: ui-monospace, monospace; padding: 24px; }
    h1, h2 { color: #00f5d4; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; }
    th, td { border: 1px solid #242b47; padding: 8px 10px; text-align: left; font-size: 12px; }
    th { background: #14192e; color: #ffd166; }
    .ok { color: #06d6a0; font-weight: bold; }
    .fail { color: #ff2a6d; font-weight: bold; }
    img { max-width: 100%; border: 1px solid #242b47; margin: 8px 0 24px; image-rendering: pixelated; }
  </style>
</head>
<body>
  <h1>Mayonaka Cassette — Rendering Audit (${data.timestamp})</h1>
  <p>Mode: ${data.baseline ? 'BASELINE' : 'FULL AUDIT'} | drawDistance: ${data.drawDistance ?? 'default'}</p>

  <h2>60 FPS Live Benchmarks</h2>
  <table>
    <tr><th>Track</th><th>Avg FPS</th><th>Min FPS</th><th>Avg ms</th><th>P95 ms</th><th>%60FPS</th><th>Segs</th><th>Props</th></tr>
    ${data.fps.map((r) => `<tr><td>${r.query} (${r.title})</td><td class="${r.avgFps >= 59.5 ? 'ok' : 'fail'}">${r.avgFps}</td><td>${r.minFps}</td><td>${r.avgFrameMs}</td><td class="${r.p95FrameMs <= 17.2 ? 'ok' : 'fail'}">${r.p95FrameMs}</td><td class="${r.pct60Fps >= 98 ? 'ok' : 'fail'}">${r.pct60Fps}%</td><td>${r.drawnSegments}</td><td>${r.drawnProps}</td></tr>`).join('')}
  </table>

  <h2>Live Visual Scenarios</h2>
  <pre>${JSON.stringify(data.scenarios, null, 2)}</pre>
  ${['scenario_bridge.png', 'scenario_lanes_props.png', 'scenario_pylon_wires.png', 'scenario_tunnel_cant_stop.png', 'scenario_fork.png']
    .filter((f) => fs.existsSync(path.join(OUT_DIR, f)))
    .map((f) => `<h3>${f}</h3><img src="${f}" />`).join('')}

  ${data.propSweep ? `
  <h2>Prop Distance-Sweep Pixel Continuity</h2>
  <table>
    <tr><th>Prop</th><th>Status</th><th>Max Drop</th><th>Max Jump</th><th>Floating</th></tr>
    ${data.propSweep.map((p) => `<tr><td>${p.kind}</td><td class="${p.ok ? 'ok' : 'fail'}">${p.ok ? 'PASS' : 'FAIL'}</td><td>${p.maxDropRatio}</td><td>${p.maxJumpRatio}x</td><td>${p.floatingCount}</td></tr>`).join('')}
  </table>` : ''}
</body>
</html>`;
  fs.writeFileSync(path.join(OUT_DIR, IS_BASELINE ? 'baseline_report.html' : 'render_audit_report.html'), html);
}

async function main() {
  const viteServer = await createServer({
    root: ROOT_DIR,
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    logLevel: 'silent',
  });
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Vite dev server listening at ${baseUrl}`);

  const { proc: chromeProc, wsUrl } = await launchChrome();
  let cdpConn = null;
  try {
    cdpConn = await connectCdpTarget(wsUrl);
    const { pageCdp } = cdpConn;

    const propSweep = SKIP_SWEEP || IS_BASELINE ? null : await runPropDistanceSweep(pageCdp, baseUrl);
    const scenarios = await captureScenarios(pageCdp, baseUrl);
    const fps = await run60FpsBenchmarks(pageCdp, baseUrl);

    const summary = {
      timestamp: new Date().toISOString(),
      baseline: IS_BASELINE,
      drawDistance: OVERRIDE_DRAW_DIST,
      fps,
      scenarios,
      propSweep: propSweep?.map(({ samples: _s, ...rest }) => rest) ?? null,
    };

    fs.writeFileSync(
      path.join(OUT_DIR, IS_BASELINE ? 'baseline_report.json' : 'render_audit_report.json'),
      JSON.stringify(summary, null, 2),
    );
    writeHtmlReport(summary);

    console.log('\n=== FPS BENCHMARKS ===');
    for (const r of fps) {
      console.log(`${r.query}: avgFps=${r.avgFps}, p95=${r.p95FrameMs}ms, pct60=${r.pct60Fps}%, segs=${r.drawnSegments}, props=${r.drawnProps}`);
    }
    console.log('\n=== SCENARIOS ===');
    console.log(JSON.stringify(scenarios, null, 2));

    if (!IS_BASELINE) {
      const failedProps = (propSweep || []).filter((p) => !p.ok);
      const maxP95 = FULL_SONG ? 16.7 : 17.2;
      const minAvgFps = FULL_SONG ? 59.0 : 59.5;
      const failedFps = fps.filter(
        (r) => r.avgFps < minAvgFps || r.p95FrameMs > maxP95 || r.pct60Fps < 98,
      );
      const failedFork = (scenarios.fork || []).filter((f) => {
        if (f.isOffRoadAtZero) return true;
        if (f.t < 0.8) {
          const [r, g, b] = f.centerPixel || [0, 0, 0];
          const looksLikeGrass = g > r + 40 && g > b + 20;
          const isBlankBlack = r + g + b < 15;
          if (looksLikeGrass || isBlankBlack) return true;
        }
        return false;
      });
      const failedBridge = (scenarios.bridge || []).filter((b) => {
        const hi = Math.max(b.leftBright, b.rightBright);
        const lo = Math.min(b.leftBright, b.rightBright);
        return hi >= 100 && lo / hi < 0.7;
      });
      const missingBridge = (scenarios.bridgeSegFrames ?? 0) === 0;
      const failedTunnelSky = (scenarios.tunnel?.deepSkyLeakChecks || []).filter(
        (t) => t.env !== 'tunnel' || t.cornerRgbSum > 110,
      );
      const entranceCheck = scenarios.tunnel?.entranceInteriorCheck;
      const failedTunnelMouth =
        !entranceCheck || entranceCheck.visibleInteriorPixels < 400 ? 1 : 0;

      if (
        failedProps.length ||
        failedFps.length ||
        failedFork.length ||
        failedBridge.length ||
        missingBridge ||
        failedTunnelSky.length ||
        failedTunnelMouth
      ) {
        console.error('\nAUDIT FAILED:', {
          failedProps: failedProps.map((p) => p.kind),
          failedFps: failedFps.map((f) => f.query),
          failedFork: failedFork.length,
          failedBridge: failedBridge.length,
          missingBridge,
          failedTunnelSky: failedTunnelSky.length,
          failedTunnelMouth,
        });
        process.exitCode = 1;
      } else {
        console.log('\nALL RENDERING AUDIT CHECKS PASSED!');
      }
    }
  } finally {
    if (cdpConn) cdpConn.close();
    try { chromeProc.kill('SIGKILL'); } catch {}
    await viteServer.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
