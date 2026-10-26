import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'

// https://vite.dev/config/
// base './': relative asset paths, so the build works from any folder of any static host (no server needed);
// ES-module workers (the filter design worker starts sub-workers of its own)
// mode 'lan' (npm run dev:lan): served to the local network over HTTPS (a certificate made here, accepted once in the
// other browser) — a page reached by its address must be secure for crypto.randomUUID, the clipboard … (to try working
// together between two computers)
// The engine of the neural networks (onnxruntime-web: Segment anything in Image analysis), its WebAssembly served as a
// file of its own (ort/…): fetched only when a network is first used, never bundled
const ORT_WASM = 'ort-wasm-simd-threaded.jsep.wasm'
const ortWasm = (): Plugin => ({
  name: 'ort-wasm',
  configureServer(server) {
    server.middlewares.use(`/ort/${ORT_WASM}`, (_req, res) => {
      res.setHeader('Content-Type', 'application/wasm')
      res.end(readFileSync(`node_modules/onnxruntime-web/dist/${ORT_WASM}`))
    })
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: `ort/${ORT_WASM}`, source: readFileSync(`node_modules/onnxruntime-web/dist/${ORT_WASM}`) })
  },
})

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ortWasm(), ...(mode === 'lan' ? [basicSsl({ name: 'sciplotflow-lan' })] : [])],
  // paper.js without its PaperScript part (for paperjs-offset too, which imports 'paper')
  resolve: { alias: [{ find: /^paper$/, replacement: 'paper/dist/paper-core.js' }] },
  // MathJax served as it is: the rare characters of its fonts come in files of their own that set up the font they
  // import, which must be the very font the app drew with (not a copy bundled for the development server)
  optimizeDeps: { exclude: ['@mathjax/src', '@mathjax/mathjax-fira-font', '@mathjax/mathjax-stix2-font', '@mathjax/mathjax-newcm-font'] },
  worker: { format: 'es' },
}))
