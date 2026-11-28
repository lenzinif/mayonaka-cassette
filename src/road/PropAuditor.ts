import {
  ALL_PROP_KINDS,
  getPropDepthClearance,
  getPropSpec,
  isPropAllowedInEnv,
  PROP_REGISTRY,
} from './PropRegistry';
import {
  getPropLateralHalfWidth,
  isOverheadProp,
  type PropKind,
  type RoadSegment,
  type RoadSprite,
  type SegmentEnvironment,
  type Track,
} from './RoadSegment';
import { isStreamingTrack } from './HorizonAssembler';

export type PropAuditViolationRule =
  | 'registry'
  | 'env'
  | 'curve'
  | 'overlap-intra'
  | 'overlap-depth'
  | 'overlap-overhead'
  | 'tunnel-interior'
  | 'tunnel-portal'
  | 'bridge-tower-edge'
  | 'diversity';

export interface PropAuditViolation {
  readonly rule: PropAuditViolationRule;
  readonly severity: 'error' | 'warning';
  readonly segIndex: number;
  readonly kind?: PropKind;
  readonly detail: string;
}

export interface PropAuditReport {
  readonly inspectedSegments: number;
  readonly totalSprites: number;
  readonly violations: readonly PropAuditViolation[];
  readonly errors: readonly PropAuditViolation[];
  readonly warnings: readonly PropAuditViolation[];
  readonly ok: boolean;
  readonly countsByKind: Readonly<Record<string, number>>;
  readonly bandBVariationScore: number;
}

export interface PropAuditOptions {
  /** Minimum segment index to inspect (defaults to `tailAbsSeg` or `0`). */
  minSeg?: number;
  /** Maximum segment index inclusive to inspect (defaults to `headAbsSeg - 1` or `length - 1`). */
  maxSeg?: number;
  /** Require minimum variation diversity score across Band B/C/D props on long tracks. */
  checkDiversity?: boolean;
}

/**
 * Validates that every `PropKind` in `PROP_REGISTRY` defines complete, sane physical,
 * environment, clearance, and horizon fade metadata.
 */
export function auditPropRegistry(): PropAuditViolation[] {
  const violations: PropAuditViolation[] = [];
  const seen = new Set<PropKind>();

  for (const kind of ALL_PROP_KINDS) {
    seen.add(kind);
    const spec = PROP_REGISTRY[kind];
    if (!spec) {
      violations.push({
        rule: 'registry',
        severity: 'error',
        segIndex: -1,
        kind,
        detail: `Missing PROP_REGISTRY entry for '${kind}'`,
      });
      continue;
    }
    if (spec.kind !== kind) {
      violations.push({
        rule: 'registry',
        severity: 'error',
        segIndex: -1,
        kind,
        detail: `Mismatched registry key '${kind}' vs spec.kind '${spec.kind}'`,
      });
    }
    if (
      spec.worldHeight <= 0 ||
      spec.worldWidth <= 0 ||
      (!spec.isOverhead && spec.lateralHalfWidth <= 0) ||
      (spec.isOverhead && spec.lateralHalfWidth < 0)
    ) {
      violations.push({
        rule: 'registry',
        severity: 'error',
        segIndex: -1,
        kind,
        detail: `Invalid non-positive geometry bounds on '${kind}'`,
      });
    }
    if (spec.depthClearanceSegs < 1) {
      violations.push({
        rule: 'registry',
        severity: 'error',
        segIndex: -1,
        kind,
        detail: `Invalid depthClearanceSegs (${spec.depthClearanceSegs}) on '${kind}'`,
      });
    }
    if (spec.allowedEnvs.length === 0 || spec.allowedBands.length === 0) {
      violations.push({
        rule: 'registry',
        severity: 'error',
        segIndex: -1,
        kind,
        detail: `Prop '${kind}' must declare at least one allowedEnv and allowedBand`,
      });
    }
    const hp = spec.horizonProfile;
    if (
      hp.maxRatio <= 0 ||
      hp.maxRatio > 1 ||
      hp.fadeRatioSpan <= 0 ||
      hp.minRefPpu <= 0 ||
      hp.fadePpuSpan <= 0
    ) {
      violations.push({
        rule: 'registry',
        severity: 'error',
        segIndex: -1,
        kind,
        detail: `Invalid horizonProfile on '${kind}'`,
      });
    }
  }

  for (const key of Object.keys(PROP_REGISTRY) as PropKind[]) {
    if (!seen.has(key)) {
      violations.push({
        rule: 'registry',
        severity: 'error',
        segIndex: -1,
        kind: key,
        detail: `ALL_PROP_KINDS missing '${key}'`,
      });
    }
  }

  return violations;
}

