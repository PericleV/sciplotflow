// The line styles as pictures, with their names: for the pickers of the properties panels.
import type { ReactNode } from 'react';
import type { Dash } from '../figure/spec.ts';
import { DashIcon } from './propIcons.tsx';

const DASH_NAMES: [Dash, string][] = [
  ['solid', 'solid'],
  ['dash', 'dash'],
  ['longdash', 'long dash'],
  ['shortdash', 'short dash'],
  ['dot', 'dot'],
  ['dashdot', 'dash-dot'],
  ['dashdotdot', 'dash-dot-dot'],
];
export const DASH_PICS = DASH_NAMES.map(([d, n]): [Dash, ReactNode, string] => [d, <DashIcon key={d} dash={d} />, n]);
