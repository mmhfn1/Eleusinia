import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/cormorant-garamond/latin-600.css'
import '@fontsource/cormorant-garamond/latin-500-italic.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

// Errors in the window go to the diagnostics a problem or crash report can include (scrubbed, in memory only).
window.addEventListener('error', (e) => window.api.diag('error', `${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`))
window.addEventListener('unhandledrejection', (e) => window.api.diag('error', `unhandled: ${e.reason?.message ?? String(e.reason)}`))

createRoot(document.getElementById('root')!).render(<App />)
