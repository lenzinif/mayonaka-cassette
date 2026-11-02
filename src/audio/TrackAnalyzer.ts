import {
  analyzePcm,
  type AnalysisMetadata,
  type AnalysisResult,
  type AnalysisWorkerRequest,
  type AnalysisWorkerResponse,
} from './analysis.worker';
import { parseTitleArtistFromFilename, type BeatMap } from './BeatMap';

/** Target mono sample rate for offline beat & section analysis (docs/DESIGN.md §2.3). */
export const ANALYSIS_SAMPLE_RATE = 22050;

export interface AnalyzeTrackOptions {
  filename?: string;
  title?: string;
  artist?: string;
  contentHash?: string;
  includeDebugEnvelopes?: boolean;
}

export interface DecodedTrackAudio {
  /** Full-quality decoded AudioBuffer for playback. */
  audioBuffer: AudioBuffer;
  /** 22 050 Hz mono PCM ready to transfer to the analysis worker. */
  monoPcm: Float32Array;
  sampleRate: number;
  durationSec: number;
}

/**
 * Computes `sha256:<hex>` content hash of raw file bytes via Web Crypto API.
 */
export async function hashAudioBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    hex += view[i]!.toString(16).padStart(2, '0');
  }
  return `sha256:${hex}`;
}

/**
 * Decodes compressed audio bytes on the main thread and downmixes/resamples to
 * 22 050 Hz mono `Float32Array` via `OfflineAudioContext` (AGENTS.md §4.5, §4.7).
 */
export async function decodeAudioForAnalysis(bytes: ArrayBuffer): Promise<DecodedTrackAudio> {
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  // Use a 1-frame OfflineAudioContext at native rate (44.1 kHz) to decode without opening hardware output
  const decoderCtx = new OfflineCtx(2, 1, 44100);
  const audioBuffer = await decoderCtx.decodeAudioData(bytes.slice(0));

  const targetFrames = Math.max(1, Math.ceil(audioBuffer.duration * ANALYSIS_SAMPLE_RATE));
  const resampleCtx = new OfflineCtx(1, targetFrames, ANALYSIS_SAMPLE_RATE);
  const src = resampleCtx.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(resampleCtx.destination);
  src.start(0);

  const rendered = await resampleCtx.startRendering();
  const channelData = rendered.getChannelData(0);
  const monoPcm = new Float32Array(channelData.length);
  monoPcm.set(channelData);

  return {
    audioBuffer,
    monoPcm,
    sampleRate: ANALYSIS_SAMPLE_RATE,
    durationSec: Math.round(audioBuffer.duration * 1000) / 1000,
  };
}

/**
 * Manages the dedicated Web Worker (`analysis.worker.ts`) that executes DSP off the main thread.
 */
export class TrackAnalyzer {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (res: AnalysisResult) => void; reject: (err: Error) => void }
  >();

  /**
   * Runs DSP analysis on pre-decoded mono PCM (transfers `pcm.buffer` to the worker when in browser).
   */
  async analyzeMonoPcm(
    pcm: Float32Array,
    sampleRate: number,
    meta: AnalysisMetadata,
  ): Promise<AnalysisResult> {
    if (typeof Worker === 'undefined') {
      return analyzePcm(pcm, sampleRate, meta);
    }

    const worker = this.getOrCreateWorker();
    const id = this.nextRequestId++;

    return new Promise<AnalysisResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const req: AnalysisWorkerRequest = { id, pcm, sampleRate, meta };
      worker.postMessage(req, [pcm.buffer]);
    });
  }

  /**
   * Full pipeline from raw file `ArrayBuffer` → SHA-256 hash → `OfflineAudioContext` decode
   * → worker DSP → `BeatMap` (+ optional debug envelopes for `BeatMapInspector`).
   */
  async analyzeAudioBytes(
    bytes: ArrayBuffer,
    options: AnalyzeTrackOptions = {},
  ): Promise<{ result: AnalysisResult; audioBuffer: AudioBuffer; contentHash: string }> {
    const parsed = parseTitleArtistFromFilename(options.filename ?? 'Track');
    const [contentHash, decoded] = await Promise.all([
      options.contentHash ? Promise.resolve(options.contentHash) : hashAudioBytes(bytes),
      decodeAudioForAnalysis(bytes),
    ]);

    const meta: AnalysisMetadata = {
      contentHash,
      title: options.title ?? parsed.title,
      artist: options.artist ?? parsed.artist,
      durationSec: decoded.durationSec,
      includeDebugEnvelopes: options.includeDebugEnvelopes,
    };

    const result = await this.analyzeMonoPcm(decoded.monoPcm, decoded.sampleRate, meta);
    return { result, audioBuffer: decoded.audioBuffer, contentHash };
  }

  /** Convenience wrapper for `File` or `Blob` objects. */
  async analyzeFile(
    file: File,
    options: Omit<AnalyzeTrackOptions, 'filename'> = {},
  ): Promise<{ beatMap: BeatMap; result: AnalysisResult; audioBuffer: AudioBuffer }> {
    const bytes = await file.arrayBuffer();
    const { result, audioBuffer } = await this.analyzeAudioBytes(bytes, {
      ...options,
      filename: file.name,
    });
    return { beatMap: result.beatMap, result, audioBuffer };
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const entry of this.pending.values()) {
      entry.reject(new Error('TrackAnalyzer disposed'));
    }
    this.pending.clear();
  }

  private getOrCreateWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e: MessageEvent<AnalysisWorkerResponse>) => {
        const msg = e.data;
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        if (msg.ok) {
          entry.resolve(msg.result);
        } else {
          entry.reject(new Error(msg.error));
        }
      };
      this.worker.onerror = (err) => {
        for (const entry of this.pending.values()) {
          entry.reject(new Error(err.message || 'Analysis worker error'));
        }
        this.pending.clear();
      };
    }
    return this.worker;
  }
}
