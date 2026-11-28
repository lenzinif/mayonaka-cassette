import type { BeatMap } from '@src/audio/BeatMap';
import { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import { TrackLibrary, type PlaylistItem } from '@src/audio/TrackLibrary';
import { TELEMETRY_HZ } from '@src/config/constants';
import { AssetPreloader, type PreloadProgress } from '@src/core/AssetPreloader';
import type { AutopilotMode } from '@src/core/AutopilotDriver';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type {
  Game,
  GameEvent,
  PerfBenchmarkReport,
  TelemetrySnapshot,
} from '@src/engine/Game';
import type { SodaSkin } from '@src/entities/MelonSoda';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BeatMapInspector } from './ui/BeatMapInspector';
import { CanvasStage } from './ui/CanvasStage';
import {
  loadCockpitVisibility,
  saveCockpitVisibility,
  type CockpitVisibility,
} from './ui/cockpit/cockpitSettings';
import type { RadioPlaylistEntry } from './ui/hud/CassetteTapeWidget';
import {
  addVisorPhotoFile,
  addVisorPhotoFiles,
  clearVisorPhotos,
  loadVisorPhotos,
  removeVisorPhoto,
  type VisorPhotoItem,
} from './ui/cockpit/visorPhotoStore';
import { CRTOverlay } from './ui/CRTOverlay';
import { DebugPanel, loadSavedTuning } from './ui/DebugPanel';
import { HUD } from './ui/HUD';
import { MainMenu } from './ui/MainMenu';
import { RadioSelector } from './ui/RadioSelector';
import { TrackLoader } from './ui/TrackLoader';

export interface MayonakaDiagIsolation {
  renderBg?: boolean;
  renderRoad?: boolean;
  renderProps?: boolean;
  renderPylonWires?: boolean;
  renderTraffic?: boolean;
  renderCar?: boolean;
  renderParticles?: boolean;
  syncGpuProbe?: boolean;
  legacyRaster?: boolean;
}

export interface MayonakaDiagApi {
  getSnapshot: () => TelemetrySnapshot | null;
  getFullReport: () => PerfBenchmarkReport;
  resetBenchmark: () => void;
  setIsolation: (opts: MayonakaDiagIsolation) => void;
  seekToBar: (barIndex: number) => void;
  loadTestTrack: (query: string) => Promise<boolean>;
  triggerForkTest: () => void;
  triggerNextSongTest: () => void;
  triggerOffRoadTest: () => void;
  triggerTruckCollisionTest: () => void;
  game: Game;
}

declare global {
  interface Window {
    __MAYONAKA_DIAG__?: MayonakaDiagApi;
  }
}

