import type { BeatMap } from '@src/audio/BeatMap';
import { FunkAudioEngine } from '@src/audio/FunkAudioEngine';
import { TrackLibrary, type PlaylistItem } from '@src/audio/TrackLibrary';
import { TELEMETRY_HZ } from '@src/config/constants';
import { AssetPreloader, type PreloadProgress } from '@src/core/AssetPreloader';
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
  const gameRef = useRef<Game | null>(null);

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

  useEffect(() => {
    if (trackLoaderOpen || inspectorOpen) {
      gameRef.current?.setPaused(true);
    } else if (preloadReady) {
      gameRef.current?.setPaused(false);
    }
  }, [trackLoaderOpen, inspectorOpen, preloadReady]);

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
      } else if (e.code === 'KeyM' && !inspectorOpen) {
        e.preventDefault();
        setTrackLoaderOpen((prev) => !prev);
      } else if (e.code === 'Escape') {
        setTrackLoaderOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspectorOpen]);

  const handleSelectTrack = (item: PlaylistItem) => {
    void audio.unlock();
    audio.loadTrack(item.beatMap, item.audioBuffer);
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
            if (trackLoaderOpen || inspectorOpen) {
              game.setPaused(true);
            }
          }}
        />
        <HUD
          bridge={bridge}
          debugOpen={debugOpen}
          onToggleDebug={() => setDebugOpen((prev) => !prev)}
          onOpenTrackLoader={() => setTrackLoaderOpen(true)}
          onOpenInspector={() => setInspectorOpen(true)}
          onRestartRun={() => gameRef.current?.restartPlaylistRun()}
        />
        <RadioSelector
          bridge={bridge}
          library={library}
          onRestartRun={() => gameRef.current?.restartPlaylistRun()}
          onOpenTrackLoader={() => setTrackLoaderOpen(true)}
        />
        <CRTOverlay />
        <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} bridge={bridge} />
        <TrackLoader
          open={trackLoaderOpen}
          library={library}
          onSelectTrack={handleSelectTrack}
          onUpdateBeatMap={handleUpdateBeatMap}
          onClose={() => setTrackLoaderOpen(false)}
        />
        {inspectorOpen && <BeatMapInspector onClose={() => setInspectorOpen(false)} />}
        {!inspectorOpen && (
          <LoadingScreen
            progress={preloadProgress}
            ready={preloadReady}
            onStart={() => {
              void audio.unlock();
            }}
          />
        )}
      </div>
    </main>
  );
}
