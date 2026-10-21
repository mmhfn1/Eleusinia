import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// GIF search keys, baked into the build from the environment (the release workflow passes them from repository
// secrets). A provider without a key is simply not offered.
const gifKeys = Object.fromEntries(['GIPHY_KEY', 'KLIPY_KEY'].map((k) => [`process.env.${k}`, JSON.stringify(process.env[k] ?? '')]))

export default defineConfig({
  main: { define: gifKeys },
  preload: {},
  // .wasm as a plain asset, so the noise suppressor's model can be bundled inline (call.ts)
  renderer: { plugins: [react()], assetsInclude: ['**/*.wasm'] },
})
