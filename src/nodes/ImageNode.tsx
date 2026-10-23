// Image analysis: an image opened in the node (PNG, JPEG, TIFF of 8 or 16 bit or float; pasted or dropped too), edited
// in its editor (Analyze) by steps (tone, colour, noise, background, edges, texture, morphology, threshold), calibrated; out: the
// result as a matrix, a figure (the image on a page, its selections, a scale bar) and the measurements of the selections
// drawn in the editor (a workbook).
import { useRef, useState, type DragEvent } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { DRAWING_DEFAULTS } from '../defaults.ts';
import type { AppNode, ImageAnalysisData, ImageNode, PageData } from '../types.ts';
import { imageFigure, unitText, type ImageFigure } from '../image/node.ts';
import { readImagePixelsAsync, newPixelsId } from '../image/load.ts';
import { IMAGE_ACCEPT, isTiff } from '../imageFile.ts';
import { COLOR_MAPS } from '../figure/colors.ts';
import type { Lut } from '../image/render.ts';
import { STEP_DEFS } from '../image/steps.ts';
import { FigureView } from './FigureView.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ImageEditor } from './ImageEditor.tsx';
import { Check, Field, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { FolderOpen, ScanSearch } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ask, notify } from '../ui/dialogStore.ts';

const LUTS = Object.entries(COLOR_MAPS).map(([k, v]): [Lut, string] => [k as Lut, v.label]);
// the stored pixels above this many characters: the project grows by megabytes (asked first)
const LARGE = 20e6;

