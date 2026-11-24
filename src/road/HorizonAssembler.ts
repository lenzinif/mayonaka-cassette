import { barDurationSec } from '@src/audio/BeatMap';
import { RUMBLE_LENGTH } from '@src/config/constants';
import {
  ENVIRONMENT_ARCHETYPES,
  type ArchetypePropRule,
  type EnvironmentArchetypeId,
} from './EnvironmentArchetypes';
import {
  createPoint,
  isOverheadProp,
  PROP_BAND_RANGES,
  sortSingleSegmentSprites,
  type PropKind,
  type RoadSegment,
  type RoadSprite,
  type SegmentEnvironment,
  type Track,
} from './RoadSegment';
import {
  createPowerLineStreamState,
  emitStreamedPowerLinesForSegment,
  resetPowerLineStreamState,
  type PowerLineStreamState,
} from './SceneryCorridors';
import {
  createBlueprintSample,
  sampleBlueprintAtBar,
  type BlueprintChunk,
  type BlueprintVignettePlacement,
  type SongBlueprint,
} from './SongBlueprint';
import type { SyncAnchorKind } from './SongRoadGenerator';
import { isConflictingVignetteProp, VIGNETTE_PREFABS } from './Vignettes';

export const STREAMING_RING_SIZE = 1024;
export const STREAMING_RING_MASK = STREAMING_RING_SIZE - 1;
export const HORIZON_LOOKAHEAD_MARGIN = 16;
export const SPRITE_POOL_SIZE = 8192;
const PORTAL_CLEAR_RADIUS = 6;

export interface MaterializedAnchor {
  kind: SyncAnchorKind;
  barIndex: number;
  absSeg: number;
  worldZ: number;
  rewardsSyncBonus: boolean;
  /** 0 = uncrossed, 1 = crossed (non-rewarded), 2 = crossed & SYNC bonus awarded. */
  crossedState: 0 | 1 | 2;
}

export interface StreamingTrack extends Track {
  readonly isStreaming: true;
  readonly ringMask: number;
  blueprint: SongBlueprint;
  nextBlueprint: SongBlueprint | null;
  /** Absolute segment index of the oldest valid segment in the ring. */
  tailAbsSeg: number;
  /** Absolute segment index of the next segment to materialize beyond the horizon. */
  headAbsSeg: number;
  /** Absolute segment index where the current stage started (0 after fresh load/rebase). */
  stageStartAbsSeg: number;
  /** Musical bar float recorded for each ring slot (`idx & ringMask`). */
  readonly slotBarFloat: Float64Array;
  /** Materialized worldZ where the stage Y-fork begins (`undefined` until `forkStartBar` reaches horizon). */
  forkZoneStartZ: number | undefined;
  /** Materialized worldZ of the stage finish line (`undefined` until `forkStartBar` reaches horizon). */
  stageFinishWorldZ: number | undefined;
  /** Materialized structural anchors (pre-allocated fixed table, active count = `materializedAnchorCount`). */
  readonly materializedAnchors: readonly MaterializedAnchor[];
  materializedAnchorCount: number;
  readonly totalBars: number;
  readonly barLengthWorld: number;
  readonly referenceSpeed: number;
}

/** Type guard checking if `track` is a `StreamingTrack` driven by `HorizonAssembler`. */
export function isStreamingTrack(track: Track): track is StreamingTrack {
  return track.isStreaming === true && 'blueprint' in track && 'slotBarFloat' in track;
}

interface PendingVignetteMember {
  active: boolean;
  targetAbsSeg: number;
  side: -1 | 1;
  kind: PropKind;
  offset: number;
  variant: number;
  scale: number;
}

const MAX_PENDING_VIGNETTE_MEMBERS = 48;
const MAX_MATERIALIZED_ANCHORS = 64;

const BRIDGE_STREAM_RULES: readonly ArchetypePropRule[] = [
  { kind: 'suspension-tower', placement: 'both', everyBeats: 16, band: 'A', offset: 0, rhythmic: true },
  { kind: 'lamp', placement: 'both', everyBeats: 2, band: 'A', offset: 1.18, rhythmic: true },
];

const VIADUCT_STREAM_RULES: readonly ArchetypePropRule[] = [
  { kind: 'lamp', placement: 'both', everyBeats: 2, band: 'A', offset: 1.18, rhythmic: true },
  { kind: 'gantry', placement: 'both', everyBeats: 16, band: 'A', offset: 0, rhythmic: true },
  { kind: 'vms', placement: 'right', everyBeats: 16, band: 'A', offset: 1.32, rhythmic: true },
  { kind: 'building', placement: 'both', everyBeats: 4, band: 'D', offset: 8.2, jitter: { lateral: 1.4, beats: 0.8 }, rhythmic: false, scaleJitter: 0.25 },
];

/** Fast deterministic 32-bit FNV-1a / Murmur-style hash for stateless per-beat prop dressing. */
function hashString32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function hash4(a: number, b: number, c: number, d: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h ^= Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h ^= Math.imul(d + 0x517cc1b7, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 16), 0x2c1b3c6d) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function hashUnit(a: number, b: number, c: number, d: number): number {
  return (hash4(a, b, c, d) >>> 0) / 4294967296;
}

/**
 * Zero-GC Runtime Horizon Assembler (Tranche 2 — Model D + Model A).
 *
 * Materializes `SongBlueprint` geometry, structures, power lines, vignettes, and roadside props
 * just beyond `drawDistance` into a fixed 1024-segment circular ring buffer (`STREAMING_RING_SIZE`),
 * dynamically adapting `dBar/dSeg` to keep tunnel entries/exits, impacts, and stage forks locked
 * to the `BeatClock` without repeating chunks or allocating per-frame objects.
 */
export class HorizonAssembler {
  readonly track: StreamingTrack;

  /** Pre-allocated circular `RoadSprite` pool (zero per-segment heap allocations). */
  readonly spritePool: RoadSprite[];
  private spritePoolCursor = 0;

  private readonly sampleScratch = createBlueprintSample();
  private readonly powerLineState: PowerLineStreamState = createPowerLineStreamState();
  private readonly nextPowerLineState: PowerLineStreamState = createPowerLineStreamState();
  private readonly pendingVignettes: PendingVignetteMember[];

  private seedHash = 0;
  private emitBarFloat = 0;
  private nextStageEmitBarFloat = 0;
  private emittingNextStage = false;
  private activeForkChoice: 'left' | 'right' = 'right';

  private prevCurve = 0;
  private prevWorldY = 0;
  private estSpeed = 9000;
  private currentStretchRatio = 1.0;

  private nextAnchorCursor = 0;
  private lastEmittedTunnelLightSlot = -1;
  private lastEmittedChevronBeat = -1;
  private chevronSeqIndex = 0;
  private lastZoneTransitionIdx = 0;
  private lastVignetteChunkChecked = -1;
  private lastVignetteIdxEmitted = -1;
  private lastNotifiedTrafficBar = -1;

