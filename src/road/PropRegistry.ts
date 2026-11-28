import type { PropBand, PropKind, SegmentEnvironment } from './RoadSegment';

export type PropGroundingMode = 'surface' | 'deck-parapet' | 'deep-foundation' | 'overhead-portal';
export type PropHorizonCategory = 'landmark' | 'structural' | 'mid' | 'detail';

export interface PropHorizonProfile {
  readonly category: PropHorizonCategory;
  /** Fraction of renderDepth at which the prop starts fading out toward the horizon (0..1). */
  readonly maxRatio: number;
  /** Normalized depth span over which alpha ramps 0 -> 1. */
  readonly fadeRatioSpan: number;
  /** Minimum reference PPU (640px width) to begin rendering. */
  readonly minRefPpu: number;
  /** Reference PPU span over which PPU alpha ramps 0 -> 1. */
  readonly fadePpuSpan: number;
}

export interface PropSpec {
  readonly kind: PropKind;
  readonly worldHeight: number;
  readonly worldWidth: number;
  readonly lateralHalfWidth: number;
  readonly depthClearanceSegs: number;
  readonly overlapPriority: number;
  readonly isOverhead: boolean;
  readonly allowedEnvs: readonly SegmentEnvironment[];
  readonly allowedBands: readonly PropBand[];
  readonly groundingMode: PropGroundingMode;
  readonly maxAbsCurve?: number;
  readonly minPortalClearSegs: number;
  readonly minBridgeEdgeClearSegs: number;
  readonly horizonProfile: PropHorizonProfile;
  readonly styleContract: {
    readonly mustRespectFog: boolean;
    readonly baseGroundTouchPx: number;
  };
}

const HORIZON_LANDMARK: PropHorizonProfile = {
  category: 'landmark',
  maxRatio: 0.98,
  fadeRatioSpan: 0.22,
  minRefPpu: 0.002,
  fadePpuSpan: 0.0028,
};

const HORIZON_STRUCTURAL: PropHorizonProfile = {
  category: 'structural',
  maxRatio: 0.86,
  fadeRatioSpan: 0.22,
  minRefPpu: 0.0032,
  fadePpuSpan: 0.0035,
};

const HORIZON_MID: PropHorizonProfile = {
  category: 'mid',
  maxRatio: 0.9,
  fadeRatioSpan: 0.24,
  minRefPpu: 0.0035,
  fadePpuSpan: 0.004,
};

const HORIZON_DETAIL: PropHorizonProfile = {
  category: 'detail',
  maxRatio: 0.58,
  fadeRatioSpan: 0.22,
  minRefPpu: 0.006,
  fadePpuSpan: 0.005,
};

/**
 * Exhaustive compile-time contract registry for every current and future `PropKind`.
 * Adding a new member to `PropKind` will fail type-checking until its physical dimensions,
 * overlap clearance, valid environments, grounding mode, and horizon fade profile are declared here.
 */
