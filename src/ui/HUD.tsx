import type { BeatMap } from '@src/audio/BeatMap';
import type { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import type { PlaylistItem, TrackLibrary } from '@src/audio/TrackLibrary';
import type { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import type { SodaSkin } from '@src/entities/MelonSoda';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  COCKPIT_PRESET_CLUTTER,
  type CockpitVisibility,
} from './cockpit/cockpitSettings';
import { SunVisorPhoto } from './cockpit/SunVisorPhoto';
import type { VisorPhotoItem } from './cockpit/visorPhotoStore';
import {
  CassetteTapeWidget,
  type RadioPlaylistEntry,
} from './hud/CassetteTapeWidget';
import { RhythmBezel } from './hud/RhythmBezel';
import { VfdDigidash } from './hud/VfdDigidash';
import { PauseMenu } from './PauseMenu';

export interface HUDProps {
  bridge: TelemetryBridge<TelemetrySnapshot, GameEvent>;
  debugOpen: boolean;
  trackLoaderOpen?: boolean;
  inspectorOpen?: boolean;
  onToggleDebug: () => void;
  onOpenTrackLoader: () => void;
  onOpenInspector: () => void;
  gameStarted?: boolean;
  onRestartRun?: () => void;
  onReturnToMainMenu?: () => void;
  onTogglePause?: () => void;
  onToggleAutoShift?: () => void;
  onToggleTofuMode?: () => void;
  onCycleSodaSkin?: () => void;
  onToggleAutopilot?: () => void;
  crtEnabled?: boolean;
  onToggleCrt?: () => void;
  hideBezel?: boolean;
  minimalPerfOnly?: boolean;
  hideCassette?: boolean;
  hideVfd?: boolean;
  cockpitVisibility?: CockpitVisibility;
  onToggleCockpitModule?: (key: keyof CockpitVisibility) => void;
  onApplyCockpitPreset?: (preset: CockpitVisibility) => void;
  visorPhotos?: readonly VisorPhotoItem[];
  onAddVisorPhotos?: (files: readonly File[]) => void;
  onAddVisorPhoto?: (file: File) => void;
  onRemoveVisorPhoto?: (id: string) => void;
  onClearVisorPhotos?: () => void;
  playlistItems?: readonly RadioPlaylistEntry[];
  library?: TrackLibrary;
  audio?: FunkAudioEngine;
  onSelectTrack?: (item: PlaylistItem) => void;
  onUpdateBeatMap?: (contentHash: string, updated: BeatMap) => void;
  onPreviewUnlocked?: () => void;
}

/**
 * React HUD overlay (`z-index: 2`, `pointer-events-none`, `docs/UI.md §1.2 & §5`).
 */
export function HUD({
  bridge,
  debugOpen,
  trackLoaderOpen = false,
  inspectorOpen = false,
  onToggleDebug,
  onOpenTrackLoader,
  gameStarted = true,
  onOpenInspector,
  onRestartRun,
  onReturnToMainMenu,
  onTogglePause,
  onToggleAutoShift,
  onToggleTofuMode,
  onCycleSodaSkin,
  onToggleAutopilot,
  crtEnabled = true,
  onToggleCrt,
  hideBezel = false,
  minimalPerfOnly = false,
  hideCassette = false,
  hideVfd = false,
  cockpitVisibility = COCKPIT_PRESET_CLUTTER,
  onToggleCockpitModule,
  onApplyCockpitPreset,
  visorPhotos = [],
  onAddVisorPhotos,
  onAddVisorPhoto,
  onRemoveVisorPhoto,
  onClearVisorPhotos,
  playlistItems,
  library,
  audio,
  onSelectTrack,
  onUpdateBeatMap,
  onPreviewUnlocked,
}: HUDProps) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);
  const [showPerfHud, setShowPerfHud] = useState(false);
  const [isTapeSlack, setIsTapeSlack] = useState(false);

  // Dev-only F3 Perf Ribbon toggle
  useEffect(() => {
    if (!gameStarted || trackLoaderOpen || inspectorOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'F3') {
        e.preventDefault();
        setShowPerfHud((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameStarted, trackLoaderOpen, inspectorOpen]);

  useEffect(() => {
    let slackTimerId = 0;
    const triggerSlackAnimation = () => {
      window.clearTimeout(slackTimerId);
      setIsTapeSlack(true);
      slackTimerId = window.setTimeout(() => setIsTapeSlack(false), 1500);
    };

    const unsub = bridge.onEvent((event) => {
      if (event.type === 'sodaSpill') {
        triggerSlackAnimation();
      } else if (event.type === 'collision' && event.outcome !== 'truckKnockedOff') {
        triggerSlackAnimation();
      }
    });

    return () => {
      unsub();
      window.clearTimeout(slackTimerId);
    };
  }, [bridge]);

  if (!gameStarted) return null;

  const speedKmh = snap?.speedKmh ?? 0;
  const fps = snap?.fps ?? 0;
  const bpm = snap?.bpm ?? 122;
  const barIndex = snap?.barIndex ?? 0;
  const beatInBar = snap?.beatInBar ?? 0;
  const beatPulse = snap?.beatPulse ?? 0;
  const trackTitle = snap?.trackTitle ?? 'Neon Horizon';
  const trackArtist = snap?.trackArtist ?? 'Mayonaka FM';
  const roadBarIndex = snap?.roadBarIndex ?? 0;
  const totalBars = Math.max(1, snap?.totalBars ?? 64);

  const gear = snap?.gear ?? 1;
  const rpm = Math.round((snap?.rpm ?? 0) * 100) / 100;
  const isLugging = snap?.isLugging ?? false;
  const autoShift = snap?.autoShift ?? false;
  const groove = snap?.groove ?? 15;
  const grooveTier = snap?.grooveTier ?? 'LOW';
  const tofuMode = snap?.tofuMode ?? false;
  const sodaSkin: SodaSkin = snap?.sodaSkin ?? 'melon-soda';
  const stageAccentColor = snap?.stageAccentColor ?? '#00f0b5';
  const playlistIndex = snap?.playlistIndex ?? 0;
  const isPaused = snap?.isPaused ?? false;

  const cassetteVisible = !hideCassette && cockpitVisibility.showCassetteWidget;
  const visorVisible = cockpitVisibility.showSunVisor;
  const vfdVisible = !hideVfd && cockpitVisibility.showInstrumentCluster;

  const effectivePlaylistItems: readonly RadioPlaylistEntry[] =
    playlistItems && playlistItems.length > 0
      ? playlistItems
      : [
          {
            id: 'active-track',
            title: trackTitle,
            artist: trackArtist,
            bpm,
          },
        ];

  if (minimalPerfOnly) {
    return (
      <div className="ff-mono pointer-events-none absolute top-2 left-2 z-2 bg-[#0B0E1E]/85 px-2 py-1 text-[10px] text-[var(--ff-cream)]">
        PERF {fps} FPS | MIN {snap?.minFps ?? fps} | FR {snap?.frameTimeMs ?? 16.7}ms | P95{' '}
        {snap?.p95FrameMs ?? 16.7}ms | JS {snap?.renderTimeMs ?? 0}ms | GAP{' '}
        {snap?.compositorGapMs ?? 0}ms | DRP {snap?.droppedFrames ?? 0} | SEG{' '}
        {snap?.drawnSegments ?? 0} | PRP {snap?.drawnProps ?? 0}
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-2 flex flex-col justify-between overflow-hidden p-3 text-[var(--ff-cream)] select-none sm:p-4">
        {!hideBezel && (
          <RhythmBezel
            beatPulse={beatPulse}
            beatInBar={beatInBar}
            grooveTier={grooveTier}
            alwaysMount
          />
        )}

        {/* TOP-RIGHT: Oversized Sun Visor + Cascading Clipped/Taped Photos */}
        {visorVisible && (
          <div className="pointer-events-none absolute inset-0 z-2 overflow-hidden [container-type:size]">
            <div className="pointer-events-none absolute top-0 right-[7.5cqw]">
              <SunVisorPhoto photos={visorPhotos} />
            </div>
          </div>
        )}

        {/* TOP-LEFT: Cassette Window + Monochrome Theme Progress Bar + Adjacent Playlist */}
        <div className="relative z-1 flex items-start justify-start">
          {cassetteVisible && (
            <CassetteTapeWidget
              trackTitle={trackTitle}
              barIndex={barIndex}
              beatInBar={beatInBar}
              grooveTier={grooveTier}
              roadBarIndex={roadBarIndex}
              totalBars={totalBars}
              playlistIndex={playlistIndex}
              playlistItems={effectivePlaylistItems}
              stageAccentColor={stageAccentColor}
              isSlack={isTapeSlack}
              visible={cockpitVisibility.showCassetteWidget}
            />
          )}
        </div>

        {/* On-Demand Developer Performance Profiler Ribbon (F3) */}
        {showPerfHud && (
          <div
            className={`wm-lcd ff-mono pointer-events-none absolute top-2 z-2 flex flex-wrap items-center justify-end gap-2.5 rounded-[2px] px-3 py-1 text-[10px] text-[var(--wm-silk)] ${
              debugOpen ? 'right-[396px]' : 'right-3 sm:right-5'
            }`}
          >
            <span className="font-bold tracking-widest text-[var(--wm-play)] uppercase">PERF</span>
            <span className="font-bold text-[#2ee2be]">
              {fps} FPS (MIN {snap?.minFps ?? fps})
            </span>
            <span className="text-[var(--wm-silk-dim)]">
              FR: <strong className="text-[var(--wm-silk)]">{snap?.frameTimeMs ?? 16.7}ms</strong> (P95{' '}
              {snap?.p95FrameMs ?? 16.7})
            </span>
            <span className="text-[var(--wm-play)]">
              JS: <strong className="text-[var(--wm-silk)]">{snap?.renderTimeMs ?? 1.2}ms</strong>
            </span>
            <span className="text-[var(--wm-amber)]">
              GAP: <strong className="text-[var(--wm-silk)]">{snap?.compositorGapMs ?? 0}ms</strong>
            </span>
            <span className="text-[var(--wm-play)]">
              DRP: <strong className="text-[var(--wm-silk)]">{snap?.droppedFrames ?? 0}</strong>
            </span>
          </div>
        )}

        {/* BOTTOM-LEFT: Speedometer & Tachometer */}
        <div className="relative z-1 flex items-end justify-start">
          {vfdVisible && (
            <VfdDigidash
              speedKmh={speedKmh}
              gear={gear}
              rpm={rpm}
              groove={groove}
              grooveTier={grooveTier}
              isLugging={isLugging}
              stageAccentColor={stageAccentColor}
            />
          )}
        </div>
      </div>

      {/* Right-Edge Portable Cassette Player Pause Menu */}
      <PauseMenu
        open={gameStarted && isPaused && !trackLoaderOpen && !inspectorOpen}
        trackTitle={trackTitle}
        tofuMode={tofuMode}
        sodaSkin={sodaSkin}
        showPerfHud={showPerfHud}
        autoShift={autoShift}
        autopilotActive={snap?.autopilotActive ?? false}
        crtEnabled={crtEnabled}
        cockpitVisibility={cockpitVisibility}
        visorPhotos={visorPhotos}
        library={library}
        audio={audio}
        onSelectTrack={onSelectTrack}
        onUpdateBeatMap={onUpdateBeatMap}
        onPreviewUnlocked={onPreviewUnlocked}
        onToggleCockpitModule={onToggleCockpitModule}
        onApplyCockpitPreset={onApplyCockpitPreset}
        onAddVisorPhotos={onAddVisorPhotos}
        onAddVisorPhoto={onAddVisorPhoto}
        onRemoveVisorPhoto={onRemoveVisorPhoto}
        onClearVisorPhotos={onClearVisorPhotos}
        onResume={() => onTogglePause?.()}
        onRestartRun={onRestartRun}
        onOpenTrackLoader={onOpenTrackLoader}
        onOpenInspector={onOpenInspector}
        onToggleDebug={onToggleDebug}
        onToggleTofuMode={onToggleTofuMode}
        onCycleSodaSkin={onCycleSodaSkin}
        onTogglePerfHud={() => setShowPerfHud((prev) => !prev)}
        onToggleAutoShift={onToggleAutoShift}
        onToggleAutopilot={onToggleAutopilot}
        onToggleCrt={onToggleCrt}
        onReturnToMainMenu={onReturnToMainMenu}
      />
    </>
  );
}
