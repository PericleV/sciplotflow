// The tasks of the Image analysis editor: what is being done (particles, a network, a TEM lattice, an AFM surface; or
// every panel at once, as the tabs of before), its numbered steps in the order they are done, the selection tools it
// shows first; the ways the particles can be found.
import type { ImageAnalysisData } from './node.ts';
import type { RoiTool } from './roi.ts';

export type Task = NonNullable<ImageAnalysisData['task']>;
export type FindMethod = NonNullable<ImageAnalysisData['find']>;

// every task: its name, what it is for, its steps (name, what is in it), the selection tools it shows first (the others
// behind More)
export const TASKS: Record<Exclude<Task, 'all'>, { label: string; title: string; steps: [string, string][]; tools: RoiTool[] }> = {
  particles: {
    label: 'Particles',
    title: 'Particles, grains, cells: found, checked, measured (sizes, shapes, how they lie)',
    steps: [
      ['Prepare', 'crop, scale, image steps'],
      ['Find', 'one method, its options'],
      ['Check', 'review, refine, learn'],
      ['Measure', 'sizes, shapes, export'],
    ],
    tools: ['rect', 'ellipse', 'polygon', 'freehand', 'points', 'wand', 'rays', 'stamp'],
  },
  spots: {
    label: 'Spots (microarray)',
    title: 'Spots of a microarray or a dot blot: each measured over a ring of its own background (or a region, or a global one), on each channel, with the ratio of two',
    steps: [
      ['Prepare', 'crop, scale, image steps'],
      ['Spots', 'stamp, draw, their rings'],
      ['Background', 'ring, region, global'],
      ['Measure', 'channels, ratio, export'],
    ],
    tools: ['ellipse', 'rect', 'stamp', 'polygon', 'points', 'line'],
  },
  network: {
    label: 'Network',
    title: 'A network or a porous structure: its ligaments, junctions and pores (the skeleton of a mask), the grain size, the orientation, the fractal dimension',
    steps: [
      ['Prepare', 'crop, scale, image steps'],
      ['Mask', 'threshold or classifier'],
      ['Network', 'skeleton, by hand'],
      ['Texture', 'grains, orientation, fractal'],
    ],
    tools: ['rect', 'polygon', 'freehand', 'line'],
  },
  lattice: {
    label: 'Lattice (TEM)',
    title: 'TEM: the spots of the spectrum (d, angles, a Bragg filter), the fringes along a line, the rings of a diffraction pattern',
    steps: [
      ['Prepare', 'crop, scale, image steps'],
      ['Spectrum', 'spots, d, angles'],
      ['Fringes', 'along a line'],
      ['Rings', 'diffraction (SAED)'],
    ],
    tools: ['line', 'polyline', 'rect'],
  },
  surface: {
    label: 'Surface (AFM)',
    title: 'AFM: the image as heights, levelled; its roughness (ISO 25178, ISO 4287), the distributions, a step height',
    steps: [
      ['Prepare', 'heights, level, steps'],
      ['Roughness', 'areal, ISO 25178'],
      ['Profiles', 'lines, ISO 4287'],
      ['Step height', 'two regions'],
    ],
    tools: ['rect', 'ellipse', 'polygon', 'line', 'polyline'],
  },
};
export const TASK_ORDER: Task[] = ['particles', 'spots', 'network', 'lattice', 'surface', 'all'];
// the tasks set aside (not working well enough yet): not offered, shown only on a node that is already doing one
export const HIDDEN_TASKS: Task[] = ['lattice', 'surface'];
export const taskLabel = (t: Task) => (t === 'all' ? 'All tools' : TASKS[t].label);

// the task of a node: its own, else from the panel it showed last (a project of before the tasks); selections with a
// background of their own: spots
export function taskOf(d: Pick<ImageAnalysisData, 'task' | 'tab' | 'rois'>): Task {
  if (d.task) return d.task;
  if (d.tab === 'structure' || d.tab === 'lattice' || d.tab === 'surface') return d.tab === 'structure' ? 'network' : d.tab;
  return d.rois?.some((r) => r.bg && r.bg.mode !== 'none') ? 'spots' : 'particles';
}

// the ways the particles are found (Particles ▸ Find)
export const FIND_METHODS: [FindMethod, string, string][] = [
  ['threshold', 'Threshold', 'clear contrast'],
  ['classifier', 'Pixel classifier', 'texture, paint examples'],
  ['like', 'Find like this', 'one good particle as model'],
  ['sam', 'Segment anything', 'a click, a box, or all'],
  ['rays', 'Seeds and rays', 'round, touching'],
];
export const FIND_TITLES: Record<FindMethod, string> = {
  threshold: 'The particles of a mask made by a threshold of the brightness (one value for the whole image, or a local one): best when they are clearly brighter or darker than the ground',
  classifier: 'The particles of a mask made by a trainable classifier of the pixels: you paint a few examples of the particles, the ground and their edges; best for textured particles or an uneven ground',
  like: 'Every place that looks like one good particle you pick (or a few): turned and a little larger or smaller; best for particles alike in shape, touching or not, on any ground',
  sam: 'Segment anything: the outline of a particle from a click, a box, or every particle at once, by a neural network run on this computer',
  rays: 'A seed in every particle, 32 rays from it stopped at the first edge: touching round particles found one by one',
};
