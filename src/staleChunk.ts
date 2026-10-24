// A part of the app loaded only when needed (the Python editor, the formulas …) that is no longer on the site: a new
// version was published while this page was open, its files replaced. Reloading the page gets the new one; the project
// is kept in this browser (saved as it changes).
export const isStaleChunk = (e: unknown) => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(e instanceof Error ? e.message : String(e));
export const STALE_TEXT = 'A new version of SciPlotFlow was published while this page was open: reload the page to get it (your project is kept in this browser).';
