import type { BeatMap } from '@src/audio/BeatMap';
import { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import { TrackLibrary, type PlaylistItem } from '@src/audio/TrackLibrary';
import { TELEMETRY_HZ } from '@src/config/constants';
import { AssetPreloader, type PreloadProgress } from '@src/core/AssetPreloader';
import type { AutopilotMode } from '@src/core/AutopilotDriver';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { Game, GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import type { SodaSkin } from '@src/entities/MelonSoda';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BeatMapInspector } from './ui/BeatMapInspector';
import { CanvasStage } from './ui/CanvasStage';
import { CRTOverlay } from './ui/CRTOverlay';
import { DebugPanel, loadSavedTuning } from './ui/DebugPanel';
import { HUD } from './ui/HUD';
import { MainMenu } from './ui/MainMenu';
import { RadioSelector } from './ui/RadioSelector';
import { TrackLoader } from './ui/TrackLoader';

export function App() {
  const [bridge] = useState(() => new TelemetryBridge<TelemetrySnapshot, GameEvent>(TELEMETRY_HZ));
  const [audio] = useState(() => new FunkAudioEngine());
  const [library] = useState(() => new TrackLibrary());
  const [preloader] = useState(() => new AssetPreloader());
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress>(() => preloader.progress);
  const [preloadReady, setPreloadReady] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(() => audio.unlocked);
  const [gameStarted, setGameStarted] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('autostart');
  });
  const [isInitialSelect, setIsInitialSelect] = useState(false);
  const gameRef = useRef<Game | null>(null);
  const wasPausedBeforeModalRef = useRef(false);

  // Quick settings state
  const [crtEnabled, setCrtEnabled] = useState(true);
  const [autoShift, setAutoShift] = useState(false);
  const [tofuMode, setTofuMode] = useState(false);
  const [sodaSkin, setSodaSkin] = useState<SodaSkin>('melon-soda');
  const [cleanHud, setCleanHud] = useState(false);

  const [debugOpen, setDebugOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const hasDebugParam = params.has('debug');
    if (hasDebugParam) loadSavedTuning();
    return hasDebugParam;
  });

  const [inspectorOpen, setInspectorOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('analyze');
  });

  const [trackLoaderOpen, setTrackLoaderOpen] = useState(false);

  // Sync telemetric quick options
  useEffect(() => {
    return bridge.onEvent((event) => {
      if (event.type === 'autoShiftToggled') {
        setAutoShift(event.enabled);
      } else if (event.type === 'tofuModeToggled') {
        setTofuMode(event.active);
      } else if (event.type === 'sodaSkinChanged') {
        setSodaSkin(event.skin);
      }
    });
  }, [bridge]);

  // Audio unlock listener on first user gesture
  useEffect(() => {
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
  }, [audio]);

  const handleStartDrive = useCallback(() => {
    setGameStarted(true);
    setIsInitialSelect(false);
    setTrackLoaderOpen(false);
    wasPausedBeforeModalRef.current = false;
    void audio.unlock().then(() => setAudioUnlocked(true));
    gameRef.current?.setPaused(false);
  }, [audio]);

  const handleReturnToMainMenu = () => {
    setGameStarted(false);
    setIsInitialSelect(false);
    setTrackLoaderOpen(false);
    wasPausedBeforeModalRef.current = true;
    void audio.pause();
    gameRef.current?.restartPlaylistRun();
    gameRef.current?.setPaused(true);
  };

  const handleResumeFromTrackLoader = () => {
    setIsInitialSelect(false);
    setTrackLoaderOpen(false);
    wasPausedBeforeModalRef.current = false;
    gameRef.current?.setPaused(false);
  };

  useEffect(() => {
    if (trackLoaderOpen || inspectorOpen) {
      wasPausedBeforeModalRef.current = gameRef.current?.paused ?? false;
      gameRef.current?.setPaused(true);
    } else if (preloadReady && gameStarted && !isInitialSelect) {
      if (!wasPausedBeforeModalRef.current) {
        gameRef.current?.setPaused(false);
      }
    }
  }, [trackLoaderOpen, inspectorOpen, preloadReady, gameStarted, isInitialSelect]);

  useEffect(() => {
    void preloader
      .preloadAll((p) => {
        setPreloadProgress({ ...p });
      })
      .then(() => {
        setPreloadReady(true);
      });
  }, [preloader]);

  useEffect(() => {
    return () => {
      audio.dispose();
      library.dispose();
    };
  }, [audio, library]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F2' || e.code === 'Backquote') {
        e.preventDefault();
        setDebugOpen((prev) => !prev);
      } else if (e.code === 'KeyM' && !inspectorOpen && gameStarted) {
        e.preventDefault();
        if (trackLoaderOpen) {
          if (isInitialSelect) {
            handleStartDrive();
          } else {
            setTrackLoaderOpen(false);
          }
        } else {
          setIsInitialSelect(false);
          setTrackLoaderOpen(true);
        }
      } else if (e.code === 'F4') {
        e.preventDefault();
        gameRef.current?.toggleAutopilot();
      } else if (e.code === 'Escape') {
        if (trackLoaderOpen) {
          e.preventDefault();
          e.stopPropagation();
          if (isInitialSelect) {
            handleStartDrive();
          } else {
            setTrackLoaderOpen(false);
          }
        } else if (inspectorOpen) {
          e.preventDefault();
          e.stopPropagation();
          setInspectorOpen(false);
        } else if (debugOpen) {
          e.preventDefault();
          e.stopPropagation();
          setDebugOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [inspectorOpen, trackLoaderOpen, debugOpen, gameStarted, isInitialSelect, handleStartDrive]);

  const handleSelectTrack = (item: PlaylistItem) => {
    void audio.unlock().then(() => setAudioUnlocked(true));
    audio.loadTrack(item.beatMap, item.audioBuffer);
    gameRef.current?.loadBeatMapRoad(item.beatMap, true);
  };

  const handleUpdateBeatMap = (contentHash: string, updated: BeatMap) => {
    void library.updateBeatMap(contentHash, updated);
    if (audio.beatMap.contentHash === contentHash) {
      audio.updateBeatMap(updated);
    }
  };

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#060112]">
      <div className="relative aspect-video max-h-full max-w-full w-full overflow-hidden">
        <CanvasStage
          bridge={bridge}
          audio={audio}
          library={library}
          preloader={preloader}
          onGameReady={(game) => {
            gameRef.current = game;
            if (trackLoaderOpen || inspectorOpen || !gameStarted || isInitialSelect) {
              game.setPaused(true);
            }
          }}
        />
        <HUD
          bridge={bridge}
          debugOpen={debugOpen}
          gameStarted={gameStarted}
          trackLoaderOpen={trackLoaderOpen}
          inspectorOpen={inspectorOpen}
          onToggleDebug={() => setDebugOpen((prev) => !prev)}
          onOpenTrackLoader={() => {
            setIsInitialSelect(false);
            setTrackLoaderOpen(true);
          }}
          onOpenInspector={() => setInspectorOpen(true)}
          onRestartRun={() => gameRef.current?.restartPlaylistRun()}
          onReturnToMainMenu={handleReturnToMainMenu}
        />
        <RadioSelector
          bridge={bridge}
          library={library}
          onRestartRun={() => gameRef.current?.restartPlaylistRun()}
          onOpenTrackLoader={() => {
            setIsInitialSelect(false);
            setTrackLoaderOpen(true);
          }}
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
          isInitialSelect={isInitialSelect}
          onStartDrive={handleStartDrive}
          onResumeDrive={handleResumeFromTrackLoader}
          onSelectTrack={handleSelectTrack}
          onUpdateBeatMap={handleUpdateBeatMap}
          onClose={() => {
            if (isInitialSelect) {
              handleStartDrive();
            } else {
              setTrackLoaderOpen(false);
            }
          }}
        />
        {inspectorOpen && <BeatMapInspector onClose={() => setInspectorOpen(false)} />}
        {!gameStarted && !inspectorOpen && (
          <MainMenu
            progress={preloadProgress}
            ready={preloadReady}
            audioUnlocked={audioUnlocked}
            currentTrackTitle={audio.beatMap.title}
            currentTrackBpm={audio.beatMap.bpm}
            onStartDrive={handleStartDrive}
            onOpenCassetteDeck={() => {
              void audio.unlock().then(() => setAudioUnlocked(true));
              setIsInitialSelect(false);
              setTrackLoaderOpen(true);
            }}
            onOpenInspector={() => setInspectorOpen(true)}
            onUnlockAudio={() => {
              void audio.unlock().then(() => setAudioUnlocked(true));
            }}
            autoShift={autoShift}
            onToggleAutoShift={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', bubbles: true }));
              window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG', bubbles: true }));
            }}
            tofuMode={tofuMode}
            onToggleTofuMode={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true }));
              window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyT', bubbles: true }));
            }}
            sodaSkin={sodaSkin}
            onCycleSodaSkin={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', bubbles: true }));
              window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV', bubbles: true }));
            }}
            cleanHud={cleanHud}
            onToggleCleanHud={() => setCleanHud((prev) => !prev)}
            crtEnabled={crtEnabled}
            onToggleCrt={() => setCrtEnabled((prev) => !prev)}
          />
        )}
      </div>
    </main>
  );
}