  /** Optional hook invoked whenever a new integer bar materializes at the horizon (for `TrafficManager`). */
  onHorizonBarMaterialized?: (
    barIndex: number,
    anchorAbsSeg: number,
    blueprint: SongBlueprint,
    track: StreamingTrack,
  ) => void;

  constructor(blueprint: SongBlueprint, nextBlueprint: SongBlueprint | null = null) {
    this.spritePool = new Array<RoadSprite>(SPRITE_POOL_SIZE);
    for (let i = 0; i < SPRITE_POOL_SIZE; i++) {
      this.spritePool[i] = { kind: 'lamp', offset: 0, variant: 0, scale: 1 };
    }

    this.pendingVignettes = new Array<PendingVignetteMember>(MAX_PENDING_VIGNETTE_MEMBERS);
    for (let i = 0; i < MAX_PENDING_VIGNETTE_MEMBERS; i++) {
      this.pendingVignettes[i] = {
        active: false,
        targetAbsSeg: -1,
        side: 1,
        kind: 'lamp',
        offset: 0,
        variant: 0,
        scale: 1,
      };
    }

    const segments = new Array<RoadSegment>(STREAMING_RING_SIZE);
    for (let i = 0; i < STREAMING_RING_SIZE; i++) {
      segments[i] = {
        index: i,
        p1: createPoint(0, i * blueprint.segmentLength),
        p2: createPoint(0, (i + 1) * blueprint.segmentLength),
        curve: 0,
        stripe: Math.floor(i / RUMBLE_LENGTH) % 2 === 0 ? 0 : 1,
        sprites: [],
        fog: 1,
        env: 'standard',
      };
    }

    const materializedAnchors = new Array<MaterializedAnchor>(MAX_MATERIALIZED_ANCHORS);
    for (let i = 0; i < MAX_MATERIALIZED_ANCHORS; i++) {
      materializedAnchors[i] = {
        kind: 'fork',
        barIndex: 0,
        absSeg: 0,
        worldZ: 0,
        rewardsSyncBonus: false,
        crossedState: 0,
      };
    }

    this.track = {
      segments,
      segmentLength: blueprint.segmentLength,
      length: blueprint.totalBars * blueprint.barLengthWorld,
      isStreaming: true,
      ringMask: STREAMING_RING_MASK,
      blueprint,
      nextBlueprint,
      tailAbsSeg: 0,
      headAbsSeg: 0,
      stageStartAbsSeg: 0,
      slotBarFloat: new Float64Array(STREAMING_RING_SIZE),
      forkZoneStartZ: undefined,
      stageFinishWorldZ: undefined,
      materializedAnchors,
      materializedAnchorCount: 0,
      totalBars: blueprint.totalBars,
      barLengthWorld: blueprint.barLengthWorld,
      referenceSpeed: blueprint.referenceSpeed,
    };

    this.resetAtBar(0, 0, blueprint, nextBlueprint);
  }

  get stretchRatio(): number {
    return this.currentStretchRatio;
  }

  get currentEmitBar(): number {
    return this.emitBarFloat;
  }

  get estimatedSpeed(): number {
    return this.estSpeed;
  }

  setNextBlueprint(nextBlueprint: SongBlueprint | null): void {
    this.track.nextBlueprint = nextBlueprint;
  }

  /**
   * Resets the ring buffer and pre-fills `drawDistance + HORIZON_LOOKAHEAD_MARGIN` segments
   * deterministically at nominal 1:1 pace starting from `barIndex`.
   */
  resetAtBar(
    barIndex: number,
    startAbsSeg = 0,
    blueprint: SongBlueprint = this.track.blueprint,
    nextBlueprint: SongBlueprint | null = this.track.nextBlueprint,
    drawDistance = 200,
    forkChoice: 'left' | 'right' = 'right',
  ): void {
    const clampedBar = Math.max(0, Math.min(blueprint.totalBars - 0.01, barIndex));
    this.track.blueprint = blueprint;
    this.track.nextBlueprint = nextBlueprint;
    this.track.segmentLength = blueprint.segmentLength;
    this.track.stageStartAbsSeg = startAbsSeg;
    this.track.tailAbsSeg = startAbsSeg;
    this.track.headAbsSeg = startAbsSeg;
    this.track.materializedAnchorCount = 0;

    // Assign writable metadata fields via mutable view (blueprint changed)
    const mutableMeta = this.track as unknown as {
      totalBars: number;
      barLengthWorld: number;
      referenceSpeed: number;
    };
    mutableMeta.totalBars = blueprint.totalBars;
    mutableMeta.barLengthWorld = blueprint.barLengthWorld;
    mutableMeta.referenceSpeed = blueprint.referenceSpeed;

    this.seedHash = hashString32(`${blueprint.seed}:${blueprint.stageId}`);
    this.emitBarFloat = clampedBar;
    this.nextStageEmitBarFloat = 0;
    this.emittingNextStage = false;
    this.activeForkChoice = forkChoice;
    this.prevCurve = 0;
    this.prevWorldY = 0;
    this.estSpeed = blueprint.referenceSpeed;
    this.currentStretchRatio = 1.0;
    this.spritePoolCursor = 0;
    this.lastEmittedTunnelLightSlot = -1;
    this.lastEmittedChevronBeat = -1;
    this.chevronSeqIndex = 0;
    this.lastVignetteChunkChecked = -1;
    this.lastVignetteIdxEmitted = -1;
    this.lastNotifiedTrafficBar = Math.floor(clampedBar) - 1;

    // Advance anchor cursor to first anchor >= clampedBar
    this.nextAnchorCursor = 0;
    while (
      this.nextAnchorCursor < blueprint.syncAnchors.length &&
      blueprint.syncAnchors[this.nextAnchorCursor]!.barIndex < clampedBar - 1e-4
    ) {
      this.nextAnchorCursor++;
    }
    this.lastZoneTransitionIdx = 0;
    while (
      this.lastZoneTransitionIdx < blueprint.zoneTransitions.length &&
      blueprint.zoneTransitions[this.lastZoneTransitionIdx]!.barIndex < clampedBar
    ) {
      this.lastZoneTransitionIdx++;
    }

    for (let i = 0; i < MAX_PENDING_VIGNETTE_MEMBERS; i++) {
      this.pendingVignettes[i]!.active = false;
    }

    resetPowerLineStreamState(
      this.powerLineState,
      blueprint.powerLineRuns,
      clampedBar,
      blueprint.powerLineCrossing,
    );
    if (nextBlueprint) {
      resetPowerLineStreamState(
        this.nextPowerLineState,
        nextBlueprint.powerLineRuns,
        0,
        nextBlueprint.powerLineCrossing,
      );
    }

    // Establish nominal fork/length bounds (updated dynamically when forkStartBar materializes)
    const remainingBars = Math.max(0.5, blueprint.totalBars - clampedBar);
    const nominalFinishZ =
      startAbsSeg * blueprint.segmentLength +
      Math.round(remainingBars * blueprint.nominalSegmentsPerBar) * blueprint.segmentLength;

    if (clampedBar >= blueprint.forkStartBar) {
      const forkSpanBars = Math.max(1, blueprint.totalBars - blueprint.forkStartBar);
      const barsIntoFork = clampedBar - blueprint.forkStartBar;
      const forkStartSeg =
        startAbsSeg - Math.round(barsIntoFork * blueprint.nominalSegmentsPerBar);
      this.track.forkZoneStartZ = Math.max(0, forkStartSeg * blueprint.segmentLength);
      this.track.stageFinishWorldZ =
        this.track.forkZoneStartZ +
        Math.round(forkSpanBars * blueprint.nominalSegmentsPerBar) * blueprint.segmentLength;
      this.track.length = this.track.stageFinishWorldZ;
    } else {
      this.track.forkZoneStartZ = undefined;
      this.track.stageFinishWorldZ = undefined;
      this.track.length = nominalFinishZ;
    }

    // Seed initial pre-fill behind & ahead of camera so prevEnv at startAbsSeg is clean
    const prefillCount = Math.min(
      STREAMING_RING_SIZE - 16,
      Math.floor(drawDistance) + HORIZON_LOOKAHEAD_MARGIN,
    );
    const nominalStep = 1 / blueprint.nominalSegmentsPerBar;
    for (let i = 0; i < prefillCount; i++) {
      this.emitNextSegment(nominalStep);
    }
    this.finalizeCommittedPortals();
  }

