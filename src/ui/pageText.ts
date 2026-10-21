// The default text of the figure the objects being edited are on (what “auto” is in their text settings), when known.
import { createContext } from 'react';
import type { TextDefaults } from '../figure/spec.ts';

export const PageTextContext = createContext<TextDefaults | null>(null);
