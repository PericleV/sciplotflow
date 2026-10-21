import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppCrash, ErrorBoundary } from './ErrorBoundary.tsx'
import { UiProvider } from './ui/Provider.tsx'

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
