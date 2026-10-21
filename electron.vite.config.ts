import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  // .wasm as a plain asset, so the noise suppressor's model can be bundled inline (call.ts)
  renderer: { plugins: [react()], assetsInclude: ['**/*.wasm'] },
})