  /**
   * Switches the active blueprint seamlessly when crossing `stageFinishWorldZ` without resetting
   * the visible ring buffer segments (zero pop-in stage transition!).
   */
  promoteNextStage(
    newBlueprint: SongBlueprint,
    newNextBlueprint: SongBlueprint | null,
    currentPosition: number,
    drawDistance: number,
  ): void {
    const camAbsSeg = Math.floor(currentPosition / newBlueprint.segmentLength);
    const finishAbsSeg =
      this.track.stageFinishWorldZ !== undefined
        ? Math.floor(this.track.stageFinishWorldZ / newBlueprint.segmentLength)
        : camAbsSeg;

    const alreadyStreamingNewStage =
      this.emittingNextStage &&
      ((this.activeForkChoice === 'right' &&
        this.track.nextBlueprint?.contentHash === newBlueprint.contentHash &&
        this.track.nextBlueprint?.stageId === newBlueprint.stageId) ||
        (this.activeForkChoice === 'left' &&
          this.track.blueprint.contentHash === newBlueprint.contentHash &&
          this.track.blueprint.stageId === newBlueprint.stageId));

    if (!alreadyStreamingNewStage) {
      // Fallback: clean reset at bar 0 at origin 0 so stage always begins cleanly near 0
      this.resetAtBar(0, 0, newBlueprint, newNextBlueprint, drawDistance, 'right');
      return;
    }

    // Re-base continuous stage segments down to absSeg = 0 so every stage starts cleanly near position 0
    // (preserves visible segments past finishAbsSeg with zero pop-in and keeps float64 coordinates bounded!)
    const segLen = newBlueprint.segmentLength;
    const shiftSegs = finishAbsSeg;
    const shiftZ = shiftSegs * segLen;
    if (shiftSegs > 0) {
      const oldTail = Math.max(this.track.tailAbsSeg, finishAbsSeg - 8);
      const oldHead = this.track.headAbsSeg;
      // Copy active slots in-place via temporary snapshot of indices (only ~220 slots on stage transition)
      const count = Math.max(0, oldHead - oldTail);
      const savedSlots = new Array<{
        newAbsSeg: number;
        curve: number;
        p1Y: number;
        p2Y: number;
        env: SegmentEnvironment;
        tunnelLight: boolean | undefined;
        barF: number;
        sprites: RoadSprite[];
      }>(count);
      for (let i = 0; i < count; i++) {
        const oldAbs = oldTail + i;
        const src = this.track.segments[oldAbs & STREAMING_RING_MASK]!;
        savedSlots[i] = {
          newAbsSeg: oldAbs - shiftSegs,
          curve: src.curve,
          p1Y: src.p1.worldY,
          p2Y: src.p2.worldY,
          env: src.env ?? 'standard',
          tunnelLight: src.tunnelLight,
          barF: this.track.slotBarFloat[oldAbs & STREAMING_RING_MASK] ?? 0,
          sprites: src.sprites.slice(),
        };
      }
      for (let i = 0; i < count; i++) {
        const item = savedSlots[i]!;
        const dstIdx = item.newAbsSeg;
        if (dstIdx < 0) continue;
        const dst = this.track.segments[dstIdx & STREAMING_RING_MASK]!;
        dst.index = dstIdx;
        dst.p1.worldX = 0;
        dst.p1.worldY = item.p1Y;
        dst.p1.worldZ = dstIdx * segLen;
        dst.p2.worldX = 0;
        dst.p2.worldY = item.p2Y;
        dst.p2.worldZ = (dstIdx + 1) * segLen;
        dst.curve = item.curve;
        dst.stripe = Math.floor(dstIdx / RUMBLE_LENGTH) % 2 === 0 ? 0 : 1;
        dst.env = item.env;
        dst.tunnelLight = item.tunnelLight;
        dst.sprites.length = 0;
        for (let k = 0; k < item.sprites.length; k++) {
          dst.sprites.push(item.sprites[k]!);
        }
        this.track.slotBarFloat[dstIdx & STREAMING_RING_MASK] = item.barF;
      }
      this.track.tailAbsSeg = Math.max(0, oldTail - shiftSegs);
      this.track.headAbsSeg = Math.max(0, oldHead - shiftSegs);
      for (let i = 0; i < MAX_PENDING_VIGNETTE_MEMBERS; i++) {
        const pv = this.pendingVignettes[i]!;
        if (pv.active) pv.targetAbsSeg -= shiftSegs;
      }
    }

    this.track.blueprint = newBlueprint;
    this.track.nextBlueprint = newNextBlueprint;
    this.track.stageStartAbsSeg = 0;
    this.track.materializedAnchorCount = 0;

    const mutableMeta = this.track as unknown as {
      totalBars: number;
      barLengthWorld: number;
      referenceSpeed: number;
    };
    mutableMeta.totalBars = newBlueprint.totalBars;
    mutableMeta.barLengthWorld = newBlueprint.barLengthWorld;
    mutableMeta.referenceSpeed = newBlueprint.referenceSpeed;

    this.seedHash = hashString32(`${newBlueprint.seed}:${newBlueprint.stageId}`);
    this.emitBarFloat = this.nextStageEmitBarFloat;
    this.nextStageEmitBarFloat = 0;
    this.emittingNextStage = false;

    // Copy nextPowerLineState into powerLineState
    this.powerLineState.activeRunIdx = this.nextPowerLineState.activeRunIdx;
    this.powerLineState.lastTowerSlot = this.nextPowerLineState.lastTowerSlot;
    this.powerLineState.crossingEmitted = this.nextPowerLineState.crossingEmitted;
    if (newNextBlueprint) {
      resetPowerLineStreamState(
        this.nextPowerLineState,
        newNextBlueprint.powerLineRuns,
        0,
        newNextBlueprint.powerLineCrossing,
      );
    }

    // Re-sync anchor/transition cursors to current `emitBarFloat`
    this.nextAnchorCursor = 0;
    while (
      this.nextAnchorCursor < newBlueprint.syncAnchors.length &&
      newBlueprint.syncAnchors[this.nextAnchorCursor]!.barIndex < this.emitBarFloat - 1e-4
    ) {
      this.nextAnchorCursor++;
    }
    this.lastZoneTransitionIdx = 0;
    while (
      this.lastZoneTransitionIdx < newBlueprint.zoneTransitions.length &&
      newBlueprint.zoneTransitions[this.lastZoneTransitionIdx]!.barIndex < this.emitBarFloat
    ) {
      this.lastZoneTransitionIdx++;
    }
    this.lastVignetteChunkChecked = -1;
    this.lastVignetteIdxEmitted = -1;
    this.lastNotifiedTrafficBar = Math.floor(this.emitBarFloat) - 1;

    this.track.forkZoneStartZ = undefined;
    this.track.stageFinishWorldZ = undefined;
    this.track.length = newBlueprint.totalBars * newBlueprint.barLengthWorld;

    // Ensure horizon stays filled from the rebased position
    const rebasedPos = Math.max(0, currentPosition - shiftZ);
    const rebasedCamAbsSeg = Math.floor(rebasedPos / segLen);
    const targetHead = rebasedCamAbsSeg + Math.floor(drawDistance) + HORIZON_LOOKAHEAD_MARGIN;
    const nominalStep = 1 / newBlueprint.nominalSegmentsPerBar;
    while (this.track.headAbsSeg < targetHead) {
      this.emitNextSegment(nominalStep);
    }
    this.finalizeCommittedPortals();
  }

