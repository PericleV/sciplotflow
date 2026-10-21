// The floating bar over an object clicked on a figure (an annotation of a Plot or a Merge, an object of a Figure
// Drawing): its most used settings one click away — a shape's line colour, width, dashes, fill and end head; a text's
// colour, size, bold, italic and box —, its layer, its removal, and × to hide the bar. Every other setting stays in its
// panel. The changes go to every object given of the same kind as the first.
import { ActionIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { ArrowDownToLine, ArrowUpToLine, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ArrowHead, ShapeSpec, TextSpec } from '../figure/spec.ts';
import { ColorField, PicturePick } from './props.tsx';
import { BoxIcon, HeadIcon } from './propIcons.tsx';
import { DASH_PICS } from './dashPics.tsx';
import { setQuickBar } from './quickBarStore.ts';

const HEADS: ArrowHead[] = ['none', 'triangle', 'stealth', 'open', 'bar', 'circle', 'diamond', 'square', 'half'];
const WIDTHS = [0.5, 0.75, 1, 1.5, 2];
const closedOf = (s: ShapeSpec) => ['rect', 'ellipse', 'star', 'regular', 'callout', 'path'].includes(s.kind) || (s.kind === 'arc' && !!s.sector) || (s.kind === 'polygon' && s.closed !== false);

// the keys pressed on the bar are its own (not the canvas's or the editor's)
const ownKeys = (e: React.KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
};

export type QuickTarget = { kind: 'shape'; s: ShapeSpec } | { kind: 'text'; s: TextSpec };

// front / back: the object over the others or under them (one step, or to the top / bottom); remove: it removed
export function QuickBar({ target, onShape, onText, front, back, remove, style }: { target: QuickTarget; onShape: (p: Partial<ShapeSpec>) => void; onText: (p: Partial<TextSpec>) => void; front?: () => void; back?: () => void; remove?: () => void; style?: React.CSSProperties }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const sep = <span className="qb-sep" />;
  let tools: ReactNode;
  if (target.kind === 'shape') {
    const s = target.s;
    const band = s.kind === 'xband' || s.kind === 'yband';
    const headed = s.kind === 'line' || s.kind === 'arrow' || (s.kind === 'polygon' && s.closed === false) || s.kind === 'path' || s.kind === 'dimension';
    tools = (
      <>
        <ColorField value={s.color} onChange={(color) => onShape({ color: color || '#000000' })} />
        {!band && (
          <>
            {sep}
            {WIDTHS.map((w) => (
              <UnstyledButton key={w} className={`chip${s.width === w ? ' on' : ''}`} onClick={() => onShape({ width: w })} title={`Width ${w} pt`}>
                {w}
              </UnstyledButton>
            ))}
            <PicturePick label="Line style" value={s.dashPattern ? ('' as typeof s.dash) : s.dash} onChange={(dash) => onShape({ dash, dashPattern: undefined })} options={DASH_PICS} cols={4} />
          </>
        )}
        {headed && <PicturePick label="Head at the end" value={s.head2} onChange={(head2) => onShape({ head2 })} options={HEADS.map((h) => [h, <HeadIcon key={h} head={h} />, h])} cols={3} />}
        {(closedOf(s) || band) && (
          <>
            {sep}
            <span className="qb-word">Fill</span>
            <ColorField value={s.fill} none={!band} auto={band ? s.color : undefined} onChange={(fill) => onShape({ fill })} />
          </>
        )}
      </>
    );
  } else {
    const s = target.s;
    const size = s.style.size;
    tools = (
      <>
        <ColorField value={s.style.color ?? ''} auto="#000000" onChange={(c) => onText({ style: { ...s.style, color: c || undefined } })} />
        {sep}
        <Tooltip label="Smaller">
          <UnstyledButton className="toggle" onClick={() => onText({ style: { ...s.style, size: Math.max(1, (size ?? 8) - 1) } })} aria-label="Smaller">
            A−
          </UnstyledButton>
        </Tooltip>
        <span className="qb-size" title="Size, pt">{size ?? 'auto'}</span>
        <Tooltip label="Larger">
          <UnstyledButton className="toggle" onClick={() => onText({ style: { ...s.style, size: (size ?? 8) + 1 } })} aria-label="Larger">
            A+
          </UnstyledButton>
        </Tooltip>
        <UnstyledButton className={`toggle${s.style.bold ? ' on' : ''}`} onClick={() => onText({ style: { ...s.style, bold: s.style.bold ? undefined : true } })} aria-label="Bold" title="Bold">
          <b>B</b>
        </UnstyledButton>
        <UnstyledButton className={`toggle${s.style.italic ? ' on' : ''}`} onClick={() => onText({ style: { ...s.style, italic: s.style.italic ? undefined : true } })} aria-label="Italic" title="Italic">
          <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
        </UnstyledButton>
        <Tooltip label={s.box === 'none' ? 'A box around it' : 'No box'}>
          <UnstyledButton className={`toggle${s.box !== 'none' ? ' on' : ''}`} onClick={() => onText({ box: s.box === 'none' ? 'border' : 'none' })} aria-label="Box">
            <BoxIcon box="border" />
          </UnstyledButton>
        </Tooltip>
      </>
    );
  }
  return (
    <div className="quick-bar nodrag nowheel" style={style} onPointerDown={stop} onClick={stop} onDoubleClick={stop} onKeyDown={ownKeys} role="toolbar" aria-label="Quick settings">
      {tools}
      {(front || back || remove) && sep}
      {front && (
        <Tooltip label="Forward (over the others)">
          <ActionIcon size="sm" onClick={front} aria-label="Forward">
            <ArrowUpToLine size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      {back && (
        <Tooltip label="Backward (under the others)">
          <ActionIcon size="sm" onClick={back} aria-label="Backward">
            <ArrowDownToLine size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      {remove && (
        <Tooltip label="Remove it">
          <ActionIcon size="sm" color="red" onClick={remove} aria-label="Remove">
            <Trash2 size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      <Tooltip label="Hide the quick bar (back: the Quick bar switch in Annotate, or in the drawing editor)">
        <ActionIcon size="sm" onClick={() => setQuickBar(false)} aria-label="Hide the quick bar">
          <X size={14} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
