// Bundled, so every system shows the same type: Instrument Sans for text, Bricolage Grotesque for the wordmark and titles.
import '@fontsource-variable/bricolage-grotesque/wght.css'
import '@fontsource-variable/instrument-sans/wght.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

// Errors in the window go to the diagnostics a problem or crash report can include (scrubbed, in memory only).
window.addEventListener('error', (e) => window.api.diag('error', `${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`))
window.addEventListener('unhandledrejection', (e) => window.api.diag('error', `unhandled: ${e.reason?.message ?? String(e.reason)}`))

document.documentElement.dataset.platform = window.api.platform

createRoot(document.getElementById('root')!).render(<App />)