  /**
   * Handles late fork branch switching (`left <-> right`) after `stageFinishWorldZ` has already
   * entered the horizon lookahead: re-emits segments past `stageFinishWorldZ` using the newly chosen blueprint.
   */
  updateForkChoice(choice: 'left' | 'right', currentPosition: number, drawDistance: number): void {
    if (this.activeForkChoice === choice) return;
    this.activeForkChoice = choice;
    if (!this.emittingNextStage || this.track.stageFinishWorldZ === undefined) return;

    const finishAbsSeg = Math.floor(this.track.stageFinishWorldZ / this.track.segmentLength);
    const camAbsSeg = Math.floor(currentPosition / this.track.segmentLength);
    if (finishAbsSeg <= camAbsSeg) return;

    // Roll head back to finishAbsSeg and re-emit the far-horizon post-finish lookahead
    const prevFinishSlot = this.track.segments[(finishAbsSeg - 1) & STREAMING_RING_MASK]!;
    this.prevCurve = prevFinishSlot.curve;
    this.prevWorldY = prevFinishSlot.p2.worldY;
    this.track.headAbsSeg = finishAbsSeg;
    this.nextStageEmitBarFloat = 0;
    const chosenBp = choice === 'right' && this.track.nextBlueprint ? this.track.nextBlueprint : this.track.blueprint;
    resetPowerLineStreamState(
      this.nextPowerLineState,
      chosenBp.powerLineRuns,
      0,
      chosenBp.powerLineCrossing,
    );

    const targetHead = camAbsSeg + Math.floor(drawDistance) + HORIZON_LOOKAHEAD_MARGIN;
    const nominalStep = 1 / chosenBp.nominalSegmentsPerBar;
    while (this.track.headAbsSeg < targetHead) {
      this.emitNextSegment(nominalStep);
    }
    this.finalizeCommittedPortals();
  }

  /**
   * Atomically rebases absolute segment indices and worldZ coordinates by subtracting `shiftSegs`
   * to prevent float64 precision drift on marathon sessions. Returns `shiftWorldZ` subtracted.
   */
  rebaseOrigin(camAbsSeg: number): number {
    // Keep rumble stripe parity (`2 * RUMBLE_LENGTH = 6`) AND ring alignment (`STREAMING_RING_SIZE`)!
    // LCM(1024, 6) = 3072 segments.
    const ALIGN = 3072;
    const shiftSegs = Math.floor((camAbsSeg - 16) / ALIGN) * ALIGN;
    if (shiftSegs <= 0) return 0;

    const segLen = this.track.segmentLength;
    const shiftZ = shiftSegs * segLen;

    for (let s = this.track.tailAbsSeg; s < this.track.headAbsSeg; s++) {
      const seg = this.track.segments[s & STREAMING_RING_MASK]!;
      seg.index -= shiftSegs;
      seg.p1.worldZ -= shiftZ;
      seg.p2.worldZ -= shiftZ;
    }

    this.track.tailAbsSeg -= shiftSegs;
    this.track.headAbsSeg -= shiftSegs;
    this.track.stageStartAbsSeg -= shiftSegs;
    this.track.length -= shiftZ;
    if (this.track.forkZoneStartZ !== undefined) {
      this.track.forkZoneStartZ -= shiftZ;
    }
    if (this.track.stageFinishWorldZ !== undefined) {
      this.track.stageFinishWorldZ -= shiftZ;
    }
    for (let i = 0; i < this.track.materializedAnchorCount; i++) {
      const a = this.track.materializedAnchors[i]!;
      a.absSeg -= shiftSegs;
      a.worldZ -= shiftZ;
    }
    for (let i = 0; i < MAX_PENDING_VIGNETTE_MEMBERS; i++) {
      const pv = this.pendingVignettes[i]!;
      if (pv.active) pv.targetAbsSeg -= shiftSegs;
    }

    return shiftZ;
  }

