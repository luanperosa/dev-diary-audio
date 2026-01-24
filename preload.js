const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('versions', {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    ping: () => ipcRenderer.invoke('ping')
})

contextBridge.exposeInMainWorld('audioAPI', {
    getRecordingPath: () => ipcRenderer.invoke('get-recording-path'),
    appendAudioChunk: (arrayBuffer, sessionPath, filename) => 
        ipcRenderer.invoke('append-audio-chunk', arrayBuffer, sessionPath, filename),
    remuxAudio: (inputPath) => ipcRenderer.invoke('remux-audio', inputPath),
    checkFfmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
    listRecordings: () => ipcRenderer.invoke('list-recordings')
})