// The projects kept in this browser: every project worked on, kept by itself as it changes (the one open marked) —
// opened, renamed, duplicated, deleted; all of them backed up in one file and restored from it; the room used.
import { useEffect, useRef, useState } from 'react';
import { libAddFiles, libBackup, libDelete, libDuplicate, libGet, libList, libRename, libRestore, onLibrary, storageUse, type LibEntry } from './library.ts';
import type { Project } from './project.ts';
import { Copy, Pencil, X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';
import { ask, askText } from './ui/dialogStore.ts';

const sizeText = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

// onNew: a new, empty project (named) started and put in the list — the one open kept first
export function ProjectsPanel(props: { onClose: () => void; currentId: string; keepCurrent: () => Promise<boolean>; onRename: (id: string, name: string) => void; onOpen: (p: Project, name: string) => void; onNew: (name: string) => void }) {
  const [list, setList] = useState<LibEntry[] | null>(null);
  const [use, setUse] = useState<{ used: number; quota: number } | null>(null);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const adding = useRef<HTMLInputElement>(null);
  const newProject = async () => {
    const n = (list?.length ?? 0) + 1;
    const name = (await askText('The name of the new project:', `Project ${n}`))?.trim();
    if (name) props.onNew(name);
  };
  const addFiles = async (fs: File[]) => {
    const r = await libAddFiles(await Promise.all(fs.map(async (f) => ({ name: f.name, text: await f.text() }))));
    setMsg(`${r.added} project${r.added === 1 ? '' : 's'} added.${r.bad.length ? ` Not a SciPlotFlow project: ${r.bad.join(', ')}.` : ''}`);
  };
  useEffect(() => {
    const read = () => {
      void libList().then(setList);
      void storageUse().then(setUse);
    };
    read();
    return onLibrary(read);
  }, []);
  const open = async (e: LibEntry) => {
    const p = await libGet(e.id);
    if (typeof p === 'string') setMsg(p);
    else props.onOpen(p, e.name);
  };
  const rename = async (e: LibEntry) => {
    const name = (await askText('The name of the project:', e.name))?.trim();
    if (!name || name === e.name) return;
    await libRename(e.id, name);
    props.onRename(e.id, name);
  };
  const duplicate = async (e: LibEntry) => {
    const id = await libDuplicate(e.id, `${e.name} (copy)`);
    setMsg(id ? `“${e.name} (copy)” added.` : 'The copy could not be kept (the browser storage is full?).');
  };
  const backup = async () => {
    const { text, count, lost } = await libBackup();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `sciplotflow-projects-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg(`${count} project${count === 1 ? '' : 's'} in the file.${lost ? ` ${lost} imported file(s) were no longer in the browser.` : ''}`);
  };
  const restore = async (f: File) => {
    const r = await libRestore(await f.text());
    setMsg(typeof r === 'string' ? r : `${r} project${r === 1 ? '' : 's'} restored (those here already and newer were kept).`);
  };
  const current = list?.some((e) => e.id === props.currentId);
  return (
    <aside className="library projects-panel">
      <header>
        <strong>Projects in this browser</strong>
        <button onClick={props.onClose} aria-label="Close"><X {...IC} /></button>
      </header>
      <div className="hint">Every project you work on is kept here by itself as it changes (an example only opened is not). New, an example or Open keep the one open here first.</div>
      <div className="row wrap">
        <button className="btn-run" title="A new, empty project, in the list at once (the one open stays here)" onClick={newProject}>
          + New project
        </button>
        <button title="Project files (.json, from Save) or a backup: added to the list, not opened" onClick={() => adding.current?.click()}>
          + Add files…
        </button>
        <input
          ref={adding}
          type="file"
          accept=".json"
          multiple
          hidden
          onChange={(ev) => {
            const fs = [...(ev.target.files ?? [])];
            ev.target.value = '';
            if (fs.length) void addFiles(fs);
          }}
        />
      </div>
      <div className="row wrap">
        {!current && (
          <button title="Keep the project open now here (it is kept by itself once it is changed)" onClick={() => void props.keepCurrent()}>
            Keep the open project here
          </button>
        )}
        <button disabled={!list?.length} title="All the projects, with their imported data, in one file (to keep them safe, or to move them to another computer)" onClick={() => void backup()}>
          Back up all
        </button>
        <button title="The projects of a backup file kept here (a project here already: replaced only by a newer one)" onClick={() => file.current?.click()}>
          Restore…
        </button>
        <input
          ref={file}
          type="file"
          accept=".json"
          hidden
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            ev.target.value = '';
            if (f) void restore(f);
          }}
        />
      </div>
      {msg && <div className="msg warn">{msg}</div>}
      <div className="lib-list">
        {list && !list.length && <div className="muted">No projects yet: they appear here as you work.</div>}
        {list?.map((e) => {
          const isOpen = e.id === props.currentId;
          return (
            <div className={`project-item${isOpen ? ' open' : ''}`} key={e.id}>
              <div>
                <b>{e.name}</b>
                {isOpen && <span className="muted"> · open now</span>}
                <div className="muted">
                  {new Date(e.saved).toLocaleString()} · {e.nodes} nodes · {sizeText(e.size)}
                </div>
              </div>
              <button disabled={isOpen} title={isOpen ? 'It is the one open' : 'Open it (the project open now stays here)'} onClick={() => void open(e)}>
                Open
              </button>
              <button className="ts-btn" title="Rename" onClick={() => void rename(e)}>
                <Pencil {...IC} />
              </button>
              <button className="ts-btn" title="Duplicate: a copy beside it" onClick={() => void duplicate(e)}>
                <Copy {...IC} />
              </button>
              <button
                className="ts-btn btn-stop"
                disabled={isOpen}
                title={isOpen ? 'Open another project first (the one open is kept here as it changes)' : 'Delete it from this browser'}
                onClick={() => {
                  void ask(`Delete “${e.name}” from this browser? (Back up all keeps a copy in a file.)`, { ok: 'Delete', danger: true }).then((yes) => {
                    if (yes) void libDelete(e.id);
                  });
                }}
              >
                <X {...IC} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="hint">
        {use ? `The browser's room used: ${sizeText(use.used)} of ${sizeText(use.quota)}. ` : ''}The projects stay only in this browser: clearing the site data removes them — Back up all, or Save, keeps them in a file.
      </div>
    </aside>
  );
}
