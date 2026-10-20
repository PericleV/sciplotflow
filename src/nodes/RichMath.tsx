// The formula panel of a Note's editor (Σ, or a click on a formula): its LaTeX, drawn as it is typed, in the line or on
// a line of its own; a palette (structures, Greek letters, operators and relations, units), each button drawn by
// MathJax and put in at the cursor (its “a”, “x” … to be replaced); the font of the note's formulas.
import { useRef } from 'react';
import { MathSvg } from '../math/MathSvg.tsx';
import { MATH_FACE_NAMES, mathFace, type MathFace, type MathFontChoice } from '../math/sizes.ts';
import { RICH_BASE } from './richDoc.ts';

export type MathEdit = { latex: string; display: boolean; pos: number | null; was?: boolean };

const PALETTE: [string, string[]][] = [
  ['Structures', [String.raw`\frac{a}{b}`, 'x^{2}', 'x_{i}', 'x_{i}^{2}', String.raw`\sqrt{x}`, String.raw`\sqrt[n]{x}`, String.raw`\sum_{i=1}^{n}`, String.raw`\prod_{i=1}^{n}`, String.raw`\int_{a}^{b}`, String.raw`\oint`, String.raw`\lim_{x \to 0}`, String.raw`\frac{d}{dx}`, String.raw`\frac{\partial f}{\partial x}`, String.raw`\binom{n}{k}`, String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`, String.raw`\left( x \right)`, String.raw`\left[ x \right]`, String.raw`\left| x \right|`, String.raw`\overline{x}`, String.raw`\hat{x}`, String.raw`\vec{v}`, String.raw`\dot{x}`, String.raw`\tilde{x}`]],
  ['Greek', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'nu', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'].map((g) => `\\${g}`)],
  ['Operators', ['pm', 'mp', 'times', 'cdot', 'div', 'le', 'ge', 'ne', 'approx', 'equiv', 'propto', 'sim', 'infty', 'partial', 'nabla', 'to', 'Rightarrow', 'leftrightarrow', 'in', 'subset', 'cup', 'cap', 'forall', 'exists', 'hbar', 'langle x \\rangle'].map((g) => `\\${g}`)],
  ['Units', [String.raw`\,\mathrm{nm}`, String.raw`\,\mu\mathrm{m}`, String.raw`\,\mathrm{eV}`, String.raw`^{\circ}\mathrm{C}`, String.raw`\,\mathrm{K}`, String.raw`\,\mathrm{cm^{-1}}`, String.raw`\,\mathrm{mol\,L^{-1}}`, String.raw`\,\mathrm{\mathring{A}}`]],
];

// face: the font the formulas are drawn in; font: the note's choice (onFont: it changed)
export function MathPanel({ edit, face, font, onFont, onChange, onApply, onRemove, onClose }: { edit: MathEdit; face: MathFace; font: MathFontChoice; onFont?: (f: MathFontChoice) => void; onChange: (e: MathEdit) => void; onApply: () => void; onRemove?: () => void; onClose: () => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  // a template at the cursor (in place of the selection)
  const put = (snippet: string) => {
    const t = ta.current;
    const [a, b] = t ? [t.selectionStart, t.selectionEnd] : [edit.latex.length, edit.latex.length];
    const latex = edit.latex.slice(0, a) + snippet + edit.latex.slice(b);
    onChange({ ...edit, latex });
    requestAnimationFrame(() => {
      t?.focus();
      t?.setSelectionRange(a + snippet.length, a + snippet.length);
    });
  };
  return (
    <div className="rt-math nokey" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="row wrap">
        <strong>Formula</strong>
        <label className="radio">
          <input className="nodrag" type="radio" checked={!edit.display} onChange={() => onChange({ ...edit, display: false })} /> in the line
        </label>
        <label className="radio">
          <input className="nodrag" type="radio" checked={edit.display} onChange={() => onChange({ ...edit, display: true })} /> on its own line
        </label>
      </div>
      <textarea
        ref={ta}
        className="nodrag rt-math-src"
        rows={2}
        autoFocus
        spellCheck={false}
        value={edit.latex}
        placeholder="LaTeX, e.g. E = h\nu  or  \frac{\Delta R}{R}"
        onChange={(e) => onChange({ ...edit, latex: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onApply();
        }}
      />
      <div className="rt-math-preview rich-doc">{edit.latex.trim() ? <MathSvg tex={edit.latex} display={edit.display} face={face} /> : <span className="muted">the formula appears here</span>}</div>
      {PALETTE.map(([group, items]) => (
        <div key={group} className="rt-math-group">
          <span className="muted">{group}</span>
          <span className="rt-math-items">
            {items.map((s) => (
              <button key={s} className="nodrag rt-math-btn" title={s} onMouseDown={(e) => e.preventDefault()} onClick={() => put(s)}>
                <MathSvg tex={s} face={face} />
              </button>
            ))}
          </span>
        </div>
      ))}
      {onFont && (
        <label className="row" title="The font of every formula of this note. Automatic picks the one that looks like the note's text">
          <span className="muted">Font of the formulas</span>
          <select className="nodrag" value={font} onChange={(e) => onFont(e.target.value as MathFontChoice)}>
            <option value="auto">automatic ({MATH_FACE_NAMES[mathFace(RICH_BASE.font, 'auto')]})</option>
            {(['sans', 'serif', 'latex'] as const).map((f) => (
              <option key={f} value={f}>
                {MATH_FACE_NAMES[f]}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row">
        <button className="nodrag btn-run" disabled={!edit.latex.trim()} onClick={onApply} title="Ctrl+Enter">
          {edit.pos === null ? 'Insert' : 'Update'}
        </button>
        {onRemove && (
          <button className="nodrag" onClick={onRemove}>
            Remove
          </button>
        )}
        <button className="nodrag" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