export const PROP_REGISTRY: Readonly<Record<PropKind, PropSpec>> = {
  palm: {
    kind: 'palm',
    worldHeight: 4800,
    worldWidth: 2640,
    lateralHalfWidth: 0.55,
    depthClearanceSegs: 3,
    overlapPriority: 30,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B', 'C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  tree: {
    kind: 'tree',
    worldHeight: 4800,
    worldWidth: 2400,
    lateralHalfWidth: 0.55,
    depthClearanceSegs: 3,
    overlapPriority: 30,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B', 'C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  'street-tree': {
    kind: 'street-tree',
    worldHeight: 3200,
    worldWidth: 2200,
    lateralHalfWidth: 0.55,
    depthClearanceSegs: 3,
    overlapPriority: 30,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B', 'C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  pine: {
    kind: 'pine',
    worldHeight: 3800,
    worldWidth: 2300,
    lateralHalfWidth: 0.55,
    depthClearanceSegs: 3,
    overlapPriority: 30,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B', 'C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  lamp: {
    kind: 'lamp',
    worldHeight: 3100,
    worldWidth: 900,
    lateralHalfWidth: 0.24,
    depthClearanceSegs: 2,
    overlapPriority: 60,
    isOverhead: false,
    allowedEnvs: ['standard', 'bridge', 'viaduct'],
    allowedBands: ['A', 'B'],
    groundingMode: 'deck-parapet',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 0,
    horizonProfile: HORIZON_STRUCTURAL,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  billboard: {
    kind: 'billboard',
    worldHeight: 2700,
    worldWidth: 2600,
    lateralHalfWidth: 0.68,
    depthClearanceSegs: 4,
    overlapPriority: 75,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  building: {
    kind: 'building',
    worldHeight: 12800,
    worldWidth: 4100,
    lateralHalfWidth: 1.05,
    depthClearanceSegs: 4,
    overlapPriority: 40,
    isOverhead: false,
    allowedEnvs: ['standard', 'viaduct'],
    allowedBands: ['C', 'D'],
    groundingMode: 'surface',
    minPortalClearSegs: 4,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_LANDMARK,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  jihanki: {
    kind: 'jihanki',
    worldHeight: 2400,
    worldWidth: 1100,
    lateralHalfWidth: 0.34,
    depthClearanceSegs: 3,
    overlapPriority: 70,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B'],
    groundingMode: 'surface',
    maxAbsCurve: 2.5,
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_DETAIL,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  phonebooth: {
    kind: 'phonebooth',
    worldHeight: 2800,
    worldWidth: 900,
    lateralHalfWidth: 0.34,
    depthClearanceSegs: 3,
    overlapPriority: 70,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B', 'C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_DETAIL,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  gantry: {
    kind: 'gantry',
    worldHeight: 5200,
    worldWidth: 6800,
    lateralHalfWidth: 0,
    depthClearanceSegs: 4,
    overlapPriority: 100,
    isOverhead: true,
    allowedEnvs: ['standard', 'viaduct'],
    allowedBands: ['A'],
    groundingMode: 'overhead-portal',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 4,
    horizonProfile: HORIZON_LANDMARK,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  vms: {
    kind: 'vms',
    worldHeight: 4200,
    worldWidth: 3600,
    lateralHalfWidth: 0.72,
    depthClearanceSegs: 3,
    overlapPriority: 65,
    isOverhead: false,
    allowedEnvs: ['standard', 'viaduct'],
    allowedBands: ['A'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 4,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  chevron: {
    kind: 'chevron',
    worldHeight: 2800,
    worldWidth: 950,
    lateralHalfWidth: 0.34,
    depthClearanceSegs: 2,
    overlapPriority: 85,
    isOverhead: false,
    allowedEnvs: ['standard', 'viaduct'],
    allowedBands: ['A'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_DETAIL,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  pylon: {
    kind: 'pylon',
    worldHeight: 11000,
    worldWidth: 6600,
    lateralHalfWidth: 1.15,
    depthClearanceSegs: 5,
    overlapPriority: 95,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['C', 'D'],
    groundingMode: 'surface',
    minPortalClearSegs: 6,
    minBridgeEdgeClearSegs: 4,
    horizonProfile: HORIZON_LANDMARK,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  shrub: {
    kind: 'shrub',
    worldHeight: 1400,
    worldWidth: 1400,
    lateralHalfWidth: 0.38,
    depthClearanceSegs: 2,
    overlapPriority: 20,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B', 'C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_DETAIL,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  sign: {
    kind: 'sign',
    worldHeight: 3600,
    worldWidth: 1800,
    lateralHalfWidth: 0.42,
    depthClearanceSegs: 3,
    overlapPriority: 55,
    isOverhead: false,
    allowedEnvs: ['standard', 'viaduct'],
    allowedBands: ['A'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  overpass: {
    kind: 'overpass',
    worldHeight: 7600,
    worldWidth: 7800,
    lateralHalfWidth: 0,
    depthClearanceSegs: 5,
    overlapPriority: 100,
    isOverhead: true,
    allowedEnvs: ['standard'],
    allowedBands: ['A'],
    groundingMode: 'overhead-portal',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 6,
    horizonProfile: HORIZON_LANDMARK,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  'suspension-tower': {
    kind: 'suspension-tower',
    worldHeight: 10200,
    worldWidth: 5000,
    lateralHalfWidth: 0,
    depthClearanceSegs: 5,
    overlapPriority: 100,
    isOverhead: true,
    allowedEnvs: ['bridge'],
    allowedBands: ['A'],
    groundingMode: 'deep-foundation',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 12,
    horizonProfile: HORIZON_LANDMARK,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  kiosk: {
    kind: 'kiosk',
    worldHeight: 3100,
    worldWidth: 2800,
    lateralHalfWidth: 0.65,
    depthClearanceSegs: 4,
    overlapPriority: 70,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B', 'C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  bench: {
    kind: 'bench',
    worldHeight: 1000,
    worldWidth: 1300,
    lateralHalfWidth: 0.34,
    depthClearanceSegs: 2,
    overlapPriority: 70,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B', 'C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_DETAIL,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  'bus-stop': {
    kind: 'bus-stop',
    worldHeight: 3200,
    worldWidth: 2400,
    lateralHalfWidth: 0.65,
    depthClearanceSegs: 4,
    overlapPriority: 70,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['B'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_DETAIL,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  canopy: {
    kind: 'canopy',
    worldHeight: 3000,
    worldWidth: 4800,
    lateralHalfWidth: 0.95,
    depthClearanceSegs: 4,
    overlapPriority: 70,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  torii: {
    kind: 'torii',
    worldHeight: 3800,
    worldWidth: 3000,
    lateralHalfWidth: 0.65,
    depthClearanceSegs: 4,
    overlapPriority: 70,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_MID,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
  toro: {
    kind: 'toro',
    worldHeight: 2100,
    worldWidth: 900,
    lateralHalfWidth: 0.34,
    depthClearanceSegs: 2,
    overlapPriority: 70,
    isOverhead: false,
    allowedEnvs: ['standard'],
    allowedBands: ['C'],
    groundingMode: 'surface',
    minPortalClearSegs: 8,
    minBridgeEdgeClearSegs: 2,
    horizonProfile: HORIZON_DETAIL,
    styleContract: { mustRespectFog: true, baseGroundTouchPx: 2 },
  },
};

export const ALL_PROP_KINDS: readonly PropKind[] = Object.keys(PROP_REGISTRY) as PropKind[];

export function getPropSpec(kind: PropKind): PropSpec {
  return PROP_REGISTRY[kind];
}

export function isPropAllowedInEnv(kind: PropKind, env: SegmentEnvironment): boolean {
  const allowed = PROP_REGISTRY[kind].allowedEnvs;
  for (let i = 0; i < allowed.length; i++) {
    if (allowed[i] === env) return true;
  }
  return false;
}

export function getPropDepthClearance(kind: PropKind): number {
  return PROP_REGISTRY[kind].depthClearanceSegs;
}

export function getPropWorldHeightFromRegistry(kind: PropKind): number {
  return PROP_REGISTRY[kind].worldHeight;
}
