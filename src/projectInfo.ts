// What a node needs to know of the whole project: the project as it is now (all levels, with its name and id) and the
// groups of the level shown — an exported figure carries them (src/figure/embed.ts).
import { createContext } from 'react';
import type { Project } from './project.ts';

export type ProjectInfo = { current: () => Project; id: string; path: string[] };
export const ProjectInfoContext = createContext<ProjectInfo | null>(null);
