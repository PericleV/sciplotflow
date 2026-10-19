// Small one-colour icons for the buttons: Lucide's (ISC licence), drawn in the colour of the text, at the size of the
// text (as the symbols they replaced), unlike the coloured emoji of the system.
import { Lock, LockOpen, Move, Pin, ZoomIn, ZoomOut } from 'lucide-react';
import { IC } from './iconProps.ts';

// a pin (keep this in place)
export const PinIcon = () => <Pin {...IC} />;
// a lock, closed or open
export const LockIcon = ({ open = false }: { open?: boolean }) => (open ? <LockOpen {...IC} /> : <Lock {...IC} />);
// four arrows (move the view)
export const PanIcon = () => <Move {...IC} />;
// a magnifier (zoom), with − for zooming out
export const ZoomIcon = ({ out = false }: { out?: boolean }) => (out ? <ZoomOut {...IC} /> : <ZoomIn {...IC} />);