  /**
   * Advances horizon materialization so `headAbsSeg >= camAbsSeg + drawDistance + HORIZON_LOOKAHEAD_MARGIN`.
   * Zero-GC hot path invoked every fixed simulation step (`120 Hz`).
   */
  advance(
    position: number,
    audioBarFloat: number,
    worldBaseSpeed: number,
    drawDistance: number,
    dt: number,
  ): void {
    const bp = this.track.blueprint;
    const segLen = bp.segmentLength;
    const camAbsSeg = Math.floor(position / segLen);
    const clampedDraw = Math.min(STREAMING_RING_SIZE - HORIZON_LOOKAHEAD_MARGIN - 24, Math.floor(drawDistance));
    const targetHead = camAbsSeg + clampedDraw + HORIZON_LOOKAHEAD_MARGIN;

    // Smooth estimated cruising speed (only update when the car is moving so stops don't collapse estSpeed to 0)
    if (worldBaseSpeed > bp.referenceSpeed * 0.12) {
      const clampedSpd = Math.max(
        bp.referenceSpeed * 0.32,
        Math.min(bp.referenceSpeed * 1.25, worldBaseSpeed),
      );
      const alpha = 1 - Math.exp(-Math.max(0, dt) / 0.45);
      this.estSpeed += (clampedSpd - this.estSpeed) * alpha;
    }

    // Keep tailAbsSeg safely trailing behind the camera
    const minTail = Math.max(this.track.stageStartAbsSeg, camAbsSeg - 12);
    if (minTail > this.track.tailAbsSeg) {
      this.track.tailAbsSeg = minTail;
    }

    if (this.track.headAbsSeg >= targetHead) {
      return;
    }

    const barDur = barDurationSec(bp.beatMap);
    const nominalStep = 1 / bp.nominalSegmentsPerBar;
    const safeEstSpeed = Math.max(bp.referenceSpeed * 0.32, this.estSpeed);

    while (this.track.headAbsSeg < targetHead) {
      if (this.emittingNextStage) {
        const nextBp =
          this.activeForkChoice === 'right' && this.track.nextBlueprint
            ? this.track.nextBlueprint
            : bp;
        this.emitNextSegment(1 / nextBp.nominalSegmentsPerBar);
        continue;
      }

      const distAhead = Math.max(segLen, this.track.headAbsSeg * segLen - position);
      const timeToHeadSec = distAhead / safeEstSpeed;
      const targetBarAtHead = Math.max(0, audioBarFloat + timeToHeadSec / barDur);
      const phaseErr = targetBarAtHead - this.emitBarFloat;

      // Adaptive horizon stretch/compression:
      // - Near-cruise (|phaseErr| < 0.12): ~1.00 (1:1 faithful to blueprint)
      // - Lead (phaseErr < 0): stretch down to 0.48 (gentle extension, zero chunk repetition)
      // - Lag (phaseErr > 0): compress up to 1.65 (up to 2.50 during deep stop-and-go recovery)
      const maxCompress = phaseErr > 1.25 ? 2.5 : 1.65;
      let desiredFactor = Math.max(0.48, Math.min(maxCompress, 1 + phaseErr * 0.65));

      // Explicit anchor arrival lock: when approaching a structural anchor (tunnelEntry, tunnelExit,
      // impact/drop, or forkStartBar), solve the exact step needed so the anchor lands at the
      // predicted horizon arrival time.
      const nextGoalBar = this.getNextHorizonGoalBar();
      if (nextGoalBar !== null) {
        const barsToGoal = nextGoalBar - this.emitBarFloat;
        if (barsToGoal > 0 && barsToGoal <= 2.5) {
          const timeUntilGoalSec = (nextGoalBar - audioBarFloat) * barDur;
          const targetWorldDistForGoal = timeUntilGoalSec * safeEstSpeed;
          const remainingDistToHead = targetWorldDistForGoal - distAhead;
          const remainingSegs = remainingDistToHead / segLen;
          if (remainingSegs > 1) {
            const exactStep = barsToGoal / remainingSegs;
            const anchorFactor = Math.max(0.45, Math.min(2.6, exactStep / nominalStep));
            const lockWeight = Math.max(0, Math.min(1, (2.5 - barsToGoal) / 1.2));
            desiredFactor = desiredFactor * (1 - lockWeight) + anchorFactor * lockWeight;
          } else if (remainingSegs <= 1 && barsToGoal <= 0.35) {
            // Goal is overdue at the horizon: close smoothly on the next few segments
            desiredFactor = Math.max(desiredFactor, Math.min(2.6, barsToGoal / nominalStep));
          }
        }
      }

      // Smoothly slew stretchRatio per segment to prevent abrupt curvature or lamp-spacing jumps
      const maxSlew = 0.045;
      const deltaF = desiredFactor - this.currentStretchRatio;
      if (Math.abs(deltaF) > maxSlew) {
        this.currentStretchRatio += Math.sign(deltaF) * maxSlew;
      } else {
        this.currentStretchRatio = desiredFactor;
      }

      this.emitNextSegment(nominalStep * this.currentStretchRatio);
    }

    this.finalizeCommittedPortals();
  }

  private getNextHorizonGoalBar(): number | null {
    const bp = this.track.blueprint;
    let best: number | null = null;
    if (this.nextAnchorCursor < bp.syncAnchors.length) {
      const aBar = bp.syncAnchors[this.nextAnchorCursor]!.barIndex;
      if (aBar > this.emitBarFloat) best = aBar;
    }
    if (bp.forkStartBar > this.emitBarFloat && (best === null || bp.forkStartBar < best)) {
      best = bp.forkStartBar;
    }
    return best;
  }

  private allocSprite(
    kind: PropKind,
    offset: number,
    variant: number,
    scale = 1,
    chainId?: number,
  ): RoadSprite {
    const sp = this.spritePool[this.spritePoolCursor]!;
    this.spritePoolCursor = (this.spritePoolCursor + 1) & (SPRITE_POOL_SIZE - 1);
    sp.kind = kind;
    sp.offset = offset;
    sp.variant = variant;
    sp.scale = scale;
    sp.chainId = chainId;
    return sp;
  }

