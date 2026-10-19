// The figure's numbers with a decimal comma (2,5): its own setting (Page ▸ Decimal comma), given to the numbers it
// writes (RichText marked num).
import { createContext } from 'react';

export const CommaContext = createContext(false);
// a written number's decimal point as a comma (between digits only: 2.5 → 2,5, 1.5×10^{3} → 1,5×10^{3}; “v.2” kept)
export const commaNumbers = (s: string) => s.replace(/(\d)\.(\d)/g, '$1,$2');
