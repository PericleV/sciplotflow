// Small building blocks of the node views: number fields, choices, ports, messages.
import { useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { InPanel } from './inspectorStore.ts';
import { Handle, Position, useNodeConnections, useNodeId, useNodesData } from '@xyflow/react';
import { nodeDisplayName } from '../nodeColors.ts';
import type { AppNode } from '../types.ts';
import { isMultiInput, PORT_COLORS, PORT_LABELS, targetAccepts, type PortType } from '../engine/ports.ts';
import type { NodeResult } from '../engine/evaluate.ts';
import { Choice } from '../ui/props.tsx';
import { parseSci, sciPretty, sciText } from '../engine/table.ts';

const num = (v: string) => (v === '' ? NaN : Number(v));

export function NumInput(props: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; disabled?: boolean; placeholder?: string; className?: string; title?: string }) {
  const { value, onChange, step, min, max, disabled, placeholder, className, title } = props;
  return (
    <input
      className={`nodrag ${className ?? ''}`}
      type="number"
      step={step}
      min={min}
      max={max}
      title={title}
      disabled={disabled}
      placeholder={placeholder}
      value={disabled || value == null || Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(num(e.target.value))}
    />
  );
}

// A number in scientific notation (sciText, parseSci in table.ts): shown short (1e16) when very large or very small,
// typed as 1e16, 1x10^16, 1·10¹⁶ …; its value written out (1·10¹⁶) in its tooltip
export function SciInput({ value, onChange, className, title, unit }: { value: number; onChange: (v: number) => void; className?: string; title?: string; unit?: string }) {
  // (what is typed stays as typed while the field has the focus; the value goes on at every number it makes)
  const [draft, setDraft] = useState<string | null>(null);
  const pretty = `${sciPretty(value)}${unit ? ` ${unit}` : ''}`;
  return (
    <input
      className={`nodrag ${className ?? ''}`}
      type="text"
      inputMode="decimal"
      spellCheck={false}
      title={title ? `${title} (${pretty})` : pretty}
      value={draft ?? sciText(value)}
      onFocus={() => setDraft(sciText(value))}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseSci(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

export function TextInput({ value, onChange, placeholder, className, title }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; title?: string }) {
  return <input className={`nodrag ${className ?? ''}`} type="text" value={value} placeholder={placeholder} title={title} spellCheck={false} onChange={(e) => onChange(e.target.value)} />;
}

// seg: a few short choices that never change, shown side by side (as in the newer panels) in place of a list
export function Select<T extends string | number>({ value, options, onChange, title, className, seg }: { value: T; options: [T, string][]; onChange: (v: T) => void; title?: string; className?: string; seg?: boolean }) {
  if (seg) {
    const pick = (s: string) => {
      const o = options.find(([v]) => String(v) === s);
      if (o) onChange(o[0]);
    };
    const c = <Choice value={String(value)} onChange={pick} options={options.map(([v, l]) => [String(v), l] as [string, string])} />;
    return title ? <span className="seg-wrap" title={title}>{c}</span> : c;
  }
  return (
    <select className={`nodrag ${className ?? ''}`} value={String(value)} title={title} onChange={(e) => {
        // a value not among the options (they changed meanwhile) is left out
        const o = options.find(([v]) => String(v) === e.target.value);
        if (o) onChange(o[0]);
      }}>
      {options.map(([v, l]) => (
        <option key={String(v)} value={String(v)}>
          {l}
        </option>
      ))}
    </select>
  );
}

// A labelled row: text on the left, the control(s) on the right.
export function Field({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <label title={title}>
      <span>{label}</span>
      <span className="field-ctl">{children}</span>
    </label>
  );
}

// A slider with its number (typed values may go beyond the slider's range).
export function Slider({ label, value, min, max, step, onChange, unit, title }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string; title?: string }) {
  return (
    <label className="slider-row" title={title}>
      <span>{label}</span>
      <input className="nodrag nowheel" type="range" min={min} max={max} step={step} value={Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min} onChange={(e) => onChange(Number(e.target.value))} />
      <NumInput className="tiny" value={value} step={step} onChange={(v) => Number.isFinite(v) && onChange(v)} />
      {unit && <span className="muted unit">{unit}</span>}
    </label>
  );
}

// an option of its own (drawn as a switch where settings are made: App.css)
export function Check({ label, value, onChange, title }: { label: string; value: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="radio check" title={title}>
      <input className="nodrag" type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// A port; the tooltip names the type of value and where it comes from / goes to. Inputs that accept several
// connections are drawn as squares.
export function Port({ kind, id, port }: { kind: 'source' | 'target'; id: string; port: PortType }) {
  // a port must stay in its node: in the options panel it would be cut off from it (a mistake: said, not drawn)
  const inPanel = useContext(InPanel);
  const conns = useNodeConnections({ handleType: kind, handleId: id });
  const others = useNodesData<AppNode>(conns.map((c) => (kind === 'target' ? c.source : c.target)));
  const self = useNodesData<AppNode>(useNodeId() ?? '');
  const multi = kind === 'target' && isMultiInput(self as AppNode | undefined, id);
  const names = others.map((n) => nodeDisplayName(n as AppNode));
  // an input that takes a dataset or a workbook: both in its symbol — the dataset's fill, the workbook's ring
  const accepts = kind === 'target' && self && (port === 'dataset' || port === 'workbook') ? targetAccepts(self as AppNode, id) : [];
  const either = accepts.includes('dataset') && accepts.includes('workbook');
  const what = either ? 'dataset or workbook (one table, or several sheets: the sheet chosen in the node)' : PORT_LABELS[port];
  const title = `${what}${multi ? ' (several connections)' : ''} · ${names.length ? `${kind === 'target' ? 'from' : 'to'} ${names.join(', ')}` : 'not connected'}`;
  if (inPanel) {
    console.error(`The port “${id}” is drawn in the options panel: it must stay in its node.`);
    return null;
  }
  if (either) return <Handle type={kind} position={Position.Left} id={id} className={`port-workbook port-either${multi ? ' multi' : ''}`} style={{ background: PORT_COLORS.dataset, '--port-color': PORT_COLORS.workbook } as CSSProperties} title={title} />;
  return <Handle type={kind} position={kind === 'target' ? Position.Left : Position.Right} id={id} className={`port-${port}${multi ? ' multi' : ''}`} style={{ background: PORT_COLORS[port], '--port-color': PORT_COLORS[port] } as CSSProperties} title={title} />;
}

export function InPort({ label, port, id, title, children }: { label: string; port: PortType; id: string; title?: string; children?: ReactNode }) {
  return (
    <div className="port-row in" title={title}>
      <Port kind="target" id={id} port={port} />
      <span className="role">{label}</span>
      {children}
    </div>
  );
}

export function OutPort({ label, port, id = 'out', title, children }: { label: string; port: PortType; id?: string; title?: string; children?: ReactNode }) {
  return (
    <div className="port-row out" title={title}>
      {children}
      {label}
      <Port kind="source" id={id} port={port} />
    </div>
  );
}

// In a node whose options are in the panel: what it gives, in one line — a dataset's rows × columns, a column's rows, a
// value (the output `port`, else the first one).
export function ResultSummary({ result, port }: { result: NodeResult | undefined; port?: string }) {
  const outs = result?.outputs ?? {};
  const v = port ? outs[port] : (outs.out ?? Object.values(outs)[0]);
  if (!v) return null;
  const text =
    v.t === 'dataset' ? `${v.v.name ? `${v.v.name} · ` : ''}${Math.max(0, ...v.v.columns.map((c) => c.values.length))} rows × ${v.v.columns.length} columns`
    : v.t === 'column' ? `${v.v.name} · ${v.v.values.length} rows`
    : v.t === 'scalar' ? `${v.v.name} = ${Number.isFinite(v.v.value) ? +v.v.value.toPrecision(7) : '—'}`
    : v.t === 'workbook' ? `${v.v.sheets.length} sheets`
    : v.t === 'matrix' ? `${v.v.rows} × ${v.v.cols} matrix`
    : '';
  return text ? <div className="hint ellipsis node-summary" title={text}>{text}</div> : null;
}

export function ColorField({ label, title, value, onChange }: { label: string; title?: string; value: string; onChange: (c: string) => void }) {
  return (
    <label className="radio color-field" title={title}>
      {label}
      <input className="nodrag color" type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Messages({ result }: { result?: NodeResult }) {
  if (!result) return null;
  return (
    <>
      {[...new Set(result.errors)].map((e) => (
        <div className="msg err" key={e}>
          {e}
        </div>
      ))}
      {[...new Set(result.warnings)].map((w) => (
        <div className="msg warn" key={w}>
          {w}
        </div>
      ))}
      {!result.errors.length && result.view.waiting && <div className="hint">{result.view.waiting}</div>}
    </>
  );
}

// One line of text that wraps instead of scrolling (a formula): the box grows with the text; Enter does not break it.
// inputRef: the textarea, to put a text where the cursor is
export function AutoText({ value, onChange, className, placeholder, title, inputRef }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; title?: string; inputRef?: RefObject<HTMLTextAreaElement | null> }) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight + t.offsetHeight - t.clientHeight}px`;
  });
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`nodrag nowheel auto-text ${className ?? ''}`}
      value={value}
      placeholder={placeholder}
      title={title}
      spellCheck={false}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
    />
  );
}
