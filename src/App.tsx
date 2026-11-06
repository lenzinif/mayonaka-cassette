import type { BeatMap } from '@src/audio/BeatMap';
import { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import { TrackLibrary, type PlaylistItem } from '@src/audio/TrackLibrary';
import { TELEMETRY_HZ } from '@src/config/constants';
import { AssetPreloader, type PreloadProgress } from '@src/core/AssetPreloader';
import type { AutopilotMode } from '@src/core/AutopilotDriver';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { Game, GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { useEffect, useRef, useState } from 'react';
import { BeatMapInspector } from './ui/BeatMapInspector';
import { CanvasStage } from './ui/CanvasStage';
import { CRTOverlay } from './ui/CRTOverlay';
import { DebugPanel, loadSavedTuning } from './ui/DebugPanel';
import { HUD } from './ui/HUD';
import { LoadingScreen } from './ui/LoadingScreen';
import { RadioSelector } from './ui/RadioSelector';
import { TrackLoader } from './ui/TrackLoader';

export function App() {
  const [bridge] = useState(() => new TelemetryBridge<TelemetrySnapshot, GameEvent>(TELEMETRY_HZ));
  const [audio] = useState(() => new FunkAudioEngine());
  const [library] = useState(() => new TrackLibrary());
  const [preloader] = useState(() => new AssetPreloader());
  const [preloadProgress, setPreloadProgress] = useState<PreloadProgress>(() => preloader.progress);
  const [preloadReady, setPreloadReady] = useState(false);
  const [gameStarted, setGameStarted] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('autostart');
  });
  const [isInitialSelect, setIsInitialSelect] = useState(false);
  const gameRef = useRef<Game | null>(null);
  const wasPausedBeforeModalRef = useRef(false);

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

  const handleStartFromLoadingScreen = () => {
    setGameStarted(true);
    setIsInitialSelect(true);
    setTrackLoaderOpen(true);
    void audio.unlock();
  };

  const handleStartDrive = () => {
    setIsInitialSelect(false);
    setTrackLoaderOpen(false);
    wasPausedBeforeModalRef.current = false;
    gameRef.current?.setPaused(false);
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
  }, [inspectorOpen, trackLoaderOpen, debugOpen, gameStarted, isInitialSelect]);

  const handleSelectTrack = (item: PlaylistItem) => {
    void audio.unlock();
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
      <div className="relative aspect-video max-h-full max-w-full w-full">
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
          trackLoaderOpen={trackLoaderOpen}
          inspectorOpen={inspectorOpen}
          onToggleDebug={() => setDebugOpen((prev) => !prev)}
          onOpenTrackLoader={() => {
            setIsInitialSelect(false);
            setTrackLoaderOpen(true);
          }}
          onOpenInspector={() => setInspectorOpen(true)}
          onRestartRun={() => gameRef.current?.restartPlaylistRun()}
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
        <CRTOverlay />
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
          <LoadingScreen
            progress={preloadProgress}
            ready={preloadReady}
            onStart={handleStartFromLoadingScreen}
          />
        )}
      </div>
    </main>
  );
}
