// Bundled, so every system shows the same type: Commissioner with all its axes (titles flare at their stroke ends).
import '@fontsource-variable/commissioner/full.css'
// Court's type (design/type-plan.md), bundled too: Bodoni Moda for titles and quiet labels, Alegreya Sans for text
import '@fontsource-variable/bodoni-moda/standard.css'
import '@fontsource-variable/bodoni-moda/standard-italic.css'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/400-italic.css'
import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'
import './hall.css'
import * as theme from './theme'

// Errors in the window go to the diagnostics a problem or crash report can include (scrubbed, in memory only).
window.addEventListener('error', (e) => window.api.diag('error', `${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`))
window.addEventListener('unhandledrejection', (e) => window.api.diag('error', `unhandled: ${e.reason?.message ?? String(e.reason)}`))

document.documentElement.dataset.platform = window.api.platform
theme.start()

createRoot(document.getElementById('root')!).render(<App />)
