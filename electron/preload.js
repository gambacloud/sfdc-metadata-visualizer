/**
 * electron/preload.js
 * Safely exposes IPC methods to the renderer (contextIsolation = true).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    pickZip:      ()        => ipcRenderer.invoke('pick-zip'),
    runParser:    (zipPath) => ipcRenderer.invoke('run-parser', zipPath),
    onParserLog:  (cb)      => ipcRenderer.on('parser-log', (_, msg) => cb(msg)),
    openExternal: (url)     => ipcRenderer.send('open-external', url),
});
