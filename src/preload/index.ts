import { contextBridge, ipcRenderer } from 'electron'

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
  on(fn: (e: unknown) => void) {
    const h = (_: unknown, e: unknown) => fn(e)
    ipcRenderer.on('event', h)
    return () => ipcRenderer.off('event', h)
  },
})