export function App() {
  const [bridge] = useState(() => new TelemetryBridge<TelemetrySnapshot, GameEvent>(TELEMETRY_HZ));
  const [audio] = useState(() => new FunkAudioEngine());
  const [preloader] = useState(() => new AssetPreloader());
  const [library] = useState(() => new TrackLibrary(preloader));
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress>(() => preloader.progress);
  const [preloadReady, setPreloadReady] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(() => audio.unlocked);
  const [gameStarted, setGameStarted] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('autostart');
  });
  const [isInitialSelect, setIsInitialSelect] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !params.has('autostart') && (params.has('deck') || params.has('tracks'));
  });
  const gameRef = useRef<Game | null>(null);
  const wasPausedBeforeModalRef = useRef(false);
  const wasModalOpenRef = useRef(false);
  const trackLoaderOpeningRef = useRef(false);
  const visorPhotosRef = useRef<VisorPhotoItem[]>([]);
  const visorQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Quick settings state
  const [crtEnabled, setCrtEnabled] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !params.has('nocrt') && !params.has('nohud');
  });
  const [noHud] = useState(() => new URLSearchParams(window.location.search).has('nohud'));
  const [noBezel] = useState(() => new URLSearchParams(window.location.search).has('nobezel'));
  const [noCassette] = useState(() => new URLSearchParams(window.location.search).has('nocassette'));
  const [noVfd] = useState(() => new URLSearchParams(window.location.search).has('novfd'));
  const [autoShift, setAutoShift] = useState(false);
  const [tofuMode, setTofuMode] = useState(false);
  const [sodaSkin, setSodaSkin] = useState<SodaSkin>('melon-soda');
  const [isPaused, setIsPaused] = useState(
    () => !new URLSearchParams(window.location.search).has('autostart'),
  );
  const [runSummaryOpen, setRunSummaryOpen] = useState(false);
  const [cockpitVisibility, setCockpitVisibility] = useState<CockpitVisibility>(() =>
    loadCockpitVisibility(),
  );
  const [visorPhotos, setVisorPhotos] = useState<VisorPhotoItem[]>([]);
  const [playlistItems, setPlaylistItems] = useState<readonly RadioPlaylistEntry[]>(() =>
    library.items.map((it) => ({
      id: it.id,
      title: it.beatMap.title,
      artist: it.beatMap.artist,
      bpm: it.beatMap.bpm,
    })),
  );

  const [debugOpen, setDebugOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const hasDebugParam = params.has('debug') || params.has('profiler');
    if (hasDebugParam) loadSavedTuning();
    return hasDebugParam;
  });

  const [inspectorOpen, setInspectorOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('analyze');
  });

  const [trackLoaderOpen, setTrackLoaderOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('deck') || params.has('tracks');
  });

  // Sync telemetric quick options
  useEffect(() => {
    return bridge.onEvent((event) => {
      if (event.type === 'autoShiftToggled') {
        setAutoShift(event.enabled);
      } else if (event.type === 'tofuModeToggled') {
        setTofuMode(event.active);
      } else if (event.type === 'sodaSkinChanged') {
        setSodaSkin(event.skin);
      } else if (event.type === 'pauseChanged') {
        setIsPaused(event.paused);
      }
    });
  }, [bridge]);

  // Audio unlock listener on first user gesture
  useEffect(() => {
    if (audioUnlocked) return;
    const onGesture = () => {
      if (!audio.unlocked) {
        void audio.unlock().then(() => setAudioUnlocked(true));
      }
    };
    window.addEventListener('keydown', onGesture, { passive: true });
    window.addEventListener('pointerdown', onGesture, { passive: true });
    return () => {
      window.removeEventListener('keydown', onGesture);
      window.removeEventListener('pointerdown', onGesture);
    };
  }, [audio, audioUnlocked]);

  const openTrackLoader = useCallback((initialSelect: boolean) => {
    wasPausedBeforeModalRef.current = gameRef.current?.paused ?? false;
    trackLoaderOpeningRef.current = true;
    gameRef.current?.setPaused(true);
    setIsPaused(true);
    setIsInitialSelect(initialSelect);
    setTrackLoaderOpen(true);
  }, []);

  const closeTrackLoader = useCallback(() => {
    audio.stopPreview(gameStarted);
    setIsInitialSelect(false);
    setTrackLoaderOpen(false);
  }, [audio, gameStarted]);

  const handleStartDrive = useCallback(() => {
    audio.stopPreview(false, false);
    setGameStarted(true);
    setIsInitialSelect(false);
    setTrackLoaderOpen(false);
    wasPausedBeforeModalRef.current = false;
    audio.restartFromBeginning();
    gameRef.current?.resetPerfBenchmark();
    gameRef.current?.setPaused(false);
    setIsPaused(false);
    void audio.unlock().then(() => {
      setAudioUnlocked(true);
    });
  }, [audio]);

  const handleReturnToMainMenu = () => {
    audio.stopPreview(false);
    setGameStarted(false);
    setIsInitialSelect(false);
    setTrackLoaderOpen(false);
    wasPausedBeforeModalRef.current = true;
    void audio.pause();
    gameRef.current?.restartPlaylistRun();
    gameRef.current?.setPaused(true);
    setIsPaused(true);
  };

  const handleResumeFromTrackLoader = () => {
    audio.stopPreview(gameStarted, !gameStarted);
    setIsInitialSelect(false);
    setTrackLoaderOpen(false);
    if (gameStarted) {
      wasPausedBeforeModalRef.current = false;
      gameRef.current?.setPaused(false);
      setIsPaused(false);
    }
  };

  useEffect(() => {
    const isModalOpen = trackLoaderOpen || inspectorOpen;
    if (isModalOpen) {
      if (!wasModalOpenRef.current) {
        if (trackLoaderOpeningRef.current) {
          trackLoaderOpeningRef.current = false;
        } else {
          wasPausedBeforeModalRef.current = gameRef.current?.paused ?? false;
          if (!gameRef.current?.paused) {
            gameRef.current?.setPaused(true);
          }
        }
      }
      wasModalOpenRef.current = true;
    } else {
      const wasOpen = wasModalOpenRef.current;
      wasModalOpenRef.current = false;
      trackLoaderOpeningRef.current = false;
      if (wasOpen && preloadReady && gameStarted && !isInitialSelect) {
        if (!wasPausedBeforeModalRef.current) {
          gameRef.current?.setPaused(false);
        }
      }
    }
  }, [trackLoaderOpen, inspectorOpen, preloadReady, gameStarted, isInitialSelect]);

  const loadTestTrack = useCallback(
    async (query: string): Promise<boolean> => {
      try {
        const gtRes = await fetch('/test-tracks/ground-truth.json');
        if (!gtRes.ok) return false;
        const gtData = (await gtRes.json()) as {
          tracks?: Array<{ file?: string; notes?: string }>;
        };
        const norm = query.trim().toLowerCase();
        const entry = gtData.tracks?.find(
          (t) =>
            (t.file && t.file.toLowerCase().includes(norm)) ||
            (t.notes && t.notes.toLowerCase().includes(norm)),
        );
        if (!entry?.file) return false;

        const audioRes = await fetch(`/test-tracks/${encodeURIComponent(entry.file)}`);
        if (!audioRes.ok) return false;
        const blob = await audioRes.blob();
        const mime = entry.file.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
        const file = new File([blob], entry.file, { type: mime });
        const imported = await library.importFiles([file]);
        const item = imported[0];
        if (!item) return false;

        audio.loadTrack(item.beatMap, item.audioBuffer);
        gameRef.current?.loadBeatMapRoad(item.beatMap, true);
        return true;
      } catch {
        return false;
      }
    },
    [audio, library],
  );

  useEffect(() => {
    void preloader
      .preloadAll((p) => {
        setPreloadProgress({ ...p });
      })
      .then(async () => {
        await library.loadBundledDefaults();
        setPreloadReady(true);
        const params = new URLSearchParams(window.location.search);
        const trackQuery = params.get('track') ?? params.get('testTrack');
        if (trackQuery && trackQuery.trim().length > 0) {
          await loadTestTrack(trackQuery);
        }
      });
  }, [preloader, library, loadTestTrack]);

  useEffect(() => {
    const task = visorQueueRef.current.then(async () => {
      const items = await loadVisorPhotos();
      visorPhotosRef.current = items;
      setVisorPhotos(items);
    });
    visorQueueRef.current = task.catch(() => undefined);
  }, []);

  useEffect(() => {
    const syncPlaylist = () => {
      setPlaylistItems(
        library.items.map((it) => ({
          id: it.id,
          title: it.beatMap.title,
          artist: it.beatMap.artist,
          bpm: it.beatMap.bpm,
        })),
      );
    };
    syncPlaylist();
    return library.subscribe(syncPlaylist);
  }, [library]);

  const handleToggleCockpitModule = useCallback((key: keyof CockpitVisibility) => {
    setCockpitVisibility((prev) => {
      const nextVal = !prev[key];
      const next: CockpitVisibility =
        key === 'showCassetteWidget'
          ? { ...prev, showCassetteWidget: nextVal, showRadioConsole: nextVal }
          : { ...prev, [key]: nextVal };
      saveCockpitVisibility(next);
      return next;
    });
  }, []);

  const handleApplyCockpitPreset = useCallback((preset: CockpitVisibility) => {
    const next = { ...preset };
    saveCockpitVisibility(next);
    setCockpitVisibility(next);
  }, []);

  const handleAddVisorPhoto = useCallback(async (file: File) => {
    const task = visorQueueRef.current.then(async () => {
      try {
        const next = await addVisorPhotoFile(file, visorPhotosRef.current);
        visorPhotosRef.current = next;
        setVisorPhotos(next);
      } catch {
        // Ignore invalid or unreadable image files
      }
    });
    visorQueueRef.current = task.catch(() => undefined);
    await task;
  }, []);

  const handleAddVisorPhotos = useCallback(async (files: readonly File[]) => {
    const task = visorQueueRef.current.then(async () => {
      try {
        const next = await addVisorPhotoFiles(files, visorPhotosRef.current);
        visorPhotosRef.current = next;
        setVisorPhotos(next);
      } catch {
        // Ignore invalid or unreadable image files
      }
    });
    visorQueueRef.current = task.catch(() => undefined);
    await task;
  }, []);

  const handleRemoveVisorPhoto = useCallback(async (id: string) => {
    const task = visorQueueRef.current.then(async () => {
      const next = await removeVisorPhoto(id, visorPhotosRef.current);
      visorPhotosRef.current = next;
      setVisorPhotos(next);
    });
    visorQueueRef.current = task.catch(() => undefined);
    await task;
  }, []);

  const handleClearVisorPhotos = useCallback(async () => {
    const task = visorQueueRef.current.then(async () => {
      await clearVisorPhotos();
      visorPhotosRef.current = [];
      setVisorPhotos([]);
    });
    visorQueueRef.current = task.catch(() => undefined);
    await task;
  }, []);

  useEffect(() => {
    return () => {
      audio.dispose();
      library.dispose();
      delete window.__MAYONAKA_DIAG__;
    };
  }, [audio, library]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F2' || e.code === 'Backquote') {
        e.preventDefault();
        setDebugOpen((prev) => !prev);
      } else if (e.code === 'F4') {
        e.preventDefault();
        gameRef.current?.toggleAutopilot();
      } else if (e.code === 'Escape') {
        if (trackLoaderOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeTrackLoader();
        } else if (inspectorOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setInspectorOpen(false);
        } else if (debugOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setDebugOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [inspectorOpen, trackLoaderOpen, debugOpen, closeTrackLoader]);

  const handleSelectTrack = useCallback(
    (item: PlaylistItem) => {
      void audio.unlock().then(() => setAudioUnlocked(true));
      audio.loadTrack(item.beatMap, item.audioBuffer);
      gameRef.current?.loadBeatMapRoad(item.beatMap, true);
    },
    [audio],
  );

  const handleOpenDeckModal = useCallback(() => {
    openTrackLoader(false);
  }, [openTrackLoader]);

  const handleToggleAutoShiftCallback = useCallback(() => {
    gameRef.current?.toggleAutoShift();
  }, []);

  const handleUpdateBeatMap = (contentHash: string, updated: BeatMap) => {
    void library.updateBeatMap(contentHash, updated);
    if (audio.beatMap.contentHash === contentHash) {
      audio.updateBeatMap(updated);
      gameRef.current?.loadBeatMapRoad(updated, !gameStarted);
    }
  };

  const gameplayInputEnabled =
    gameStarted && !isPaused && !trackLoaderOpen && !inspectorOpen && !runSummaryOpen;

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[var(--ff-ink)]">
      <div className="relative aspect-video max-h-full max-w-full w-full overflow-hidden">
        <CanvasStage
          bridge={bridge}
          audio={audio}
          library={library}
          preloader={preloader}
          inputEnabled={gameplayInputEnabled}
          onGameReady={(game) => {
            gameRef.current = game;
            const params = new URLSearchParams(window.location.search);
            const stageParam = params.get('stage') ?? params.get('palette');
            if (stageParam !== null) {
              const norm = stageParam.trim().toLowerCase();
              const namedMap: Record<string, number> = {
                night: 0,
                mayonaka: 0,
                sunset: 1,
                og_future_funk: 1,
                akiba_night: 2,
                weeb_funk: 2,
                akiba: 2,
                vaporfunk: 3,
              };
              const idx = norm in namedMap ? namedMap[norm]! : parseInt(norm, 10);
              if (!Number.isNaN(idx)) {
                game.setStagePaletteIndex(idx);
              }
            }
            if (params.has('nobg')) game.renderBg = false;
            if (params.has('noroad')) game.renderRoad = false;
            if (params.has('noprops')) game.renderProps = false;
            if (params.has('nowires')) game.renderPylonWires = false;
            if (params.has('notraffic')) game.renderTraffic = false;
            if (params.has('nocar')) game.renderCar = false;
            if (params.has('syncprobe')) game.syncGpuProbe = true;
            if (params.has('legacy')) game.legacyRaster = true;
            if (params.has('autopilot')) {
              const apVal = params.get('autopilot')?.trim().toLowerCase();
              const mode: AutopilotMode =
                apVal === 'aggressive' || apVal === 'relaxed' ? apVal : 'perfect';
              game.setAutopilotMode(mode);
              if (!game.isAutopilotActive) {
                game.toggleAutopilot();
              }
            }
            window.__MAYONAKA_DIAG__ = {
              getSnapshot: () => bridge.getSnapshot(),
              getFullReport: () => game.getBenchmarkReport(),
              resetBenchmark: () => game.resetPerfBenchmark(),
              setIsolation: (opts) => {
                if (opts.renderBg !== undefined) game.renderBg = opts.renderBg;
                if (opts.renderRoad !== undefined) game.renderRoad = opts.renderRoad;
                if (opts.renderProps !== undefined) game.renderProps = opts.renderProps;
                if (opts.renderPylonWires !== undefined) {
                  game.renderPylonWires = opts.renderPylonWires;
                }
                if (opts.renderTraffic !== undefined) game.renderTraffic = opts.renderTraffic;
                if (opts.renderCar !== undefined) game.renderCar = opts.renderCar;
                if (opts.renderParticles !== undefined) {
                  game.renderParticles = opts.renderParticles;
                }
                if (opts.syncGpuProbe !== undefined) game.syncGpuProbe = opts.syncGpuProbe;
                if (opts.legacyRaster !== undefined) game.legacyRaster = opts.legacyRaster;
                game.resetPerfBenchmark();
              },
              seekToBar: (barIndex: number) => game.seekToBar(barIndex),
              loadTestTrack,
              triggerForkTest: () => game.triggerForkTest(),
              triggerNextSongTest: () => game.triggerNextSongTest(),
              triggerOffRoadTest: () => game.triggerOffRoadTest(),
              triggerTruckCollisionTest: () => game.triggerTruckCollisionTest(),
              game,
            };
            if (trackLoaderOpen || inspectorOpen || !gameStarted || isInitialSelect) {
              game.setPaused(true);
            }
            setIsPaused(game.paused);
            game.setInputLocked(!gameplayInputEnabled);
          }}
        />
        <HUD
          bridge={bridge}
          debugOpen={debugOpen}
          gameStarted={gameStarted}
          trackLoaderOpen={trackLoaderOpen}
          inspectorOpen={inspectorOpen}
          crtEnabled={crtEnabled}
          hideBezel={noBezel}
          minimalPerfOnly={noHud}
          hideCassette={noCassette}
          hideVfd={noVfd}
          cockpitVisibility={cockpitVisibility}
          onToggleCockpitModule={handleToggleCockpitModule}
          onApplyCockpitPreset={handleApplyCockpitPreset}
          visorPhotos={visorPhotos}
          onAddVisorPhoto={handleAddVisorPhoto}
          onAddVisorPhotos={handleAddVisorPhotos}
          onRemoveVisorPhoto={handleRemoveVisorPhoto}
          onClearVisorPhotos={handleClearVisorPhotos}
          playlistItems={playlistItems}
          library={library}
          audio={audio}
          onSelectTrack={handleSelectTrack}
          onUpdateBeatMap={handleUpdateBeatMap}
          onPreviewUnlocked={() => setAudioUnlocked(true)}
          onToggleCrt={() => setCrtEnabled((prev) => !prev)}
          onTogglePause={() => gameRef.current?.togglePause()}
          onToggleAutoShift={handleToggleAutoShiftCallback}
          onToggleTofuMode={() => gameRef.current?.toggleTofuMode()}
          onCycleSodaSkin={() => gameRef.current?.cycleSodaSkin()}
          onToggleAutopilot={() => gameRef.current?.toggleAutopilot()}
          onToggleDebug={() => setDebugOpen((prev) => !prev)}
          onOpenTrackLoader={handleOpenDeckModal}
          onOpenInspector={() => setInspectorOpen(true)}
          onRestartRun={() => gameRef.current?.restartPlaylistRun()}
          onReturnToMainMenu={handleReturnToMainMenu}
        />
        <RadioSelector
          bridge={bridge}
          library={library}
          onRestartRun={() => gameRef.current?.restartPlaylistRun()}
          onOpenTrackLoader={() => openTrackLoader(false)}
          onSelectForkBranch={(branch) => gameRef.current?.selectForkBranch(branch)}
          onRunSummaryOpenChange={setRunSummaryOpen}
        />
        <CRTOverlay enabled={crtEnabled} />
        <DebugPanel
          open={debugOpen}
          onClose={() => setDebugOpen(false)}
          bridge={bridge}
          onSelectPalette={(idx) => gameRef.current?.setStagePaletteIndex(idx)}
          onToggleAutopilot={() => gameRef.current?.toggleAutopilot()}
          onSetAutopilotMode={(mode: AutopilotMode) => gameRef.current?.setAutopilotMode(mode)}
        />
        <TrackLoader
          open={trackLoaderOpen}
          library={library}
          audio={audio}
          isInitialSelect={isInitialSelect}
          onStartDrive={handleStartDrive}
          onResumeDrive={handleResumeFromTrackLoader}
          onSelectTrack={handleSelectTrack}
          onUpdateBeatMap={handleUpdateBeatMap}
          onPreviewUnlocked={() => setAudioUnlocked(true)}
          onClose={closeTrackLoader}
        />
        {inspectorOpen && <BeatMapInspector onClose={() => setInspectorOpen(false)} />}
        {!gameStarted && !inspectorOpen && !trackLoaderOpen && (
          <MainMenu
            progress={preloadProgress}
            ready={preloadReady}
            audioUnlocked={audioUnlocked}
            currentTrackTitle={audio.beatMap.title}
            currentTrackBpm={audio.beatMap.bpm}
            playlistCount={playlistItems.length}
            activeTrackIndex={library.currentIndex}
            library={library}
            audio={audio}
            onSelectTrack={handleSelectTrack}
            onUpdateBeatMap={handleUpdateBeatMap}
            onPreviewUnlocked={() => setAudioUnlocked(true)}
            onStartDrive={handleStartDrive}
            onOpenCassetteDeck={() => openTrackLoader(true)}
            onUnlockAudio={() => {
              void audio.unlock().then(() => setAudioUnlocked(true));
            }}
            autoShift={autoShift}
            onToggleAutoShift={() => {
              gameRef.current?.toggleAutoShift();
            }}
            tofuMode={tofuMode}
            onToggleTofuMode={() => {
              gameRef.current?.toggleTofuMode();
            }}
            sodaSkin={sodaSkin}
            onCycleSodaSkin={() => {
              gameRef.current?.cycleSodaSkin();
            }}
            crtEnabled={crtEnabled}
            onToggleCrt={() => setCrtEnabled((prev) => !prev)}
            cockpitVisibility={cockpitVisibility}
            visorPhotos={visorPhotos}
            onToggleCockpitModule={handleToggleCockpitModule}
            onApplyCockpitPreset={handleApplyCockpitPreset}
            onAddVisorPhoto={handleAddVisorPhoto}
            onAddVisorPhotos={handleAddVisorPhotos}
            onRemoveVisorPhoto={handleRemoveVisorPhoto}
            onClearVisorPhotos={handleClearVisorPhotos}
          />
        )}
      </div>
    </main>
  );
}
