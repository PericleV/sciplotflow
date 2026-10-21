// Fields of the figure nodes: rich text with the Ω menu, text style (font, size, bold, italic, colour), tabs,
// optional colours.
import { useLayoutEffect, useRef, useState } from 'react';
import { SYMBOL_GROUPS } from '../figure/draw.ts';
import { FONTS, type TextStyle } from '../figure/spec.ts';
import { NumInput } from './ui.tsx';
import { CornerDownLeft, RotateCcw, Sigma, X } from 'lucide-react';
import { IC } from './iconProps.ts';

const RICH_HELP = 'Rich text: x^{2}, x_{i}, \\alpha, \\Delta, \\pm, \\bold{…}, \\italic{…}, \\size{12}{…}, \\color{#d62728}{…} (Ω: a colour chosen), \\\\ new line, $\\frac{a}{b}$ a LaTeX formula; Ω for symbols';

// A text box with the Ω menu (symbols, superscript, subscript, bold, italic, size, colour, new line).
export function RichInput({ value, onChange, placeholder, title, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; title?: string; multiline?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  // the menu kept inside the window: moved aside when it would stick out of it (a narrow panel at the window's edge)
  const pop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    el.style.transform = '';
    const r = el.getBoundingClientRect();
    const dx = r.left < 4 ? 4 - r.left : r.right > window.innerWidth - 4 ? window.innerWidth - 4 - r.right : 0;
    if (dx) el.style.transform = `translateX(${dx}px)`;
  }, [open]);
  // the colour the A button gives the selection
  const [colour, setColour] = useState('#d62728');
  // inserts `before` + the selection + `after` at the cursor
  const wrap = (before: string, after = '') => {
    const el = multiline ? area.current : input.current;
    const a = el?.selectionStart ?? value.length;
    const b = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, a) + before + value.slice(a, b) + after + value.slice(b));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = a + before.length + (b - a);
      el.setSelectionRange(pos, pos);
    });
  };
  return (
    <span className="rich-input">
      {multiline ? (
        <textarea ref={area} className="nodrag nowheel rich-field" rows={2} value={value} placeholder={placeholder} title={title ?? RICH_HELP} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input ref={input} className="nodrag rich-field" type="text" value={value} placeholder={placeholder} title={title ?? RICH_HELP} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      )}
      <button className={`nodrag omega${open ? ' on' : ''}`} title="Symbols and formatting" onClick={() => setOpen((o) => !o)}>
        Ω
      </button>
      {open && (
        <div ref={pop} className="symbol-pop nodrag nowheel" onMouseDown={(e) => e.preventDefault()}>
          <div className="sym-format">
            <button title="Superscript: ^{…}" onClick={() => wrap('^{', '}')}>
              x²
            </button>
            <button title="Subscript: _{…}" onClick={() => wrap('_{', '}')}>
              x₂
            </button>
            <button title="Bold: \bold{…}" onClick={() => wrap('\\bold{', '}')}>
              <b>B</b>
            </button>
            <button title="Italic: \italic{…}" onClick={() => wrap('\\italic{', '}')}>
              <i>I</i>
            </button>
            <button title="Underline: \underline{…}" onClick={() => wrap('\\underline{', '}')}>
              <u>U</u>
            </button>
            <button title="Bar over: \overline{…}" onClick={() => wrap('\\overline{', '}')}>
              x̄
            </button>
            <button title="Bigger: \size{+2}{…}" onClick={() => wrap('\\size{+2}{', '}')}>
              A+
            </button>
            <span className="sym-colour" title="Colour: choose it, then A gives it to the selected text">
              <input className="nodrag color" type="color" value={colour} title="The colour" onChange={(e) => setColour(e.target.value)} />
              <button title="Colour: the selected text in the colour chosen beside" onClick={() => wrap(`\\color{${colour}}{`, '}')}>
                <span style={{ color: colour }}>A</span>
              </button>
            </span>
            <button title="New line: \\" onClick={() => wrap('\\\\')}>
              <CornerDownLeft {...IC} />
            </button>
            <button title="A formula in LaTeX between $ signs: $\frac{a}{b}$, $\Delta E = h\nu$ ($$…$$: drawn larger, as on a line of its own)" onClick={() => wrap('$', '$')}>
              <Sigma {...IC} />
            </button>
            <button className="close" title="Close" onClick={() => setOpen(false)}>
              <X {...IC} />
            </button>
          </div>
          {SYMBOL_GROUPS.map(([g, chars]) => (
            <div key={g} className="sym-group">
              <span className="muted">{g}</span>
              <span className="sym-chars">
                {[...chars].map((ch) => (
                  <button key={ch} onClick={() => wrap(ch)}>
                    {ch}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// Font, size, bold, italic, colour of a text; empty = the canvas default (“auto”).
export function TextStyleControls({ value, onChange, label }: { value: TextStyle | undefined; onChange: (v: TextStyle) => void; label?: string }) {
  const v = value ?? {};
  const set = (p: Partial<TextStyle>) => {
    const next: Record<string, unknown> = { ...v, ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '' || (typeof next[k] === 'number' && !Number.isFinite(next[k] as number))) delete next[k];
    onChange(next as TextStyle);
  };
  const cycle = (b: boolean | undefined) => (b === undefined ? true : b ? false : undefined);
  const state = (b: boolean | undefined) => (b === undefined ? 'auto' : b ? 'on' : 'off');
  return (
    <div className="text-style" title="Empty / auto: as set in the Merge">
      {label && <span className="ts-label">{label}</span>}
      <select className="nodrag ts-font" value={v.font ?? ''} onChange={(e) => set({ font: e.target.value || undefined })}>
        <option value="">font: auto</option>
        {FONTS.map(([f, l]) => (
          <option key={f} value={f}>
            {l}
          </option>
        ))}
      </select>
      <NumInput className="tiny" min={1} step={0.5} value={v.size ?? NaN} placeholder="pt" title="Size in pt (empty: auto)" onChange={(size) => set({ size: size > 0 ? size : undefined })} />
      <button className={`nodrag ts-btn ${state(v.bold)}`} title={`Bold: ${state(v.bold)} (click to change)`} onClick={() => set({ bold: cycle(v.bold) })}>
        <b>B</b>
      </button>
      <button className={`nodrag ts-btn ${state(v.italic)}`} title={`Italic: ${state(v.italic)} (click to change)`} onClick={() => set({ italic: cycle(v.italic) })}>
        <i>I</i>
      </button>
      <input className="nodrag color" type="color" value={v.color || '#000000'} title="Colour" onChange={(e) => set({ color: e.target.value })} />
      {v.color && (
        <button className="nodrag ts-btn" title="Colour: back to auto" onClick={() => set({ color: undefined })}>
          <RotateCcw {...IC} />
        </button>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map(([t, l]) => (
        <button key={t} className={`nodrag tab${t === value ? ' on' : ''}`} onClick={() => onChange(t)}>
          {l}
        </button>
      ))}
    </div>
  );
}

// A colour with an “off” state (empty = none / automatic).
export function OptColor({ value, onChange, none = 'none', title }: { value: string; onChange: (c: string) => void; none?: string; title?: string }) {
  return (
    <span className="opt-color" title={title}>
      <input className="nodrag color" type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      {value ? (
        <button className="nodrag ts-btn" title={`Back to ${none}`} onClick={() => onChange('')}>
          <X {...IC} />
        </button>
      ) : (
        <span className="muted">{none}</span>
      )}
    </span>
  );
}
