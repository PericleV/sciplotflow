// The version of the app (as package.json's, checked by npm run check), shown under the welcome window and in Help ▸
// About. Not the format of the project files (PROJECT_VERSION, src/project.ts).
export const APP_VERSION = '1.1.0';
// (as people say it: 1.0, 1.2, 1.2.1)
export const versionShown = APP_VERSION.replace(/\.0$/, '');

// How to cite it: the archive of its releases on Zenodo (this DOI stands for all the versions, the latest first), the
// year of this version
export const DOI = '10.5281/zenodo.23658458';
export const RELEASE_YEAR = 2026;
export const CITE_APA = `Vărășteanu, P. (${RELEASE_YEAR}). SciPlotFlow (Version ${versionShown}) [Computer software]. Zenodo. https://doi.org/${DOI}`;
export const CITE_BIBTEX = `@software{varasteanu_sciplotflow,
  author    = {V{\\u{a}}r{\\u{a}}{\\c{s}}teanu, Pericle},
  title     = {SciPlotFlow},
  version   = {${APP_VERSION}},
  year      = {${RELEASE_YEAR}},
  publisher = {Zenodo},
  doi       = {${DOI}},
  url       = {https://doi.org/${DOI}}
}`;
