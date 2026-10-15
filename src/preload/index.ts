import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke('call', method, ...args),
  screens: () => ipcRenderer.invoke('screens'),
  chooseScreen: (id: string) => ipcRenderer.invoke('chooseScreen', id),
  on(fn: (e: unknown) => void) {
    const h = (_: unknown, e: unknown) => fn(e)
    ipcRenderer.on('event', h)
    return () => ipcRenderer.off('event', h)
  },
})
