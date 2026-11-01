import { TELEMETRY_HZ } from '@src/config/constants';
import { TelemetryBridge } from '@src/core/TelemetryBridge';
import type { GameEvent, TelemetrySnapshot } from '@src/engine/Game';
import { useEffect, useState } from 'react';
import { CanvasStage } from './ui/CanvasStage';
import { DebugPanel, loadSavedTuning } from './ui/DebugPanel';
import { HUD } from './ui/HUD';

export function App() {
  const [bridge] = useState(() => new TelemetryBridge<TelemetrySnapshot, GameEvent>(TELEMETRY_HZ));
  const [debugOpen, setDebugOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const hasDebugParam = params.has('debug');
    if (hasDebugParam) loadSavedTuning();
    return hasDebugParam;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F2' || e.code === 'Backquote') {
        e.preventDefault();
        setDebugOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#060112]">
      <div className="relative aspect-video max-h-full max-w-full w-full">
        <CanvasStage bridge={bridge} />
        <HUD
          bridge={bridge}
          debugOpen={debugOpen}
          onToggleDebug={() => setDebugOpen((prev) => !prev)}
        />
        <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
      </div>
    </main>
  );
}
