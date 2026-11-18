// A session of working together: the project as a shared document, kept in step with the other peers — the tabs of
// this browser in the same room, and other browsers invited with a code. The host starts it with its project; a guest
// gets the project when its first link is in step (onJoined).
//
// What this side shows and what the document holds meet in three ways (yproject.ts): `base` is the project this side
// last wrote or showed. A change made here is written on that base (changed(): read from the page a moment later — a
// drag sends at most 20 moves a second); a change of the others is merged into what is shown (incoming: the merge to
// make), and until the page has shown it (shown()) nothing is written, so a change of theirs is never written back over.
// Undo here undoes only the changes made here.
import * as Y from 'yjs';
import type { Edge } from '@xyflow/react';
import type { Project } from '../project.ts';
import type { AppNode } from '../types.ts';
import { mergeEdges, mergeNodes, ProjectBinding } from './yproject.ts';
import { SyncHub, type Link } from './sync.ts';
import { colorOf, Presence } from './presence.ts';
import { answer, invite, tabLinks, type Invitation } from './links.ts';
import { importKey, newKey, newRoomId, parseSession, RelayClient, RelayPeers, sessionLink, socketBase, type PeersOptions, type SocketFactory } from './relay.ts';

export type Role = 'host' | 'guest';
export type PeerView = { id: string; name: string; synced: boolean; via: 'tab' | 'network' | 'relay' };
// how a session by link reaches the relay (the checks: a socket of Node, no WebRTC)
export type RelayOptions = PeersOptions & { socket?: SocketFactory };
// a merge for the page: its nodes and connections from what it shows, the name when the others changed it, the nodes
// they changed (to see what kind they are: a Python script's code changed elsewhere)
export type Incoming = { nodes: (cur: AppNode[]) => AppNode[]; edges: (cur: Edge[]) => Edge[]; name?: string; now: Project; base: Project; changed: Set<string> };

const LOCAL_MS = 50;

export class CollabSession {
  readonly doc = new Y.Doc();
  readonly binding: ProjectBinding;
  readonly hub: SyncHub;
  readonly undo: Y.UndoManager;
  // who is where (cursors, the nodes selected): sent over the same links, kept nowhere
  readonly presence: Presence;
  readonly role: Role;
  readonly room: string;
  readonly name: string;
  joined: boolean;
  private base: Project;
  // the document as the last merge given to the page has it (until the page shows it)
  private scheduled: Project | null = null;
  private source: (() => Project) | null = null;
  private timer: ReturnType<typeof setTimeout> | 0 = 0;
  private dirty = false;
  private stopTabs: () => void;
  private joinedL = new Set<(p: Project) => void>();
  private invitations: Invitation[] = [];
  // a session by link: its links through the relay, and the key (in the link, never sent to the relay)
  relay: RelayPeers | null = null;
  private keyText = '';
  private constructor(role: Role, room: string, name: string, start?: Project, byLink = false) {
    this.role = role;
    // a session by link: a room of 128 random bits (its name on the relay)
    this.room = byLink ? newRoomId() : room;
    this.name = name;
    this.binding = new ProjectBinding(this.doc, start);
    this.base = this.binding.state;
    this.hub = new SyncHub(this.doc, name);
    this.presence = new Presence(this.hub, name, colorOf(name));
    // the changes made here (written by the binding), a few at a time while typing or dragging
    this.undo = new Y.UndoManager([this.binding.y.nodes, this.binding.y.edges, this.binding.y.meta], { trackedOrigins: new Set([this.binding]), captureTimeout: 400 });
    this.joined = role === 'host';
    this.hub.onSynced(() => {
      if (this.joined) return;
      this.joined = true;
      this.base = this.binding.state;
      this.binding.takeChanged();
      this.joinedL.forEach((f) => f(this.binding.state));
    });
    this.stopTabs = tabLinks(room, (l) => this.hub.add(l));
    // who is linked browser to browser now; one that goes is lost (until a link with the same name comes again)
    this.hub.onPeers(() => {
      const now = new Map(this.peers().filter((p) => p.via !== 'tab').map((p) => [p.id, p.name]));
      for (const [id, name] of this.network) if (!now.has(id) && name && !this.hub.left.has(id)) this.gone.add(name);
      for (const name of now.values()) this.gone.delete(name);
      this.network = now;
    });
  }
  private network = new Map<string, string>();
  private left = false;
  private gone = new Set<string>();
  static host(project: Project, name: string): CollabSession {
    return new CollabSession('host', crypto.randomUUID().replace(/-/g, '').slice(0, 16), name, project);
  }
  // a guest through the tabs of this browser (the room of a link)
  static guest(room: string, name: string): CollabSession {
    return new CollabSession('guest', room, name);
  }
  // a guest by an invitation's code: the answer to send back
  static async byCode(code: string, name: string, address?: string): Promise<{ session: CollabSession; answer: string; host: string; pc: RTCPeerConnection; at: number } | string> {
    let session: CollabSession | null = null;
    const early: Link[] = [];
    const a = await answer(code, name, (l) => (session ? session.hub.add(l) : early.push(l)), address);
    if (typeof a === 'string') return a;
    session = new CollabSession('guest', a.room, name);
    early.forEach((l) => session!.hub.add(l));
    return { session, answer: a.code, host: a.host, pc: a.pc, at: a.at };
  }