  private emitNextSegment(barStep: number): void {
    const absSeg = this.track.headAbsSeg;
    const slot = absSeg & STREAMING_RING_MASK;
    const seg = this.track.segments[slot]!;
    const segLen = this.track.segmentLength;

    const activeBp = this.emittingNextStage
      ? this.activeForkChoice === 'right' && this.track.nextBlueprint
        ? this.track.nextBlueprint
        : this.track.blueprint
      : this.track.blueprint;

    const prevBar = this.emittingNextStage ? this.nextStageEmitBarFloat : this.emitBarFloat;
    const nextBar = prevBar + barStep;

    // Sample blueprint geometry & environment at prevBar
    const sample = sampleBlueprintAtBar(activeBp, prevBar, this.sampleScratch);
    const chunk = activeBp.chunks[sample.chunkIndex]!;

    // 1. C1-continuous curvature (slew-limited so stretch/compression never kinks)
    const maxCurveStep = 0.45;
    let curve = sample.curve;
    const dCurve = curve - this.prevCurve;
    if (Math.abs(dCurve) > maxCurveStep) {
      curve = this.prevCurve + Math.sign(dCurve) * maxCurveStep;
    }
    this.prevCurve = curve;

    // 2. Physical-grade-clamped elevation (`|dY / segLen| <= 0.28 <= 0.30` always!)
    let rawDeltaY = sample.slopePerBar * barStep;

    // Smooth return to worldY = 0 across the tail / fork approach window so stage transitions are flush
    if (!this.emittingNextStage && prevBar >= activeBp.tailStartBar) {
      const finishAbsSeg =
        this.track.stageFinishWorldZ !== undefined
          ? Math.floor(this.track.stageFinishWorldZ / segLen)
          : -1;
      const barsLeft = Math.max(0.05, activeBp.totalBars - prevBar);
      const segsLeft =
        finishAbsSeg > absSeg
          ? Math.max(1, finishAbsSeg - absSeg)
          : Math.max(1, barsLeft / Math.max(1e-4, barStep));
      const pullToZero = -this.prevWorldY / segsLeft;
      const tailProgress = Math.max(
        0,
        Math.min(1, (prevBar - activeBp.tailStartBar) / Math.max(1, activeBp.totalBars - activeBp.tailStartBar)),
      );
      const blend = Math.min(1, tailProgress * 1.45);
      rawDeltaY = rawDeltaY * (1 - blend) + pullToZero * blend;
      if (segsLeft <= 4) {
        rawDeltaY = pullToZero;
      }
    }

    const gradeLimit = Math.min(0.28, sample.maxAvgGrade) * segLen;
    const clampedDeltaY = Math.max(-gradeLimit, Math.min(gradeLimit, rawDeltaY));
    const p1Y = this.prevWorldY;
    const p2Y = Math.max(-12000, Math.min(16500, p1Y + clampedDeltaY));
    this.prevWorldY = p2Y;

    // 3. Populate RoadSegment in-place (zero allocations!)
    seg.index = absSeg;
    seg.p1.worldX = 0;
    seg.p1.worldY = p1Y;
    seg.p1.worldZ = absSeg * segLen;
    seg.p2.worldX = 0;
    seg.p2.worldY = p2Y;
    seg.p2.worldZ = (absSeg + 1) * segLen;
    seg.curve = curve;
    seg.stripe = Math.floor(absSeg / RUMBLE_LENGTH) % 2 === 0 ? 0 : 1;
    seg.fog = 1;
    seg.env = sample.env;
    seg.sprites.length = 0;
    seg.tunnelLight = undefined;

    this.track.slotBarFloat[slot] = prevBar;

    // 4. Record materialized anchors & fork bounds (only for primary active stage)
    if (!this.emittingNextStage) {
      // Materialize fork start Z & finish Z when emitBarFloat crosses forkStartBar
      if (this.track.forkZoneStartZ === undefined && nextBar >= activeBp.forkStartBar) {
        const forkBars = Math.max(1, activeBp.totalBars - activeBp.forkStartBar);
        // Estimate segment span of fork based on current cruising speed so fork lasts exact musical bars
        const barDur = barDurationSec(activeBp.beatMap);
        const speedRatioToRef = Math.max(
          0.55,
          Math.min(1.2, this.estSpeed / Math.max(1, activeBp.referenceSpeed)),
        );
        const forkSegs = Math.max(
          24,
          Math.round((forkBars * barDur * activeBp.referenceSpeed * speedRatioToRef) / segLen),
        );
        this.track.forkZoneStartZ = absSeg * segLen;
        this.track.stageFinishWorldZ = (absSeg + forkSegs) * segLen;
        this.track.length = this.track.stageFinishWorldZ;
      }

      while (
        this.nextAnchorCursor < activeBp.syncAnchors.length &&
        nextBar >= activeBp.syncAnchors[this.nextAnchorCursor]!.barIndex
      ) {
        const bpAnchor = activeBp.syncAnchors[this.nextAnchorCursor]!;
        if (this.track.materializedAnchorCount < MAX_MATERIALIZED_ANCHORS) {
          const slotAnchor = this.track.materializedAnchors[this.track.materializedAnchorCount]!;
          slotAnchor.kind = bpAnchor.kind;
          slotAnchor.barIndex = bpAnchor.barIndex;
          slotAnchor.absSeg = absSeg;
          slotAnchor.worldZ = absSeg * segLen;
          slotAnchor.rewardsSyncBonus = bpAnchor.rewardsSyncBonus;
          slotAnchor.crossedState = 0;
          this.track.materializedAnchorCount++;
        }
        // Open-sky impact/drop twin neon billboards
        if ((bpAnchor.kind === 'drop' || bpAnchor.kind === 'impact') && sample.env === 'standard') {
          seg.sprites.push(
            this.allocSprite('billboard', -1.65, 0, 1),
            this.allocSprite('billboard', 1.65, 1, 1),
          );
        }
        this.nextAnchorCursor++;
      }

      // Notify TrafficManager once per materialized bar
      const intBar = Math.floor(prevBar);
      if (intBar > this.lastNotifiedTrafficBar && intBar < activeBp.totalBars) {
        this.lastNotifiedTrafficBar = intBar;
        this.onHorizonBarMaterialized?.(intBar, absSeg, activeBp, this.track);
      }
    }

    // 5. Dress segment deterministically (stateless hash, zero GC)
    this.dressStreamedSegment(
      seg,
      absSeg,
      activeBp,
      chunk,
      sample.env,
      sample.archetype,
      prevBar,
      nextBar,
    );

    // 6. Advance cursors & detect stage finish transition into nextBlueprint lookahead
    this.track.headAbsSeg = absSeg + 1;
    if (this.emittingNextStage) {
      this.nextStageEmitBarFloat = nextBar % Math.max(1, activeBp.totalBars);
    } else {
      const finishAbsSeg =
        this.track.stageFinishWorldZ !== undefined
          ? Math.floor(this.track.stageFinishWorldZ / segLen)
          : -1;
      const reachedStageEnd =
        finishAbsSeg > 0
          ? this.track.headAbsSeg >= finishAbsSeg
          : nextBar >= activeBp.totalBars;
      if (reachedStageEnd) {
        if (this.track.stageFinishWorldZ === undefined) {
          this.track.stageFinishWorldZ = this.track.headAbsSeg * segLen;
          this.track.length = this.track.stageFinishWorldZ;
        }
        // Settle final segment worldY smoothly toward 0 without violating gradeLimit
        if (Math.abs(p1Y) <= gradeLimit) {
          seg.p2.worldY = 0;
          this.prevWorldY = 0;
        } else {
          seg.p2.worldY = p1Y - Math.sign(p1Y) * gradeLimit;
          this.prevWorldY = seg.p2.worldY;
        }
        this.emittingNextStage = true;
        this.nextStageEmitBarFloat = 0;
        const nextBp =
          this.activeForkChoice === 'right' && this.track.nextBlueprint
            ? this.track.nextBlueprint
            : activeBp;
        resetPowerLineStreamState(
          this.nextPowerLineState,
          nextBp.powerLineRuns,
          0,
          nextBp.powerLineCrossing,
        );
      } else {
        this.emitBarFloat = Math.min(activeBp.totalBars - 1e-4, nextBar);
      }
    }
  }

