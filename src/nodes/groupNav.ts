// Moving into and out of group nodes: the App gives the nodes a way to open a group, and the group whose inside is
// shown (its ports, for the Group input / output nodes there).
import { createContext, useContext } from 'react';
import type { GroupData } from '../types.ts';

export type GroupNav = { open: (id: string) => void; current: GroupData | null };
export const GroupNavContext = createContext<GroupNav>({ open: () => {}, current: null });
export const useGroupNav = () => useContext(GroupNavContext);
