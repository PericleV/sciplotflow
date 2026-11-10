// The zoom tools of a graph: Zoom (a rectangle, the wheel), Pan (drag the view), Rescale (all the data again). Esc
// turns Zoom / Pan off. scaled: a node's working graph — the scale of X and of Y (linear, log, log |v|; graphScale.ts),
// kept with the node, the view rescaled when one changes (the scales the graph has by itself, when given: kept as none).
import { useEffect } from 'react';
import type { ZoomMode } from './plotZoom.ts';
import { PanIcon, ZoomIcon } from './icons.tsx';
import { RotateCcw } from 'lucide-react';
import { IC } from './iconProps.ts';
import { AXIS_SCALES, type AxisScale, type GraphScale } from './graphScale.ts';
import { useGraphScale } from './useGraphScale.ts';

// onRescaleAxis: Rescale X and Rescale Y (only one direction automatic again), where the graph offers them; fitNew:
// they fit that direction to the curves as they come out (always on)
export function ZoomTools({ mode, setMode, onRescale, onZoomOut, zoomed, onRescaleAxis, fitNew, scaled }: { mode: ZoomMode; setMode: (m: ZoomMode) => void; onRescale: () => void; onZoomOut: () => void; zoomed: boolean; onRescaleAxis?: (which: 'x' | 'y') => void; fitNew?: boolean; scaled?: boolean | GraphScale }) {
  const [sc, setSc] = useGraphScale();
  // (the scales a graph has by itself: a spectrum's log X)
  const own: GraphScale = typeof scaled === 'object' ? scaled : {};
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
          <button className="nodrag" disabled={!zoomed && !fitNew} title={fitNew ? 'Rescale X: fitted to the new curves (Y as it is)' : 'Only X: its limits automatic again (Y as it is)'} onClick={() => onRescaleAxis('x')}>
            <RotateCcw {...IC} /> X
          </button>
          <button className="nodrag" disabled={!zoomed && !fitNew} title={fitNew ? 'Rescale Y: fitted to the new curves (X as it is)' : 'Only Y: its limits automatic again (X as it is)'} onClick={() => onRescaleAxis('y')}>
            <RotateCcw {...IC} /> Y
          </button>
        </>
      )}
      {scaled &&
        (['x', 'y'] as const).map((a) => (
          <select
            key={a}
            className={`nodrag graph-scale${(sc[a] ?? own[a] ?? 'lin') !== 'lin' ? ' on' : ''}`}
            value={sc[a] ?? own[a] ?? 'lin'}
            title={`The scale of ${a.toUpperCase()} on this graph: linear, log (the values ≤ 0 not drawn) or log of the absolute value (negative values drawn by their size; 0 not drawn). Only as drawn: the data and the outputs of the node as they are`}
            onChange={(e) => {
              const v = e.target.value as AxisScale;
              setSc({ ...sc, [a]: v === (own[a] ?? 'lin') ? undefined : v });
              onRescale();
            }}
          >
            {AXIS_SCALES.map(([v, l]) => (
              <option key={v} value={v}>
                {a.toUpperCase()}: {v === 'abslog' ? `log |${a}|` : l}
              </option>
            ))}
          </select>
        ))}
    </span>
  );
}
