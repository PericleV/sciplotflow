// The figure copied last (Copy under a figure): pasted into a Note of the project, an image of the same pixel size comes
// in as the live figure of its node rather than as a picture (the clipboard itself holds the PNG, for other programs).
let last: { node: string; w: number; h: number; at: number } | null = null;

export function figureCopied(node: string, w: number, h: number) {
  last = { node, w, h, at: Date.now() };
}

// the node of the figure copied in the last hour whose image is w × h pixels, if any
export function copiedFigure(w: number, h: number): string | null {
  return last && Date.now() - last.at < 3600_000 && last.w === w && last.h === h ? last.node : null;
}
