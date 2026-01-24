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
    checkWhisper: () => ipcRenderer.invoke('check-whisper'),
    listRecordings: () => ipcRenderer.invoke('list-recordings'),
    transcribeDay: (dateString) => ipcRenderer.invoke('transcribe-day', dateString),
    runWhisperTranscription: (audioFilePath) => ipcRenderer.invoke('run-whisper-transcription', audioFilePath),
    mergeTranscripts: (dateString) => ipcRenderer.invoke('merge-transcripts', dateString),
    // Diary generation API
    generateDiary: (dayPath) => ipcRenderer.invoke('generate-diary', dayPath),
    readDiary: (dayPath) => ipcRenderer.invoke('read-diary', dayPath),
    checkDiaryExists: (dayPath) => ipcRenderer.invoke('check-diary-exists', dayPath)
})