export function ImageNodeView({ id, data }: NodeProps<ImageNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<ImageAnalysisData>) => updateNodeData(id, p);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const fig = r?.view.figure;
  const f = imageFigure(data.figure);
  const setFig = (p: Partial<ImageFigure>) => set({ figure: { ...data.figure, ...p } });
  const page: PageData = { ...DRAWING_DEFAULTS, name: data.name.replace(/\.[a-z0-9]+$/i, '') || 'image', ...data.page, width: fig?.width ?? f.width, height: fig?.height ?? f.width, unit: 'mm' };
  const setPage = (p: Partial<PageData>) => {
    const { width, height: _h, unit: _u, ...rest } = p;
    if (width !== undefined) setFig({ width });
    if (Object.keys(rest).length) set({ page: { ...data.page, ...rest } });
  };
  // a file opened, pasted or dropped: read (a TIFF with its own values and scale), kept in the node
  const load = async (fl: File | Blob | undefined, name: string) => {
    if (!fl) return;
    if (!fl.type.startsWith('image/') && !(await isTiff(fl))) return;
    setBusy(`Reading ${name}…`);
    try {
      const pixels = await readImagePixelsAsync(fl);
      if (pixels.data.length > LARGE && !(await ask(`${name}: ${pixels.w} × ${pixels.h} px, ${(pixels.data.length / 1e6).toFixed(0)} MB in the project. Keep it at its full size?`, { ok: 'Keep it' }))) {
        setBusy('');
        return;
      }
      const cal = pixels.scale ? { size: pixels.scale.size, unit: pixels.scale.unit } : data.cal;
      set({ name, pixels, pixelsId: newPixelsId(), ...(cal ? { cal } : {}) });
    } catch (e) {
      notify(`${name}: ${(e as Error).message}`);
    }
    setBusy('');
  };
  const onDrop = (e: DragEvent) => {
    const fl = e.dataTransfer.files[0];
    setOver(false);
    if (!fl) return;
    e.preventDefault();
    e.stopPropagation();
    void load(fl, fl.name);
  };
  const info = r?.view.image;
  const nSteps = (data.steps ?? []).filter((s) => s.on).length;
  const errs = Object.keys(info?.errors ?? {}).length;
  const px = data.pixels;
  const calText = data.cal && data.cal.size > 0 ? `1 px = ${+data.cal.size.toPrecision(4)} ${unitText(data.cal.unit)}` : 'not calibrated';
  const openButton = (
    <button className="nodrag" title="An image: PNG, JPEG, TIFF (8 or 16 bit, float; its scale read when it has one)" onClick={() => file.current?.click()}>
      <FolderOpen {...IC} /> Open image
    </button>
  );
  return (
    <div
      className={`node node-image${over ? ' drop-over' : ''}`}
      tabIndex={-1}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onPaste={(e) => {
        const it = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
        const fl = it?.getAsFile();
        if (!fl) return;
        e.preventDefault();
        void load(fl, 'pasted image');
      }}
    >
      <input
        ref={file}
        type="file"
        hidden
        accept={IMAGE_ACCEPT}
        onChange={(e) => {
          const fl = e.target.files?.[0];
          e.target.value = '';
          void load(fl, fl?.name ?? 'image');
        }}
      />
      <div className="row">
        {px ? (
          <button className="nodrag btn-run" title="Analyze the image: its steps, calibration, selections, particles and measurements (or double-click it)" onClick={() => setEditing(true)}>
            <ScanSearch {...IC} /> Analyze
          </button>
        ) : (
          openButton
        )}
        <span className="muted ellipsis" title={data.name}>
          {busy || (px ? `${data.name || 'image'} · ${px.w} × ${px.h} · ${px.ch === 3 ? 'RGB' : 'gray'} ${px.depth === 32 ? 'float' : `${px.depth}-bit`}` : 'or paste / drop one here')}
        </span>
      </div>
      {px && (
        <div className="hint">
          {nSteps} step{nSteps === 1 ? '' : 's'}
          {errs ? ` (${errs} cannot run)` : ''} · {calText}
          {info?.summary ? ` · ${info.summary}` : ''}
        </div>
      )}
      {fig && (
        <div onDoubleClick={() => setEditing(true)}>
          <FigureView fig={fig} width={420} page={page} setPage={setPage} layoutTitle="" noAxes />
        </div>
      )}
      <Messages result={r} />
      <OutPort label="matrix" port="matrix" id="matrix" title="The result as a matrix: its values, X and Y of the columns and rows in the calibrated unit (gray; RGB: its luminance)" />
      <OutPort label="figure" port="figure" id="figure" title="The image on a page of its proportions, with its selections and a scale bar: to a Merge, a Figure Drawing or a Plot's insets" />
      <OutPort label="workbook" port="workbook" id="workbook" title="The measurements of the selections (Selections, Spots, Distances, Profiles, Points, Summary: the sheets used) and the mask's coverage of the image" />
      <NodeOptions>
        <div className="row wrap">
          {openButton}
          {px && (
            <button className="nodrag btn-run" title="Analyze the image: its steps, calibration, selections, particles and measurements" onClick={() => setEditing(true)}>
              <ScanSearch {...IC} /> Analyze
            </button>
          )}
        </div>
        {px && (
          <>
            <div className="hint">
              {(data.steps ?? []).length ? (data.steps ?? []).map((s) => `${s.on ? '' : '(off) '}${STEP_DEFS[s.kind]?.label ?? s.kind}`).join(' → ') : 'No steps yet: Analyze to add them.'}
            </div>
            <div className="section-title">Calibration</div>
            <div className="row wrap">
              <Field label="1 px =" title="The size of a pixel (set it here, or draw a line on the scale bar in the editor)">
                <NumInput className="short" min={0} step={0.001} value={data.cal?.size ?? NaN} placeholder="none" onChange={(size) => set({ cal: size > 0 ? { unit: data.cal?.unit ?? 'µm', ...data.cal, size } : undefined })} />
              </Field>
              <Select<string>
                value={unitText(data.cal?.unit ?? 'µm')}
                options={['nm', 'µm', 'mm', 'cm', 'm', 'Å'].map((u): [string, string] => [u, u])}
                onChange={(unit) => data.cal && set({ cal: { ...data.cal, unit } })}
              />
            </div>
            <div className="section-title">Figure</div>
            <div className="grid2">
              <Field label="Shows" title="The result of the steps; the original image; or the original with the result's mask over it in a colour">
                <Select<ImageFigure['show']>
                  value={f.show}
                  options={[
                    ['result', 'the result'],
                    ['original', 'the original'],
                    ['overlay', 'the original, the mask over it'],
                  ]}
                  onChange={(show) => setFig({ show })}
                />
              </Field>
              <Field label="Width" title="The width of the figure (mm); its height follows the image">
                <NumInput className="short" min={5} step={1} value={f.width} onChange={(width) => setFig({ width: width > 0 ? width : 80 })} />
              </Field>
              <Field label="Colours" title="The colour table of a gray image">
                <Select<Lut> value={f.lut} options={LUTS} onChange={(lut) => setFig({ lut })} />
              </Field>
              {f.show === 'overlay' && (
                <Field label="Mask colour">
                  <span className="row">
                    <input className="nodrag color" type="color" value={f.overlay} onChange={(e) => setFig({ overlay: e.target.value })} />
                    <NumInput className="tiny" min={0} max={1} step={0.05} value={f.alpha} title="Its opacity" onChange={(alpha) => setFig({ alpha: Math.min(1, Math.max(0, alpha)) })} />
                  </span>
                </Field>
              )}
              <Field label="Selections" title="The selections drawn on the figure: none, their outlines, or their outlines with their names">
                <Select<ImageFigure['rois']>
                  value={f.rois}
                  options={[
                    ['none', 'none'],
                    ['outlines', 'outlines'],
                    ['labels', 'outlines + names'],
                  ]}
                  onChange={(rois) => setFig({ rois })}
                />
              </Field>
              <Field label="Range" title="The values shown from black to white (empty: the image's)">
                <span className="row">
                  <NumInput className="short" value={f.lo} placeholder="auto" onChange={(lo) => setFig({ lo })} />
                  <NumInput className="short" value={f.hi} placeholder="auto" onChange={(hi) => setFig({ hi })} />
                </span>
              </Field>
            </div>
            <div className="row wrap">
              <Check label="Scale bar" title="A bar of a round length (or the one given) with its label; needs a calibration" value={f.bar.show} onChange={(show) => setFig({ bar: { ...f.bar, show } })} />
              {f.bar.show && (
                <>
                  <NumInput className="short" min={0} value={f.bar.length} placeholder="auto" title={`Its length in ${unitText(data.cal?.unit ?? 'µm')} (empty: a round one)`} onChange={(length) => setFig({ bar: { ...f.bar, length } })} />
                  <Select<ImageFigure['bar']['at']>
                    value={f.bar.at}
                    options={[
                      ['br', 'bottom right'],
                      ['bl', 'bottom left'],
                      ['tr', 'top right'],
                      ['tl', 'top left'],
                    ]}
                    onChange={(at) => setFig({ bar: { ...f.bar, at } })}
                  />
                  <input className="nodrag color" type="color" value={f.bar.color} title="Its colour" onChange={(e) => setFig({ bar: { ...f.bar, color: e.target.value } })} />
                  <NumInput className="tiny" min={0.5} step={0.5} value={f.bar.thickness} title="Its thickness (pt)" onChange={(thickness) => setFig({ bar: { ...f.bar, thickness: thickness > 0 ? thickness : 3 } })} />
                  <Check label="label" value={f.bar.label} onChange={(label) => setFig({ bar: { ...f.bar, label } })} />
                  <NumInput className="tiny" min={4} step={0.5} value={f.bar.size} title="The label's size (pt)" onChange={(size) => setFig({ bar: { ...f.bar, size: size > 0 ? size : 8 } })} />
                </>
              )}
            </div>
            {f.bar.show && !(data.cal && data.cal.size > 0) && <div className="hint">The scale bar needs a calibration (above, or a line on the scale bar in the editor).</div>}
          </>
        )}
        <Messages result={r} />
      </NodeOptions>
      {editing && px && <ImageEditor id={id} data={data} onClose={() => setEditing(false)} />}
    </div>
  );
}
