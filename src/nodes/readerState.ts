// The data reader of the graphs in the nodes (CanvasReader.tsx): on, the mode, the curve read ('' the nearest; else its
// number), the last reading.
import type { ReaderMode } from './FigureReader.tsx';

export type ReaderState = { on: boolean; mode: ReaderMode; curve: string; reading: string };
export const READER_OFF: ReaderState = { on: false, mode: 'snap', curve: '', reading: '' };
