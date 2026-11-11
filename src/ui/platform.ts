// The keys of the computer the app runs on. On a Mac a Ctrl + click is a right click (the browser opens the context menu
// with it, and still sends the press and the click), and the key that adds to a selection is Command; elsewhere Ctrl
// (or the Windows key's Meta) adds.
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent);

type Keys = { ctrlKey: boolean; metaKey: boolean };
// the press or click of a right click made with Ctrl on a Mac: left to the context menu, not a selection
export const macMenuClick = (e: Keys) => IS_MAC && e.ctrlKey;
// the key that adds to a selection (or takes out of it): Command on a Mac, Ctrl (or Meta) elsewhere
export const addKey = (e: Keys) => (IS_MAC ? e.metaKey : e.ctrlKey || e.metaKey);
