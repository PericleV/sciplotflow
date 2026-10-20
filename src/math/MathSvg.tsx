// A formula in a page of the app (a Note, the formula panel): MathJax's drawing, as tall as the text around it; its
// LaTeX while it is being drawn, in red when it is wrong.
import { mathBox, mathError, mathSvgHtml, useMathVersion, type MathFace } from './store.ts';

export function MathSvg({ tex, display = false, face, className }: { tex: string; display?: boolean; face: MathFace; className?: string }) {
  useMathVersion();
  const box = mathBox(tex, display, face);
  if (box) return <span className={className} dangerouslySetInnerHTML={{ __html: mathSvgHtml(box, tex) }} />;
  const err = mathError(tex, display, face);
  return (
    <code className={`${className ?? ''} math-src${err ? ' math-wrong' : ''}`} title={err ?? undefined}>
      {tex}
    </code>
  );
}
