declare module 'hyperdht'
declare module 'hyperdht/testnet'
declare module 'hypercore-crypto'
declare module 'blind-relay'
declare module '*.css'
declare module '*?inline' {
  const dataUrl: string
  export default dataUrl
}
declare module '*?raw' {
  const text: string
  export default text
}
