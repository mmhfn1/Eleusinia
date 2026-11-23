// The type (design/system/README.md), bundled so every system shows the same: Bodoni Moda for titles and sections,
// Alegreya Sans for everything else, Cascadia Mono for friend IDs, keys and codes. Their OFL licences ship in
// resources/licenses/fonts (package.json extraResources).
import '@fontsource-variable/bodoni-moda/standard.css'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import '@fontsource/cascadia-mono/500.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/shell.css'
import './styles/home.css'
import './styles/chat.css'
import './styles/server.css'
import './styles/call.css'
import './styles/profile.css'
import './styles/theme-fx.css'
import './styles/activity.css'
import './styles/settings.css'
import './styles/overlays.css'
import * as theme from './theme'

// Errors in the window go to the diagnostics a problem or crash report can include (scrubbed, in memory only).
window.addEventListener('error', (e) => window.api.diag('error', `${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`))
window.addEventListener('unhandledrejection', (e) => window.api.diag('error', `unhandled: ${e.reason?.message ?? String(e.reason)}`))

document.documentElement.dataset.platform = window.api.platform
theme.start()

createRoot(document.getElementById('root')!).render(<App />)
