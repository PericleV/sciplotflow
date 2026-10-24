// The figures of a Word (.docx) or PowerPoint (.pptx) document that carry a SciPlotFlow project (embed.ts), and the
// document written again with some of them replaced. A document is a zip of XML parts and media: every picture is an
// <a:blip r:embed="…"> (a PNG, or the PNG shown by older programs) with, for an SVG, an <asvg:svgBlip r:embed="…"> in
// it; the relationships of the part (…/_rels/part.xml.rels) give the media files. A figure replaced: its SVG and its
// PNG, and its size on the page (wp:extent / a:ext, in EMU: 12700 per point) at its physical size. Pure.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { fileProject, type Embedded } from './embed.ts';

export const EMU_PER_PT = 12700;
export type OfficeKind = 'docx' | 'pptx';
// a picture of the document: where (its part and its place in it), its media files, the project it carries
export type OfficeFigure = { part: string; index: number; png?: string; svg?: string; embedded: Embedded; source: string; cx: number; cy: number };
export type OfficeDoc = { kind: OfficeKind; files: Record<string, Uint8Array>; figures: OfficeFigure[]; pictures: number };

const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/') + 1);
// a relative target (“media/image1.png”, “../media/image2.svg”) from the folder of its part
function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (base + target).split('/');
  const out: string[] = [];
  for (const q of parts) {
    if (q === '..') out.pop();
    else if (q !== '.' && q !== '') out.push(q);
  }
  return out.join('/');
}
// the relationships of a part: id → the file it points to
function relsOf(files: Record<string, Uint8Array>, part: string): Map<string, string> {
  const relPath = `${dirOf(part)}_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels`;
  const out = new Map<string, string>();
  const f = files[relPath];
  if (!f) return out;
  const text = strFromU8(f);
  for (const m of text.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target && !/TargetMode="External"/.test(m[1])) out.set(id, resolve(dirOf(part), target));
  }
  return out;
}
// the XML parts that hold pictures
const pictureParts = (kind: OfficeKind, files: Record<string, Uint8Array>) =>
  Object.keys(files).filter((p) => (kind === 'docx' ? /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(p) : /^ppt\/(slides\/slide\d+|slideLayouts\/slideLayout\d+|slideMasters\/slideMaster\d+)\.xml$/.test(p)));
// the element of a picture around the blip at `at`: <w:drawing> in Word, <p:pic> in PowerPoint
function enclosing(xml: string, at: number, kind: OfficeKind): [number, number] | null {
  const [open, close] = kind === 'docx' ? ['<w:drawing', '</w:drawing>'] : ['<p:pic', '</p:pic>'];
  const a = xml.lastIndexOf(open, at);
  const b = xml.indexOf(close, at);
  return a < 0 || b < 0 ? null : [a, b + close.length];
}
// the blips of a part: their place, the PNG's relationship and the SVG's
const BLIP = /<a:blip\b([^>]*?)(\/>|>([\s\S]*?)<\/a:blip>)/g;
function blips(xml: string): { at: number; png?: string; svg?: string }[] {
  const out: { at: number; png?: string; svg?: string }[] = [];
  for (const m of xml.matchAll(BLIP)) {
    const png = /\br:embed="([^"]+)"/.exec(m[1])?.[1];
    const svg = m[3] ? /<asvg:svgBlip\b[^>]*\br:embed="([^"]+)"/.exec(m[3])?.[1] : undefined;
    out.push({ at: m.index ?? 0, png, svg });
  }
  return out;
}
const sizeOf = (frag: string): [number, number] => {
  const m = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(frag) ?? /<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(frag);
  return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
};

export function readOffice(bytes: Uint8Array, name: string): OfficeDoc | string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return `“${name}” is not a Word or PowerPoint document (.docx, .pptx).`;
  }
  const kind: OfficeKind | null = files['word/document.xml'] ? 'docx' : files['ppt/presentation.xml'] ? 'pptx' : null;
  if (!kind) return `“${name}” is not a Word or PowerPoint document (.docx, .pptx): an older .doc / .ppt: save it as .docx / .pptx first.`;
  const figures: OfficeFigure[] = [];
  let pictures = 0;
  // the project in a media file, read once
  const cache = new Map<string, Embedded | null>();
  const carried = (path: string | undefined) => {
    if (!path || !files[path]) return null;
    if (!cache.has(path)) cache.set(path, fileProject(files[path]));
    return cache.get(path)!;
  };
  for (const part of pictureParts(kind, files)) {
    const xml = strFromU8(files[part]);
    const rels = relsOf(files, part);
    blips(xml).forEach((b, index) => {
      pictures++;
      const png = b.png ? rels.get(b.png) : undefined;
      const svg = b.svg ? rels.get(b.svg) : undefined;
      const fromSvg = carried(svg);
      const e = fromSvg ?? carried(png);
      if (!e) return;
      const box = enclosing(xml, b.at, kind);
      const [cx, cy] = box ? sizeOf(xml.slice(box[0], box[1])) : [NaN, NaN];
      figures.push({ part, index, ...(png ? { png } : {}), ...(svg ? { svg } : {}), embedded: e, source: fromSvg ? svg! : png!, cx, cy });
    });
  }
  return { kind, files, figures, pictures };
}

// the new pictures: for a figure (its part and index), its SVG and PNG bytes (each replacing what it has) and its
// size in points (the page size changed when given)
export type Replacement = { part: string; index: number; svg?: Uint8Array; png?: Uint8Array; widthPt?: number; heightPt?: number };
export function writeOffice(doc: OfficeDoc, reps: Replacement[]): Uint8Array {
  const files: Record<string, Uint8Array> = { ...doc.files };
  const byPart = new Map<string, Replacement[]>();
  for (const r of reps) byPart.set(r.part, [...(byPart.get(r.part) ?? []), r]);
  for (const [part, list] of byPart) {
    let xml = strFromU8(files[part]);
    const rels = relsOf(files, part);
    const bl = blips(xml);
    // from the last to the first: the places before stay right while the text changes
    const order = [...list].sort((a, b) => b.index - a.index);
    for (const r of order) {
      const b = bl[r.index];
      if (!b) continue;
      const png = b.png ? rels.get(b.png) : undefined;
      const svg = b.svg ? rels.get(b.svg) : undefined;
      if (r.svg && svg) files[svg] = r.svg;
      if (r.png && png) files[png] = r.png;
      if (r.widthPt && r.heightPt) {
        const box = enclosing(xml, b.at, doc.kind);
        if (box) {
          const [cx, cy] = [Math.round(r.widthPt * EMU_PER_PT), Math.round(r.heightPt * EMU_PER_PT)];
          const frag = xml
            .slice(box[0], box[1])
            .replace(/(<wp:extent\b[^>]*\bcx=")\d+("[^>]*\bcy=")\d+/, `$1${cx}$2${cy}`)
            .replace(/(<a:xfrm\b[^>]*>[\s\S]*?<a:ext\b[^>]*\bcx=")\d+("[^>]*\bcy=")\d+/, `$1${cx}$2${cy}`);
          xml = xml.slice(0, box[0]) + frag + xml.slice(box[1]);
        }
      }
    }
    files[part] = strToU8(xml);
  }
  // the parts in their first order ([Content_Types].xml first), compressed
  const out: Zippable = {};
  for (const k of Object.keys(doc.files)) out[k] = [files[k], { level: /\.(png|jpe?g|gif)$/i.test(k) ? 0 : 6 }];
  return zipSync(out);
}
