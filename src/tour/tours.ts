// The guided tours (Welcome ▸ Tours): six, from simple to advanced, through every node — each a project of its own,
// chapters of steps (kit.ts); the window, the light and Show me are in TourPanel.tsx. And where a tour was left.
import { HOW } from './how.ts';
import { FIRST } from './first.ts';
import { PREPARE } from './prepare.ts';
import type { Tour } from './kit.ts';

export * from './kit.ts';
export { figureSaved, importWithData, plotOfImport, uvVisText } from './first.ts';
export { calibrationSheets, runsText } from './prepare.ts';

export const TOURS: Tour[] = [HOW, FIRST, PREPARE];
// the tours offered in the Welcome window (shown again 2026-10-25, with the tutorial first)
export const SHOW_TOURS = true;

// where a tour was left (this browser): its step and its project — taken up again from Welcome
export type TourProgress = { tour: string; step: number; project: string };
const PROGRESS = 'graph-flow:tour';
export function loadTourProgress(): TourProgress | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS) ?? 'null') as TourProgress | null;
    return p && typeof p.tour === 'string' && Number.isInteger(p.step) && typeof p.project === 'string' ? p : null;
  } catch {
    return null;
  }
}
export function saveTourProgress(p: TourProgress | null) {
  try {
    if (p) localStorage.setItem(PROGRESS, JSON.stringify(p));
    else localStorage.removeItem(PROGRESS);
  } catch {
    // storage unavailable: the tour starts again next time
  }
}