  // A session by link (through the relay at `base`): the host's, with this project — or why it could not start.
  static async startByLink(project: Project, name: string, base: string, o: RelayOptions = {}): Promise<CollabSession | string> {
    const url = socketBase(base);
    if (!url) return 'The relay address is not a web address (wss://…).';
    const k = await newKey();
    const s = new CollabSession('host', '', name, project, true);
    const err = await s.byRelay(url, k.key, k.text, o);
    return err ?? s;
  }
  // a guest by a session's link: in the session (the project comes when the host's link is in step), or why not
  static async joinByLink(link: string, name: string, base: string, o: RelayOptions = {}): Promise<CollabSession | string> {
    const p = parseSession(link);
    if (!p) return 'Not a SciPlotFlow session link (copy it whole).';
    const url = socketBase(base);
    if (!url) return 'The relay address is not a web address (wss://…).';
    let key: CryptoKey;
    try {
      key = await importKey(p.key);
    } catch {
      return 'Not a SciPlotFlow session link (copy it whole).';
    }
    const s = new CollabSession('guest', p.room, name);
    const err = await s.byRelay(url, key, p.key, o);
    return err ?? s;
  }
  private async byRelay(base: string, key: CryptoKey, keyText: string, o: RelayOptions): Promise<string | null> {
    this.keyText = keyText;
    const client = new RelayClient({ base, room: this.room, key, role: this.role, socket: o.socket });
    this.relay = new RelayPeers(client, (l) => this.hub.add(l), o);
    const err = await this.relay.start();
    if (err) this.leave();
    return err;
  }
  // the link to send (a session by link): it holds the key, after # (never sent to any server)
  link(page?: string): string {
    return this.keyText ? sessionLink(this.room, this.keyText, page) : '';
  }

  // the page: where the project shown is read from (when a change made here is written)
  setSource(f: () => Project) {
    this.source = f;
  }
  // something changed here: written a moment later (not before joining, nor while a merge waits to be shown)
  changed() {
    if (!this.joined) return;
    this.dirty = true;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), LOCAL_MS);
  }
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    if (!this.dirty || this.scheduled || !this.source) return;
    this.dirty = false;
    const p = this.source();
    this.binding.local(p, this.base);
    this.base = p;
  }
  // the others' changes (or an undo here): the merge for the page (after a merge not yet shown: on top of it)
  incoming(): Incoming {
    const now = this.binding.state;
    const base = this.scheduled ?? this.base;
    const changed = this.binding.takeChanged();
    this.scheduled = now;
    return { nodes: (cur) => mergeNodes(cur, now, base, changed), edges: (cur) => mergeEdges(cur, now, base), ...((now.name ?? '') !== (base.name ?? '') ? { name: now.name ?? '' } : {}), now, base, changed };
  }
  // the page shows the merges given: they are the base now; a change made meanwhile goes out
  shown() {
    if (!this.scheduled) return;
    this.base = this.scheduled;
    this.scheduled = null;
    if (this.dirty) this.changed();
  }
  onRemote(f: () => void) {
    return this.binding.onRemote(() => f());
  }
  onJoined(f: (p: Project) => void) {
    this.joinedL.add(f);
  }
  onPeers(f: () => void) {
    return this.hub.onPeers(f);
  }
  // the people whose connection (browser to browser) was lost and not made again: a new invitation brings them back
  lost(): string[] {
    const now = new Set(this.peers().filter((p) => p.via !== 'tab').map((p) => p.name));
    for (const n of now) this.gone.delete(n);
    return [...this.gone];
  }
  peers(): PeerView[] {
    return [...this.hub.peers.values()].map((p) => ({ id: p.link.id, name: p.name || 'someone', synced: p.synced, via: p.link.id.startsWith('tab-') ? 'tab' : p.link.id.startsWith('relay-') ? 'relay' : 'network' }));
  }
  // undo / redo of the changes made here (what is pending is written first)
  undoLocal() {
    this.flush();
    this.undo.undo();
  }
  redoLocal() {
    this.flush();
    this.undo.redo();
  }
  // A guest whose connection was lost (a network that dropped): a new invitation from the host answered within this
  // session — the link is added to it, and what each side did meanwhile is merged when they are in step again.
  async rejoin(code: string, address?: string): Promise<{ answer: string; host: string; pc: RTCPeerConnection; at: number } | string> {
    const a = await answer(code, this.name, (l) => this.hub.add(l), address);
    if (typeof a === 'string') return a;
    if (a.room !== this.room) {
      a.pc.close();
      return 'This invitation is for another session (leave this one first to join it).';
    }
    return { answer: a.code, host: a.host, pc: a.pc, at: a.at };
  }
  // someone in another browser: an invitation (its code, then their answer)
  async invite(): Promise<Invitation> {
    const inv = await invite(this.room, this.name, (l: Link) => this.hub.add(l));
    this.invitations.push(inv);
    return inv;
  }
  leave() {
    if (this.left) return;
    this.left = true;
    this.flush();
    this.presence.leave();
    this.stopTabs();
    this.hub.close();
    // through the relay: the hub's BYE goes first (a host's bye ends the session for everyone)
    this.relay?.leave();
    for (const inv of this.invitations) inv.pc.close();
    this.undo.destroy();
    this.doc.destroy();
  }
}
