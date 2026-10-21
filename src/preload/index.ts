import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke('call', method, ...args),
  screens: () => ipcRenderer.invoke('screens'),
  chooseScreen: (id: string, sound?: boolean) => ipcRenderer.invoke('chooseScreen', id, sound),
  recordHotkey: () => ipcRenderer.invoke('recordHotkey'),
  stopRecording: () => ipcRenderer.invoke('stopRecording'),
  isAdmin: () => ipcRenderer.invoke('isAdmin'),
  restartAsAdmin: () => ipcRenderer.invoke('restartAsAdmin'),
  diag: (area: string, text: string) => ipcRenderer.send('diag', area, text),
  diagnostics: () => ipcRenderer.invoke('diagnostics'),
  installUpdate: () => ipcRenderer.invoke('installUpdate'),
  // Shared files (see main/index.ts): attach takes { path } or { name, type, data } for pasted pictures.
  attach: (items: unknown[]) => ipcRenderer.invoke('attach', items),
  pickFiles: () => ipcRenderer.invoke('pickFiles'),
  saveFile: (h: string, name: string) => ipcRenderer.invoke('saveFile', h, name),
  showFile: (h: string) => ipcRenderer.invoke('showFile', h),
  pathOf: (file: File) => webUtils.getPathForFile(file), // a dropped file's path; empty for pasted ones
  gifProviders: () => ipcRenderer.invoke('gifProviders'),
  searchGifs: (p: string, q: string) => ipcRenderer.invoke('searchGifs', p, q),
  gifFile: (p: string, g: unknown) => ipcRenderer.invoke('gifFile', p, g),
  on(fn: (e: unknown) => void) {
    const h = (_: unknown, e: unknown) => fn(e)
    ipcRenderer.on('event', h)
    return () => ipcRenderer.off('event', h)
  },
})
