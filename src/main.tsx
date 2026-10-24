import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppCrash, ErrorBoundary } from './ErrorBoundary.tsx'
import { UiProvider } from './ui/Provider.tsx'
import { notify } from './ui/dialogStore.ts'
import { STALE_TEXT } from './staleChunk.ts'
import { installQuickTips } from './ui/quickTip.ts'

// the hints (titles) in the app's own tooltip
installQuickTips()

// a part of the app that could not be loaded after a new version was published: said once (the nodes that need it say
// it too, with a button to reload)
let staleSaid = false
window.addEventListener('vite:preloadError', () => {
  if (!staleSaid) notify(STALE_TEXT, 'error')
  staleSaid = true
})

const root = document.getElementById('root')!
// #ui-lab: a page to try the new look of the panels (src/lab), loaded only there
if (location.hash === '#ui-lab') void import('./lab/UiLab.tsx').then(({ default: Lab }) => createRoot(root).render(<Lab />))
else
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary fallback={(e) => <AppCrash error={e} />}>
        <UiProvider>
          <App />
        </UiProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
