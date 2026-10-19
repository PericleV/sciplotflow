// The zoom tools of a graph: Zoom (a rectangle, the wheel), Pan (drag the view), Rescale (all the data again). Esc
// turns Zoom / Pan off.
import { useEffect } from 'react';
import type { ZoomMode } from './plotZoom.ts';
import { PanIcon, ZoomIcon } from './icons.tsx';
import { RotateCcw } from 'lucide-react';
import { IC } from './iconProps.ts';

// onRescaleAxis: Rescale X and Rescale Y (only one direction automatic again), where the graph offers them
export function ZoomTools({ mode, setMode, onRescale, onZoomOut, zoomed, onRescaleAxis }: { mode: ZoomMode; setMode: (m: ZoomMode) => void; onRescale: () => void; onZoomOut: () => void; zoomed: boolean; onRescaleAxis?: (which: 'x' | 'y') => void }) {
  useEffect(() => {
    if (mode === 'none') return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMode('none');
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [mode, setMode]);
  return (
    <span className="zoom-tools">
      <button className={`nodrag${mode === 'zoom' ? ' on' : ''}`} title="Zoom: drag a rectangle on the graph; the wheel zooms around the cursor (Shift: only X, Alt: only Y). Esc: off" onClick={() => setMode(mode === 'zoom' ? 'none' : 'zoom')}>
        <ZoomIcon /> Zoom
      </button>
      <button className={`nodrag${mode === 'pan' ? ' on' : ''}`} title="Pan: drag the graph to move the view; the wheel zooms. Esc: off" onClick={() => setMode(mode === 'pan' ? 'none' : 'pan')}>
        <PanIcon /> Pan
      </button>
      <button className="nodrag" title="Zoom out: every axis widened around its middle" onClick={onZoomOut}>
        <ZoomIcon out /> Out
      </button>
      <button className="nodrag" disabled={!zoomed} title="All the data again (Ctrl+A on the graph)" onClick={onRescale}>
        <RotateCcw {...IC} /> Rescale
      </button>
      {onRescaleAxis && (
        <>
          <button className="nodrag" disabled={!zoomed} title="Only X: its limits automatic again (Y as it is)" onClick={() => onRescaleAxis('x')}>
            <RotateCcw {...IC} /> X
          </button>
          <button className="nodrag" disabled={!zoomed} title="Only Y: its limits automatic again (X as it is)" onClick={() => onRescaleAxis('y')}>
            <RotateCcw {...IC} /> Y
          </button>
        </>
      )}
    </span>
  );
}