function getSegAt(track: Track, absSeg: number): RoadSegment | undefined {
  if (isStreamingTrack(track)) {
    if (absSeg < track.tailAbsSeg || absSeg >= track.headAbsSeg) return undefined;
    return track.segments[absSeg & track.ringMask];
  }
  if (absSeg < 0 || absSeg >= track.segments.length) return undefined;
  return track.segments[absSeg];
}

function isSameSideSpatialOverlap(a: RoadSprite, b: RoadSprite): boolean {
  if (isOverheadProp(a.kind) || isOverheadProp(b.kind)) return false;
  if (a.offset * b.offset <= 0) return false;
  const dist = Math.abs(a.offset - b.offset);
  const wa = getPropLateralHalfWidth(a.kind) * Math.max(0.55, Math.min(1.5, a.scale ?? 1));
  const wb = getPropLateralHalfWidth(b.kind) * Math.max(0.55, Math.min(1.5, b.scale ?? 1));
  return dist < (wa + wb) * 0.85;
}

/**
 * Audits all committed segments in `track` (static or streaming) against the `PROP_REGISTRY`
 * contracts: environment legality, curve constraints, intra-segment & multi-segment overlaps,
 * overhead clearance, bridge tower interior margin, tunnel portal clearance, and diversity.
 */
