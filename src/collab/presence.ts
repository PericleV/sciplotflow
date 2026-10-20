// Presence while working together: who is where — each one's name, colour, the level shown (the groups opened), the
// mouse on the canvas (in the canvas' coordinates) and the nodes selected. Sent a little at a time (a moving mouse at
// most 20 times a second; all of it again every few seconds, so someone joining sees everyone soon), heard from the
// others (passed on by the host). Someone who leaves says so; someone whose link is gone, or who is not heard for a
// while, is no longer shown. Nothing of it is kept in the project. Pure (the hub carries the bytes).

export type PresenceState = { id: string; name: string; color: string; level: string; cursor: { x: number; y: number } | null; selected: string[]; gone?: boolean };
type Carrier = { sendAware(bytes: Uint8Array): void; onAware(f: (bytes: Uint8Array, from: string) => void): () => void; onGone(f: (link: string) => void): () => void; onPeers(f: () => void): () => void };

// distinct colours that read on both themes (Okabe–Ito and a few more)
export const PRESENCE_COLORS = ['#E69F00', '#0072B2', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#8E44AD', '#C0392B'];
export const colorOf = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PRESENCE_COLORS[Math.abs(h) % PRESENCE_COLORS.length];
};

export const SEND_MS = 50;
export const EVERY_MS = 5000;
export const STALE_MS = 30000;

export class Presence {
  readonly id = crypto.randomUUID().slice(0, 12);
  private me: PresenceState;
  private others = new Map<string, { s: PresenceState; at: number; via: string }>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | 0 = 0;
  private beat: ReturnType<typeof setInterval>;
  private off: (() => void)[] = [];
  private carrier: Carrier;
  private now: () => number;
  constructor(carrier: Carrier, name: string, color: string, now: () => number = () => Date.now()) {
    this.carrier = carrier;
    this.now = now;
    this.me = { id: this.id, name, color, level: '', cursor: null, selected: [] };
    this.off.push(
      carrier.onAware((bytes, from) => this.hear(bytes, from)),
      // a link gone: whoever was heard through it goes too (until heard again through another)
      carrier.onGone((link) => {
        let changed = false;
        for (const [id, o] of this.others) if (o.via === link) changed = this.others.delete(id) || changed;
        if (changed) this.changed();
      }),
      // someone new: they hear this side at once
      carrier.onPeers(() => this.send()),
    );
    this.beat = setInterval(() => {
      this.send();
      this.prune();
    }, EVERY_MS);
  }
  private hear(bytes: Uint8Array, from: string) {
    let s: PresenceState;
    try {
      s = JSON.parse(new TextDecoder().decode(bytes)) as PresenceState;
    } catch {
      return;
    }
    if (!s || typeof s.id !== 'string' || s.id === this.id) return;
    if (s.gone) this.others.delete(s.id);
    else this.others.set(s.id, { s, at: this.now(), via: from });
    this.changed();
  }
  // those not heard for a while
  prune() {
    const t = this.now();
    let changed = false;
    for (const [id, o] of this.others) if (t - o.at > STALE_MS) changed = this.others.delete(id) || changed;
    if (changed) this.changed();
  }
  private changed() {
    this.listeners.forEach((f) => f());
  }
  private send() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    this.carrier.sendAware(new TextEncoder().encode(JSON.stringify(this.me)));
  }
  // this side's presence changed: sent a moment later (what changes again meanwhile goes with it)
  set(patch: Partial<Omit<PresenceState, 'id'>>) {
    const next = { ...this.me, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.me)) return;
    this.me = next;
    if (!this.timer) this.timer = setTimeout(() => this.send(), SEND_MS);
  }
  get mine(): PresenceState {
    return this.me;
  }
  // the others (at a level: only those there), in a stable order
  list(level?: string): PresenceState[] {
    return [...this.others.values()].map((o) => o.s).filter((s) => level === undefined || s.level === level).sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  onChange(f: () => void) {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  }
  // leaving: the others are told (they stop showing this side at once)
  leave() {
    this.carrier.sendAware(new TextEncoder().encode(JSON.stringify({ ...this.me, gone: true })));
    this.destroy();
  }
  destroy() {
    if (this.timer) clearTimeout(this.timer);
    clearInterval(this.beat);
    this.off.forEach((f) => f());
    this.listeners.clear();
  }
}
