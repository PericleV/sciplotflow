// The licences of the packages built into the app (package-lock.json: those not only for development), with their full
// texts, written to public/THIRD_PARTY_LICENSES.txt, shipped with the app, as the MIT, BSD, ISC and Apache licences ask.
// Run: npm run licenses (after adding or updating a dependency). What is loaded only when a Python script runs (Pyodide
// and its packages, from jsDelivr) and the palettes and data used are listed in THIRD_PARTY_NOTICES.md.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// (a path with spaces or other characters escaped in a URL read right)
const root = fileURLToPath(new URL('..', import.meta.url));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string; license?: string; dev?: boolean; devOptional?: boolean; optional?: boolean; resolved?: string }> };
const own = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name: string };

const items: string[] = [];
const names = Object.keys(lock.packages)
  .filter((k) => k.startsWith('node_modules/') && !lock.packages[k].dev && !lock.packages[k].devOptional)
  .sort((a, b) => a.localeCompare(b));
for (const k of names) {
  const p = lock.packages[k];
  const dir = join(root, k);
  if (!existsSync(dir)) continue; // an optional package for another system
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; version: string; license?: string | { type: string }; homepage?: string; repository?: string | { url: string } };
  const lic = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? p.license ?? 'see the text');
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f));
  const text = file ? readFileSync(join(dir, file), 'utf8').trim() : '(no licence file in the package: its licence is the one named above)';
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  items.push(`${'='.repeat(78)}\n${pkg.name} ${pkg.version} (${lic})\n${pkg.homepage ?? repo ?? p.resolved ?? ''}\n${'-'.repeat(78)}\n${text}\n`);
}
// the libraries whose code ours follows closely in places (written in TypeScript to give the same results): their
// notices, as their BSD and MIT licences ask (scripts/licenses/*.txt, copied from the installed packages)
const FOLLOWED: [string, string, string][] = [
  ['scipy.txt', 'SciPy', 'find_peaks_cwt; sosfilt_zi and sosfiltfilt; the Bessel normalisation; iirnotch; lombscargle'],
  ['pywavelets.txt', 'PyWavelets', 'the wavelet filters (src/engine/waveletFilters.ts, generated from it); the stationary transform and mra; the thresholds'],
  ['pycwt.txt', 'pycwt', 'the continuous wavelet transform: its padding, cone of influence, significance and the smoothing of the coherence'],
  ['ruptures.txt', 'ruptures', 'PELT and binary segmentation: the costs and the pruning'],
  ['pybaselines.txt', 'pybaselines', 'arPLS: its weights and stopping rule'],
  ['astropy.txt', 'astropy', 'Lomb–Scargle: the frequency grid and the false-alarm probability (Baluev)'],
];
for (const [file, name, what] of FOLLOWED) {
  const text = readFileSync(join(root, 'scripts', 'licenses', file), 'utf8').trim();
  items.push(`${'='.repeat(78)}\n${name}: code followed closely in places: ${what}\n${'-'.repeat(78)}\n${text}\n`);
}
// the neural networks served with the app (public/models: Segment anything in Image analysis), downloaded only when
// used: their sources, licences and what was changed
const MODELS: [string, string][] = [
  ['MobileSAM (models/mobilesam-encoder.onnx, models/mobilesam-decoder.onnx)', `Zhang et al., Faster Segment Anything: Towards Lightweight SAM for Mobile Applications (arXiv:2306.14289), https://github.com/ChaoningZhang/MobileSAM, built on Segment Anything (Meta AI). Converted to ONNX for this app. Apache License 2.0:

${readFileSync(join(root, 'scripts', 'licenses', 'mobilesam.txt'), 'utf8').trim()}`],
  ['micro-sam vit_t_em_organelles (models/microsam-em-tiny-encoder.onnx, models/microsam-em-tiny-decoder.onnx)', 'Archit A., Pape C. et al., Segment Anything for Microscopy (doi:10.1101/2023.08.21.554208), https://github.com/computational-cell-analytics/micro-sam. Weights from Zenodo, doi:10.5281/zenodo.11110950 (BioImage.IO model greedy-whale), by Anwai Archit and Constantin Pape. Changed: converted to ONNX (the image encoder and the mask decoder separately). Licence: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/'],
];
for (const [name, text] of MODELS) items.push(`${'='.repeat(78)}
Model: ${name}
${'-'.repeat(78)}
${text}
`);
const head = `Third-party software in ${own.name}\n\nThe app is built with the open-source packages below; each is under its own licence, whose full text follows. At\nthe end: the Python libraries whose code parts of the app follow closely, with their notices, and the neural networks
served with the app (downloaded only when Segment anything is used).\nWhat is loaded only when a Python script runs (Pyodide, numpy, scipy, pandas, matplotlib …), the colour palettes\nand the example data are listed in THIRD_PARTY_NOTICES.md (in the project's sources).\n\n`;
writeFileSync(join(root, 'public', 'THIRD_PARTY_LICENSES.txt'), head + items.join('\n'));
console.log(`${items.length - FOLLOWED.length - MODELS.length} packages, ${FOLLOWED.length} followed libraries and ${MODELS.length} models written to public/THIRD_PARTY_LICENSES.txt`);
