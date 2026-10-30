declare module 'hyperdht'
declare module 'hyperdht/testnet'
declare module 'hypercore-crypto'
declare module 'blind-relay'
declare module 'sodium-universal'
declare module '*.css'
declare module '*?inline' {
  const dataUrl: string
  export default dataUrl
}
declare module '*?raw' {
  const text: string
  export default text
}
// Build-time values electron-vite puts in the main process (MAIN_VITE_*, from .env.local or the environment)
interface ImportMeta {
  readonly env: Record<string, string | undefined>
}
