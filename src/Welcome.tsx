// The welcome window: at every start (unless “Show at start” is unticked, kept in this browser) and from Help ▸
// Welcome. What the app is; import a data file, open a project file, start empty or go on with the project open; the
// examples in one menu, by their groups; the guided tours (one left half-way: taken up again); the projects kept in
// this browser last worked on; who made it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileUp, FolderOpen, FilePlus2, ArrowRight, GraduationCap, X } from 'lucide-react';
import { libList, type LibEntry } from './library.ts';
import { IC } from './nodes/iconProps.ts';
import { ACCEPT, pickDataFiles } from './readFiles.ts';
import { setWelcomeAtStart, welcomeAtStart } from './theme.ts';
import { loadTourProgress, SHOW_TOURS, stepsOf, TOURS } from './tour/tours.ts';
import { versionShown } from './version.ts';

const INSTAGRAM = 'https://www.instagram.com/pericle_v/';

// The Instagram glyph (a rounded square, the lens, the flash), drawn as the app's line icons, in the text's colour
export const InstagramIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon">
    <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
  </svg>
);

// Who made it, in the top bar: only while the bar has room for it on its row (else it would push the buttons to a row
// of their own); shown again when the room is back (the free space before it measured)
export function TopCredit() {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(true);
  const width = useRef(260);
  useLayoutEffect(() => {
    const el = ref.current;
    const bar = el?.parentElement;
    const spacer = el?.previousElementSibling as HTMLElement | null;
    if (!el || !bar || !spacer) return;
    const first = bar.firstElementChild as HTMLElement;
    // (on the first row: its top above the bottom of the bar's first item)
    const onFirstRow = (e: HTMLElement) => e.getBoundingClientRect().top < first.getBoundingClientRect().bottom;
    const check = () => {
      if (el.style.display !== 'none') {
        width.current = el.scrollWidth;
        // (it, or what comes after it, pushed to a row of its own: no room)
        if ([...bar.children].some((c) => (c as HTMLElement).offsetWidth > 0 && !onFirstRow(c as HTMLElement))) setShown(false);
      } else if (onFirstRow(spacer) && spacer.getBoundingClientRect().width >= width.current + 16) setShown(true);
    };
    check();
    // (the bar resized, or the window: its items may move between the rows without the bar changing size)
    const ro = new ResizeObserver(check);
    ro.observe(bar);
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [shown]);
  return (
    <span ref={ref} className="tb-credit" style={shown ? undefined : { display: 'none' }}>
      Developed by <b>Pericle Vărășteanu</b>
      <span aria-hidden="true">·</span>
      IMT Bucharest
      <span aria-hidden="true">·</span>
      <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" title="Follow me on Instagram">
        <InstagramIcon /> @pericle_v
      </a>
    </span>
  );
}

// The version, who made it, and the photography (the welcome window and Help ▸ About).
export function MadeBy() {
  return (
    <div className="made-by">
      <div>
        SciPlotFlow {versionShown} · Developed by <b>Pericle Vărășteanu</b> · IMT Bucharest
      </div>
      <div>
        If you find this app useful, please support my photography: follow me on Instagram{' '}
        <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
          <InstagramIcon /> @pericle_v
        </a>
      </div>
    </div>
  );
}

type Example = { group: string; name: string; desc: string };

export function Welcome(props: {
  examples: Example[];
  current: { name: string; nodes: number }; // the project open
  onClose: () => void;
  onImport: (files: File[]) => void; // data files: an Import node with them
  onOpenFile: () => void; // a project file (.json)
  onNew: () => void;
  onExample: (i: number) => void;
  onProject: (e: LibEntry) => void;
  onTour: (id: string) => void;
}) {
  const [recent, setRecent] = useState<LibEntry[]>([]);
  const [atStart, setAtStart] = useState(welcomeAtStart);
  const [progress] = useState(loadTourProgress);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void libList().then((l) => setRecent(l.slice(0, 5)));
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [props]);
  const groups = [...new Set(props.examples.map((e) => e.group))];
  const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="welcome-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="welcome" role="dialog" aria-label="Welcome to SciPlotFlow">
        <button className="welcome-x" onClick={props.onClose} aria-label="Close" title="Close (Esc)">
          <X {...IC} />
        </button>
        <img className="logo" src="./logo.svg" alt="" height={48} />
        <h2>SciPlotFlow</h2>
        <p>
          Data analysis and publication-quality graphs in your browser, built from nodes. Import a file, clean it, compute, fit and test, then draw the figure. Everything updates as you change it, and your data never leave your computer.
        </p>
        <div className="welcome-actions">
          <button title="Open a data file (CSV, text, Excel …) in a new Import node. You can also drop the file on the canvas." onClick={() =>
              void pickDataFiles(() => file.current?.click()).then((fs) => {
                if (fs?.length) props.onImport(fs);
              })
            }>
            <FileUp {...IC} /> Import your data…
          </button>
          <button title="Open a project you saved with Save (.json)" onClick={props.onOpenFile}>
            <FolderOpen {...IC} /> Open a project…
          </button>
          <button title="Start with an empty canvas. The project you have open now stays in Projects." onClick={props.onNew}>
            <FilePlus2 {...IC} /> Start empty
          </button>
          {props.current.nodes > 0 && (
            <button title="Close this window and keep working on the open project" onClick={props.onClose}>
              <ArrowRight {...IC} /> Continue: {props.current.name || 'Untitled project'}
            </button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            e.target.value = '';
            if (fs.length) props.onImport(fs);
          }}
        />
        {SHOW_TOURS && <div className="welcome-gallery">
          {(() => {
            // the tutorial first, as one large button (where it was left, if it was)
            const how = TOURS.find((t) => t.id === 'how-it-works');
            if (!how) return null;
            const left = progress?.tour === how.id && progress.step > 0 ? progress.step : 0;
            return (
              <button className="welcome-tutorial" title={`${how.desc}\n\nOpens in a new project. The one you have open now stays in Projects.`} onClick={() => props.onTour(how.id)}>
                <GraduationCap {...IC} />
                <span>
                  <b>{left ? 'Continue the tutorial' : 'New here? Start the tutorial'}</b>
                  <span className="tour-meta">{left ? `${how.title} · step ${left + 1} of ${stepsOf(how).length}` : `${how.title} · about ${how.minutes} min · step by step, Show me when stuck`}</span>
                </span>
              </button>
            );
          })()}
          <h4>Tours · learn it step by step</h4>
          <div className="welcome-cards">
            {TOURS.filter((t) => t.id !== 'how-it-works').map((t) => {
              const left = progress?.tour === t.id && progress.step > 0 ? progress.step : 0;
              return (
                <button key={t.id} className="welcome-card" title={`${t.desc}\n\n${left ? 'Pick up where you left off.' : 'Opens in a new project. The one you have open now stays in Projects.'}`} onClick={() => props.onTour(t.id)}>
                  <b>{t.title}</b>
                  <span className="tour-meta">{left ? `Continue · step ${left + 1} of ${stepsOf(t).length}` : `${t.level} · about ${t.minutes} min`}</span>
                  <span>{t.desc}</span>
                </button>
              );
            })}
          </div>
        </div>}
        {/* the examples: one menu, by their groups */}
        <div className="welcome-examples">
          <select
            value=""
            title="Open a complete example. The project you have open now stays in Projects."
            onChange={(e) => {
              const i = Number(e.target.value);
              if (e.target.value !== '' && props.examples[i]) props.onExample(i);
            }}
          >
            <option value="">Open an example…</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {props.examples.map((ex, i) =>
                  ex.group === g ? (
                    <option key={ex.name} value={i} title={ex.desc}>
                      {ex.name}
                    </option>
                  ) : null,
                )}
              </optgroup>
            ))}
          </select>
        </div>
        {recent.length > 0 && (
          <div className="welcome-recent">
            <h4>Your projects (kept in this browser)</h4>
            {recent.map((r) => (
              <button key={r.id} className="welcome-recent-row" title="Open it. The project you have open now stays in Projects." onClick={() => props.onProject(r)}>
                <span className="ellipsis">{r.name || 'untitled'}</span>
                <span className="muted">
                  {when(r.saved)} · {r.nodes} node{r.nodes === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        )}
        {/* at the bottom of the window */}
        <div className="welcome-foot">
          <MadeBy />
          <label className="radio check welcome-check" title="Remembered in this browser. You can always open this window again from Help, Welcome.">
            <input
              type="checkbox"
              checked={atStart}
              onChange={(e) => {
                setAtStart(e.target.checked);
                setWelcomeAtStart(e.target.checked);
              }}
            />
            Show at start
          </label>
        </div>
      </div>
    </div>
  );
}
