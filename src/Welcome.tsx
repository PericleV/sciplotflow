// The welcome window: at every start (unless “Show at start” is unticked, kept in this browser) and from Help ▸
// Welcome. What the app is; import a data file, open a project file, start empty or go on with the project open; the
// guided tours (one left half-way: taken up again); the projects kept in this browser last worked on; every example,
// by its group; who made it.
import { useEffect, useRef, useState } from 'react';
import { FileUp, FolderOpen, FilePlus2, ArrowRight, Camera, X } from 'lucide-react';
import { libList, type LibEntry } from './library.ts';
import { IC } from './nodes/iconProps.ts';
import { setWelcomeAtStart, welcomeAtStart } from './theme.ts';
import { loadTourProgress, SHOW_TOURS, stepsOf, TOURS } from './tour/tours.ts';

const INSTAGRAM = 'https://www.instagram.com/pericle_v/';

// Who made it, and the photography (the welcome window and Help ▸ About).
export function MadeBy() {
  return (
    <div className="made-by">
      <div>
        Made by <b>Pericle Vărășteanu</b> · IMT Bucharest
      </div>
      <div>
        If you find this app useful, please support my photography endeavour and follow my Instagram{' '}
        <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
          <Camera {...IC} /> @pericle_v
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
          <button title="Open a data file (CSV, text, Excel …) in a new Import node. You can also drop the file on the canvas." onClick={() => file.current?.click()}>
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
          hidden
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            e.target.value = '';
            if (fs.length) props.onImport(fs);
          }}
        />
        {SHOW_TOURS && <div className="welcome-gallery">
          <h4>Tours · learn it step by step</h4>
          <div className="welcome-cards">
            {TOURS.map((t) => {
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
        {recent.length > 0 && (
          <div className="welcome-gallery">
            <h4>Your projects (kept in this browser)</h4>
            <div className="welcome-cards">
              {recent.map((r) => (
                <button key={r.id} className="welcome-card" title="Open it. The project you have open now stays in Projects." onClick={() => props.onProject(r)}>
                  <b>{r.name || 'untitled'}</b>
                  <span>
                    {when(r.saved)} · {r.nodes} node{r.nodes === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="welcome-gallery">
          {groups.map((g) => (
            <div key={g}>
              <h4>Examples · {g}</h4>
              <div className="welcome-cards">
                {props.examples.map((ex, i) =>
                  ex.group === g ? (
                    <button key={ex.name} className="welcome-card" title={`${ex.desc}\n\nOpen this example. The project you have open now stays in Projects.`} onClick={() => props.onExample(i)}>
                      <b>{ex.name}</b>
                      <span>{ex.desc}</span>
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
        {/* at the bottom of the window, always in view (the examples scroll under it) */}
        <div className="welcome-foot">
          <MadeBy />
          <label className="radio welcome-check" title="Remembered in this browser. You can always open this window again from Help, Welcome.">
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