  private dressStreamedSegment(
    seg: RoadSegment,
    absSeg: number,
    bp: SongBlueprint,
    chunk: BlueprintChunk,
    env: SegmentEnvironment,
    archetypeId: EnvironmentArchetypeId,
    prevBar: number,
    nextBar: number,
  ): void {
    const prevBeat = prevBar * 4;
    const nextBeat = nextBar * 4;

    if (env === 'tunnel') {
      const lightSlot = Math.floor(nextBeat / chunk.fixtureCadenceBeats);
      if (lightSlot > this.lastEmittedTunnelLightSlot) {
        this.lastEmittedTunnelLightSlot = lightSlot;
        seg.tunnelLight = true;
      }
      return;
    }

    const activeSeedHash = this.emittingNextStage
      ? hashString32(`${bp.seed}:${bp.stageId}`)
      : this.seedHash;

    if (env === 'bridge') {
      this.emitStreamedRules(
        seg,
        BRIDGE_STREAM_RULES,
        chunk,
        prevBeat,
        nextBeat,
        activeSeedHash,
        2.8,
      );
      sortSingleSegmentSprites(seg.sprites);
      return;
    }

    if (env === 'viaduct') {
      this.emitStreamedRules(
        seg,
        VIADUCT_STREAM_RULES,
        chunk,
        prevBeat,
        nextBeat,
        activeSeedHash,
      );
      this.emitStreamedCurveChevron(seg, prevBeat, nextBeat, 1.24);
      sortSingleSegmentSprites(seg.sprites);
      return;
    }

    // Standard open road: archetype Band A, B, C, D rules
    const arch = ENVIRONMENT_ARCHETYPES[archetypeId];
    this.emitStreamedRules(seg, arch.bandARules, chunk, prevBeat, nextBeat, activeSeedHash);
    this.emitStreamedRules(seg, arch.bandBRules, chunk, prevBeat, nextBeat, activeSeedHash);
    this.emitStreamedRules(seg, arch.bandCRules, chunk, prevBeat, nextBeat, activeSeedHash);
    this.emitStreamedRules(seg, arch.bandDRules, chunk, prevBeat, nextBeat, activeSeedHash);

    // Directional curve chevrons on tight curves
    this.emitStreamedCurveChevron(seg, prevBeat, nextBeat, 1.3);

    // Zone transition threshold landmark (gantry/overpass)
    if (!this.emittingNextStage) {
      while (
        this.lastZoneTransitionIdx < bp.zoneTransitions.length &&
        bp.zoneTransitions[this.lastZoneTransitionIdx]!.barIndex <= prevBar
      ) {
        const trans = bp.zoneTransitions[this.lastZoneTransitionIdx]!;
        this.lastZoneTransitionIdx++;
        if (Math.abs(trans.barIndex - prevBar) < 0.5) {
          let hasOverhead = false;
          for (let i = 0; i < seg.sprites.length; i++) {
            if (isOverheadProp(seg.sprites[i]!.kind)) {
              hasOverhead = true;
              break;
            }
          }
          if (!hasOverhead) {
            seg.sprites.push(this.allocSprite(trans.landmark, 0, 0, 1));
          }
        }
      }
    }

    // Streamed power-line corridor pylons
    const plState = this.emittingNextStage ? this.nextPowerLineState : this.powerLineState;
    emitStreamedPowerLinesForSegment(
      plState,
      bp.powerLineRuns,
      bp.powerLineCrossing,
      prevBar,
      nextBar,
      env,
      (kind, offset, variant, scale, chainId) => {
        seg.sprites.push(this.allocSprite(kind, offset, variant, scale, chainId));
      },
    );

    // Schedule composite vignettes when crossing their bar coordinate
    if (chunk.vignettes.length > 0) {
      if (this.lastVignetteChunkChecked !== chunk.chunkIndex) {
        this.lastVignetteChunkChecked = chunk.chunkIndex;
        this.lastVignetteIdxEmitted = -1;
      }
      for (let v = this.lastVignetteIdxEmitted + 1; v < chunk.vignettes.length; v++) {
        const vig = chunk.vignettes[v]!;
        if (nextBar >= vig.barFloat) {
          this.scheduleVignetteMembers(vig, absSeg + 12);
          this.lastVignetteIdxEmitted = v;
        }
      }
    }

    // Flush any pending vignette members scheduled for `absSeg`
    let hasVignetteOnSeg = false;
    let vigSide: -1 | 1 = 1;
    for (let i = 0; i < MAX_PENDING_VIGNETTE_MEMBERS; i++) {
      const pm = this.pendingVignettes[i]!;
      if (!pm.active) continue;
      if (pm.targetAbsSeg < absSeg) {
        pm.active = false;
        continue;
      }
      if (pm.targetAbsSeg === absSeg) {
        hasVignetteOnSeg = true;
        vigSide = pm.side;
      }
    }
    if (hasVignetteOnSeg) {
      // Remove conflicting non-rhythmic Band B/C props in-place (zero allocations)
      let writeIdx = 0;
      for (let i = 0; i < seg.sprites.length; i++) {
        const sp = seg.sprites[i]!;
        if (!isConflictingVignetteProp(sp, vigSide)) {
          seg.sprites[writeIdx++] = sp;
        }
      }
      seg.sprites.length = writeIdx;

      for (let i = 0; i < MAX_PENDING_VIGNETTE_MEMBERS; i++) {
        const pm = this.pendingVignettes[i]!;
        if (pm.active && pm.targetAbsSeg === absSeg) {
          seg.sprites.push(this.allocSprite(pm.kind, pm.offset, pm.variant, pm.scale));
          pm.active = false;
        }
      }
    }

    sortSingleSegmentSprites(seg.sprites);
  }

  private scheduleVignetteMembers(vig: BlueprintVignettePlacement, anchorAbsSeg: number): void {
    const prefab = VIGNETTE_PREFABS[vig.prefab];
    if (!prefab) return;
    let slotCursor = 0;
    for (let mIdx = 0; mIdx < prefab.members.length; mIdx++) {
      const m = prefab.members[mIdx]!;
      while (slotCursor < MAX_PENDING_VIGNETTE_MEMBERS && this.pendingVignettes[slotCursor]!.active) {
        slotCursor++;
      }
      if (slotCursor >= MAX_PENDING_VIGNETTE_MEMBERS) break;
      const pm = this.pendingVignettes[slotCursor]!;
      pm.active = true;
      pm.targetAbsSeg = anchorAbsSeg + Math.round(m.dSeg);
      pm.side = vig.side;
      pm.kind = m.kind;
      pm.offset = vig.side * (vig.baseOffset + m.dOffset);
      pm.variant =
        m.variant !== undefined ? m.variant : hash4(vig.variantSeed, mIdx, 1, 7) % 3;
      pm.scale =
        m.scale !== undefined
          ? m.scale
          : Math.round((0.94 + hashUnit(vig.variantSeed, mIdx, 2, 13) * 0.12) * 100) / 100;
      slotCursor++;
    }
  }

