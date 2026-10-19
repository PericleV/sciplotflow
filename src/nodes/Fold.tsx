// A section of options that folds (its title a button), remembered by its title while the page is open.
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { IC } from './iconProps.ts';

const opened = new Map<string, boolean>();
export function Fold({ title, children, closed = false }: { title: string; children: ReactNode; closed?: boolean }) {
  const [open, setOpen] = useState(opened.get(title) ?? !closed);
  return (
    <div className="de-section">
      <button
        className="nodrag de-section-head"
        onClick={() => {
          opened.set(title, !open);
          setOpen(!open);
        }}
      >
        {open ? <ChevronDown {...IC} /> : <ChevronRight {...IC} />} {title}
      </button>
      {open && <div className="de-section-body">{children}</div>}
    </div>
  );
}
