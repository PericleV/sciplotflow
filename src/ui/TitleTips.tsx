// The hints of the app's buttons and fields (their title) in the same tooltip as the new panels, instead of the
// browser's: shown after a short rest of the pointer, under the element (over it near the bottom of the window). The
// title is taken off while the pointer is on the element (so the browser does not show its own too) and put back when
// it leaves.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Tip = { text: string; x: number; y: number; above: boolean };

export function TitleTips() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let el: Element | null = null;
    let text = '';
    let timer = 0;
    const restore = () => {
      clearTimeout(timer);
      // put back unless the app gave it another title meanwhile
      if (el && text && !el.hasAttribute('title')) el.setAttribute('title', text);
      el = null;
      text = '';
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const t = (e.target as Element | null)?.closest?.('[title]');
      if (!t || t === el) return;
      // an SVG figure's own titles and the browser's own controls stay as they are
      if (t instanceof SVGElement || t.closest('.mantine-Tooltip-tooltip')) return;
      restore();
      const title = t.getAttribute('title') ?? '';
      if (!title.trim()) return;
      el = t;
      text = title;
      t.removeAttribute('title');
      timer = window.setTimeout(() => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const above = r.bottom + 80 > window.innerHeight;
        setTip({ text, x: Math.min(Math.max(8, r.left + r.width / 2), window.innerWidth - 8), y: above ? r.top - 6 : r.bottom + 6, above });
      }, 450);
    };
    const out = (e: PointerEvent) => {
      if (!el) return;
      const to = e.relatedTarget as Node | null;
      if (to && el.contains(to)) return;
      restore();
    };
    const away = () => restore();
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', away, true);
    document.addEventListener('wheel', away, { capture: true, passive: true });
    return () => {
      restore();
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', away, true);
      document.removeEventListener('wheel', away, true);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div className={`title-tip${tip.above ? ' above' : ''}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.text}
    </div>,
    document.body,
  );
}