  private emitStreamedRules(
    seg: RoadSegment,
    rules: readonly ArchetypePropRule[],
    chunk: BlueprintChunk,
    prevBeat: number,
    nextBeat: number,
    seedHash: number,
    maxLateralClamp?: number,
  ): void {
    for (let rIdx = 0; rIdx < rules.length; rIdx++) {
      const rule = rules[rIdx]!;
      if (rule.roles && !rule.roles.includes(chunk.role)) continue;
      if (rule.minEnergy !== undefined && chunk.avgEnergy < rule.minEnergy) continue;
      if (rule.maxAbsCurve !== undefined && Math.abs(seg.curve) > rule.maxAbsCurve) continue;

      const stepBeats = Math.max(
        1,
        Math.round(rule.everyBeats === 'cadence' ? chunk.fixtureCadenceBeats : rule.everyBeats),
      );
      const prevSlot = Math.floor(prevBeat / stepBeats);
      const nextSlot = Math.floor(nextBeat / stepBeats);
      if (nextSlot <= prevSlot && prevBeat > 0) continue;
      if (prevBeat === 0 && nextSlot < 0) continue;

      const beatSlot = nextSlot;
      const band = rule.band;
      const isRhythmic = rule.rhythmic ?? band === 'A';
      const scaleJitter = rule.scaleJitter ?? (isRhythmic ? 0 : 0.2);

      let baseOffset: number;
      if (rule.offset !== undefined) {
        baseOffset = rule.offset;
      } else {
        const range = PROP_BAND_RANGES[band];
        baseOffset = range.min + hashUnit(seedHash, chunk.chunkIndex, beatSlot, rIdx * 7 + 1) * (range.max - range.min);
      }

      const latJitter = rule.jitter?.lateral
        ? (hashUnit(seedHash, chunk.chunkIndex, beatSlot, rIdx * 7 + 2) * 2 - 1) * rule.jitter.lateral
        : 0;
      let mOffset = baseOffset === 0 ? 0 : baseOffset + latJitter;
      if (baseOffset !== 0) {
        const range = PROP_BAND_RANGES[band];
        mOffset = Math.max(range.min, Math.min(range.max, mOffset));
      }
      if (rule.kind === 'shrub') mOffset = Math.max(1.85, mOffset);
      if (maxLateralClamp !== undefined && mOffset !== 0) {
        mOffset = Math.min(maxLateralClamp, mOffset);
      }

      const variant =
        rule.kind === 'sign'
          ? hash4(seedHash, chunk.chunkIndex, beatSlot, rIdx * 7 + 3) % 2
          : hash4(seedHash, chunk.chunkIndex, beatSlot, rIdx * 7 + 3) % 3;
      const scale =
        scaleJitter > 0
          ? Math.max(
              0.2,
              1 + (hashUnit(seedHash, chunk.chunkIndex, beatSlot, rIdx * 7 + 4) * 2 - 1) * scaleJitter,
            )
          : 1;
      const curveSign: -1 | 1 =
        Math.abs(seg.curve) > 0.2 ? (seg.curve > 0 ? 1 : -1) : chunk.mirrorSign;
      const altSide: -1 | 1 = beatSlot % 2 === 0 ? -1 : 1;

      switch (rule.placement) {
        case 'both':
          if (baseOffset === 0) {
            seg.sprites.push(this.allocSprite(rule.kind, 0, variant, scale));
          } else {
            const rightScale =
              scaleJitter > 0
                ? Math.max(
                    0.2,
                    1 +
                      (hashUnit(seedHash, chunk.chunkIndex, beatSlot, rIdx * 7 + 5) * 2 - 1) *
                        scaleJitter,
                  )
                : scale;
            seg.sprites.push(
              this.allocSprite(rule.kind, -mOffset, variant, scale),
              this.allocSprite(rule.kind, mOffset, (variant + 1) % 3, rightScale),
            );
          }
          break;
        case 'left':
          seg.sprites.push(this.allocSprite(rule.kind, -mOffset * chunk.mirrorSign, variant, scale));
          break;
        case 'right':
          seg.sprites.push(this.allocSprite(rule.kind, mOffset * chunk.mirrorSign, variant, scale));
          break;
        case 'alternating':
          seg.sprites.push(this.allocSprite(rule.kind, altSide * mOffset, variant, scale));
          break;
        case 'outside-curve':
          seg.sprites.push(this.allocSprite(rule.kind, -curveSign * mOffset, variant, scale));
          break;
        case 'inside-curve':
          seg.sprites.push(this.allocSprite(rule.kind, curveSign * mOffset, variant, scale));
          break;
      }
    }
  }

  private emitStreamedCurveChevron(
    seg: RoadSegment,
    prevBeat: number,
    nextBeat: number,
    baseOffset: number,
  ): void {
    const absC = Math.abs(seg.curve);
    if (absC < 3.4) {
      this.chevronSeqIndex = 0;
      return;
    }
    const step = absC >= 4.8 ? 0.5 : 1.0;
    const prevSlot = Math.floor(prevBeat / step);
    const nextSlot = Math.floor(nextBeat / step);
    if (nextSlot <= prevSlot || nextSlot === this.lastEmittedChevronBeat) return;
    this.lastEmittedChevronBeat = nextSlot;

    const isRight = seg.curve > 0;
    const outsideOffset = isRight ? -baseOffset : baseOffset;
    const dir = isRight ? 0 : 1;
    seg.sprites.push(this.allocSprite('chevron', outsideOffset, dir + 2 * this.chevronSeqIndex, 1));
    this.chevronSeqIndex++;
  }

  /**
   * Finalizes portal prop clearing (`±PORTAL_CLEAR_RADIUS = ±6` segments around tunnel transitions)
   * safely behind `headAbsSeg` (still beyond `drawDistance` because `HORIZON_LOOKAHEAD_MARGIN = 16`).
   */
  private finalizeCommittedPortals(): void {
    const endCommit = this.track.headAbsSeg - PORTAL_CLEAR_RADIUS;
    const startCommit = Math.max(this.track.tailAbsSeg, endCommit - 32);
    if (endCommit <= startCommit) return;

    for (let s = startCommit; s < endCommit; s++) {
      const seg = this.track.segments[s & STREAMING_RING_MASK]!;
      if (seg.env === 'tunnel') {
        seg.sprites.length = 0;
        continue;
      }
      if (seg.sprites.length === 0) continue;

      let nearTunnel = false;
      for (let d = -PORTAL_CLEAR_RADIUS; d <= PORTAL_CLEAR_RADIUS; d++) {
        if (d === 0) continue;
        const neighborAbs = s + d;
        if (neighborAbs < this.track.tailAbsSeg || neighborAbs >= this.track.headAbsSeg) continue;
        if (this.track.segments[neighborAbs & STREAMING_RING_MASK]!.env === 'tunnel') {
          nearTunnel = true;
          break;
        }
      }
      if (nearTunnel) {
        let writeIdx = 0;
        for (let i = 0; i < seg.sprites.length; i++) {
          const sp = seg.sprites[i]!;
          if (!isOverheadProp(sp.kind) && Math.abs(sp.offset) >= 3.0) {
            seg.sprites[writeIdx++] = sp;
          }
        }
        seg.sprites.length = writeIdx;
      }
    }
  }
}