export function auditTrackProps(track: Track, opts: PropAuditOptions = {}): PropAuditReport {
  const streaming = isStreamingTrack(track);
  const defaultMin = streaming ? track.tailAbsSeg : 0;
  // Exclude the trailing portal-unfinalized horizon edge (±8 portal + ±2 neighbor safety)
  const defaultMax = streaming
    ? Math.max(defaultMin, track.headAbsSeg - 10)
    : track.segments.length - 1;
  const minSeg = Math.max(defaultMin, opts.minSeg ?? defaultMin);
  const maxSeg = Math.min(defaultMax, opts.maxSeg ?? defaultMax);

  const violations: PropAuditViolation[] = [];
  const countsByKind: Record<string, number> = {};
  const bandBSignatures = new Set<string>();
  let bandBTotal = 0;
  let totalSprites = 0;
  let inspectedSegments = 0;

  for (let s = minSeg; s <= maxSeg; s++) {
    const seg = getSegAt(track, s);
    if (!seg) continue;
    inspectedSegments++;
    const env: SegmentEnvironment = seg.env ?? 'standard';
    const sprites = seg.sprites;
    totalSprites += sprites.length;

    // 1. Tunnel interior must be completely clear of freestanding sprites
    if (env === 'tunnel') {
      if (sprites.length > 0) {
        violations.push({
          rule: 'tunnel-interior',
          severity: 'error',
          segIndex: s,
          kind: sprites[0]!.kind,
          detail: `Found ${sprites.length} prop(s) inside tunnel segment ${s}`,
        });
      }
      continue;
    }

    // 2. Tunnel portal approach/exit clearance (±8 committed radius)
    let nearTunnel = false;
    for (let d = -8; d <= 8; d++) {
      if (d === 0) continue;
      const nb = getSegAt(track, s + d);
      if (nb?.env === 'tunnel') {
        nearTunnel = true;
        break;
      }
    }
    if (nearTunnel) {
      for (const sp of sprites) {
        if (isOverheadProp(sp.kind) || Math.abs(sp.offset) < 3.0) {
          violations.push({
            rule: 'tunnel-portal',
            severity: 'error',
            segIndex: s,
            kind: sp.kind,
            detail: `Prop '${sp.kind}' (offset=${sp.offset.toFixed(2)}) violates tunnel portal zone on seg ${s}`,
          });
        }
      }
    }

    // 3. Per-prop contract & intra-segment overlap checks
    for (let i = 0; i < sprites.length; i++) {
      const sp = sprites[i]!;
      countsByKind[sp.kind] = (countsByKind[sp.kind] ?? 0) + 1;
      const spec = getPropSpec(sp.kind);

      if (env === 'standard' && Math.abs(sp.offset) >= 1.8) {
        bandBTotal++;
        bandBSignatures.add(`${sp.kind}:${sp.variant}:${sp.offset.toFixed(1)}`);
      }

      if (!isPropAllowedInEnv(sp.kind, env)) {
        violations.push({
          rule: 'env',
          severity: 'error',
          segIndex: s,
          kind: sp.kind,
          detail: `Prop '${sp.kind}' forbidden in env='${env}' (seg ${s})`,
        });
      }

      if (spec.maxAbsCurve !== undefined && Math.abs(seg.curve) > spec.maxAbsCurve + 0.45) {
        violations.push({
          rule: 'curve',
          severity: 'error',
          segIndex: s,
          kind: sp.kind,
          detail: `Prop '${sp.kind}' placed on excessive curve ${seg.curve.toFixed(2)} > ${spec.maxAbsCurve} (seg ${s})`,
        });
      }

      if (sp.kind === 'suspension-tower') {
        for (let d = -12; d <= 12; d++) {
          const checkIdx = s + d;
          if (!streaming && (checkIdx < 0 || checkIdx >= track.segments.length)) {
            violations.push({
              rule: 'bridge-tower-edge',
              severity: 'error',
              segIndex: s,
              kind: 'suspension-tower',
              detail: `Suspension tower on seg ${s} within 12 segs of track boundary at ${checkIdx}`,
            });
            break;
          }
          const nb = getSegAt(track, checkIdx);
          if (nb && (nb.env ?? 'standard') !== 'bridge') {
            violations.push({
              rule: 'bridge-tower-edge',
              severity: 'error',
              segIndex: s,
              kind: 'suspension-tower',
              detail: `Suspension tower on seg ${s} within 12 segs of bridge edge at ${checkIdx}`,
            });
            break;
          }
        }
      }

      for (let j = i + 1; j < sprites.length; j++) {
        const other = sprites[j]!;
        if (isOverheadProp(sp.kind) && !isOverheadProp(other.kind) && Math.abs(other.offset) <= 1.85) {
          violations.push({
            rule: 'overlap-overhead',
            severity: 'error',
            segIndex: s,
            kind: other.kind,
            detail: `Prop '${other.kind}' (offset=${other.offset.toFixed(2)}) overlaps overhead '${sp.kind}' on seg ${s}`,
          });
        } else if (
          isOverheadProp(other.kind) &&
          !isOverheadProp(sp.kind) &&
          Math.abs(sp.offset) <= 1.85
        ) {
          violations.push({
            rule: 'overlap-overhead',
            severity: 'error',
            segIndex: s,
            kind: sp.kind,
            detail: `Prop '${sp.kind}' (offset=${sp.offset.toFixed(2)}) overlaps overhead '${other.kind}' on seg ${s}`,
          });
        } else if (isSameSideSpatialOverlap(sp, other)) {
          violations.push({
            rule: 'overlap-intra',
            severity: 'error',
            segIndex: s,
            kind: sp.kind,
            detail: `'${sp.kind}'(${sp.offset.toFixed(2)}) overlaps '${other.kind}'(${other.offset.toFixed(2)}) on seg ${s}`,
          });
        }
      }

      // 4. Multi-segment lookahead clearance (symmetric overhead, Band-A, and full depthClearanceSegs)
      const spClear = getPropDepthClearance(sp.kind);
      const maxDepth = Math.max(spClear, isOverheadProp(sp.kind) ? 6 : 5);
      for (let d = 1; d <= maxDepth && s + d <= maxSeg; d++) {
        const nb = getSegAt(track, s + d);
        if (!nb) continue;
        for (const other of nb.sprites) {
          if (isOverheadProp(sp.kind) && isOverheadProp(other.kind)) {
            if (d <= 6) {
              violations.push({
                rule: 'overlap-overhead',
                severity: 'error',
                segIndex: s + d,
                kind: other.kind,
                detail: `Overhead '${other.kind}' within ${d} segs of overhead '${sp.kind}' at seg ${s}`,
              });
            }
          } else if (
            isOverheadProp(sp.kind) &&
            !isOverheadProp(other.kind) &&
            Math.abs(other.offset) <= 1.85
          ) {
            if (d <= Math.min(4, spClear)) {
              violations.push({
                rule: 'overlap-overhead',
                severity: 'error',
                segIndex: s + d,
                kind: other.kind,
                detail: `Prop '${other.kind}' within ${d} segs of overhead '${sp.kind}' at seg ${s}`,
              });
            }
          } else if (
            !isOverheadProp(sp.kind) &&
            isOverheadProp(other.kind) &&
            Math.abs(sp.offset) <= 1.85
          ) {
            const otherClear = getPropDepthClearance(other.kind);
            if (d <= Math.min(4, otherClear)) {
              violations.push({
                rule: 'overlap-overhead',
                severity: 'error',
                segIndex: s,
                kind: sp.kind,
                detail: `Prop '${sp.kind}' within ${d} segs ahead of overhead '${other.kind}' at seg ${s + d}`,
              });
            }
          } else if (sp.kind !== 'shrub' && other.kind !== 'shrub') {
            const pairClear = Math.max(spClear, getPropDepthClearance(other.kind));
            if (d <= pairClear) {
              if (sp.kind === 'lamp' && other.kind === 'lamp') {
                const diffOffsets = Math.abs(sp.offset - other.offset);
                const diffLaneBand =
                  (Math.abs(sp.offset) >= 1.5) !== (Math.abs(other.offset) >= 1.5);
                if (
                  sp.offset * other.offset > 0 &&
                  (diffOffsets < 0.75 || diffLaneBand)
                ) {
                  violations.push({
                    rule: 'overlap-depth',
                    severity: 'error',
                    segIndex: s,
                    kind: sp.kind,
                    detail: `Lamp on seg ${s} conflicts with lamp on seg ${s + d}`,
                  });
                }
              } else if (isSameSideSpatialOverlap(sp, other)) {
                violations.push({
                  rule: 'overlap-depth',
                  severity: 'error',
                  segIndex: s,
                  kind: sp.kind,
                  detail: `'${sp.kind}' on seg ${s} overlaps '${other.kind}' on seg ${s + d}`,
                });
              }
            }
          }
        }
      }
    }
  }

  const bandBVariationScore =
    bandBTotal > 0 ? Math.min(1, bandBSignatures.size / bandBTotal) : 1;
  if (opts.checkDiversity && bandBTotal >= 20 && bandBVariationScore < 0.32) {
    violations.push({
      rule: 'diversity',
      severity: 'error',
      segIndex: minSeg,
      detail: `Low Band B/C/D variation score: ${bandBVariationScore.toFixed(2)} (${bandBSignatures.size}/${bandBTotal})`,
    });
  }

  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');
  return {
    inspectedSegments,
    totalSprites,
    violations,
    errors,
    warnings,
    ok: errors.length === 0,
    countsByKind,
    bandBVariationScore,
  };
}
