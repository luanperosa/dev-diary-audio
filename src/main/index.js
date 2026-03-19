const { app, BrowserWindow, ipcMain } = require('electron/main')
const path = require('node:path')
const fs = require('node:fs')
const { exec } = require('node:child_process')
const { promisify } = require('node:util')
require('dotenv').config()

const execAsync = promisify(exec)

const OpenAIAdapter = require('./lib/api/openai-adapter')
const { getSystemPrompt, getUserPrompt } = require('./lib/prompts/diary-prompt')

function formatTimestamp(seconds) {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hrs > 0) {
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
    ipcMain.handle('ping', () => 'pong')

    ipcMain.handle('get-recording-path', () => {
        const recordingsDir = path.join(app.getPath('userData'), 'recordings')
        return recordingsDir
    })

    ipcMain.handle('append-audio-chunk', async (_event, arrayBuffer, sessionPath, filename) => {
        try {
            fs.mkdirSync(sessionPath, { recursive: true })

            const filePath = path.join(sessionPath, filename)
            const buffer = Buffer.from(arrayBuffer)

            fs.appendFileSync(filePath, buffer)

            const stats = fs.statSync(filePath)

            return {
                success: true,
                path: filePath,
                totalSize: stats.size
            }
        } catch (error) {
            console.error('Error appending audio chunk:', error)
            return {
                success: false,
                error: error.message
            }
        }
    })

    ipcMain.handle('check-ffmpeg', async () => {
        try {
            const { stdout } = await execAsync('ffmpeg -version')
            return {
                installed: true,
                version: stdout.split('\n')[0]
            }
        } catch (error) {
            return {
                installed: false,
                error: error.message
            }
        }
    })

    ipcMain.handle('check-whisper', async () => {
        try {
            const { stdout, stderr } = await execAsync('whisper --help')
            const output = stdout || stderr

            console.log('[check-whisper] Success - stdout length:', stdout?.length, 'stderr length:', stderr?.length)

            if (output.includes('usage: whisper')) {
                console.log('[check-whisper] Whisper detected as installed')
                return {
                    installed: true,
                    version: 'installed',
                    instructions: ''
                }
            }

            console.log('[check-whisper] Output does not contain "usage: whisper"')
            return {
                installed: false,
                error: 'Whisper command not found',
                instructions: 'Install Whisper with: pip install -U openai-whisper\nNote: ffmpeg is also required for Whisper to work properly.'
            }
        } catch (error) {
            console.log('[check-whisper] Error caught:', error.message)

            if (error.stdout?.includes('usage: whisper') || error.stderr?.includes('usage: whisper')) {
                console.log('[check-whisper] Whisper detected in error output')
                return {
                    installed: true,
                    version: 'installed',
                    instructions: ''
                }
            }

            return {
                installed: false,
                error: error.message,
                instructions: 'Install Whisper with: pip install -U openai-whisper\nNote: ffmpeg is also required for Whisper to work properly.'
            }
        }
    })

    ipcMain.handle('list-recordings', async () => {
        try {
            const recordingsDir = path.join(app.getPath('userData'), 'recordings')

            if (!fs.existsSync(recordingsDir)) {
                return { success: true, recordings: {} }
            }

            const dateDirs = fs.readdirSync(recordingsDir)
                .filter(item => {
                    const fullPath = path.join(recordingsDir, item)
                    return fs.statSync(fullPath).isDirectory()
                })
                .sort()
                .reverse()

            const recordings = {}

            for (const dateDir of dateDirs) {
                const datePath = path.join(recordingsDir, dateDir)
                const sessionDirs = fs.readdirSync(datePath)
                    .filter(item => {
                        const fullPath = path.join(datePath, item)
                        return fs.statSync(fullPath).isDirectory()
                    })
                    .sort()
                    .reverse()

                const sessions = []

                for (const sessionDir of sessionDirs) {
                    const sessionPath = path.join(datePath, sessionDir)
                    const files = fs.readdirSync(sessionPath)
                        .filter(file => file.endsWith('.webm'))

                    if (files.length > 0) {
                        const filePath = path.join(sessionPath, files[0])
                        const stats = fs.statSync(filePath)

                        sessions.push({
                            sessionName: sessionDir,
                            filename: files[0],
                            path: filePath,
                            size: stats.size,
                            modified: stats.mtime
                        })
                    }
                }

                const filesInDateFolder = fs.readdirSync(datePath)
                const txtFiles = filesInDateFolder.filter(file => file.endsWith('.txt'))

                let transcriptData = null
                let diaryData = null

                for (const txtFile of txtFiles) {
                    const txtPath = path.join(datePath, txtFile)
                    const txtContent = fs.readFileSync(txtPath, 'utf8')

                    if (txtFile === 'diary.txt') {
                        diaryData = {
                            path: txtPath,
                            content: txtContent,
                            filename: txtFile
                        }
                        console.log(`[list-recordings] Found diary for ${dateDir}`)
                    } else if (txtFile.startsWith('transcript-') || txtFile === 'transcript.txt') {
                        transcriptData = {
                            path: txtPath,
                            content: txtContent,
                            filename: txtFile
                        }
                        console.log(`[list-recordings] Found transcript for ${dateDir}: ${txtFile}`)
                    }
                }

                recordings[dateDir] = {
                    path: datePath,
                    sessions: sessions,
                    transcript: transcriptData,
                    diary: diaryData
                }
            }

            return { success: true, recordings }
        } catch (error) {
            console.error('Error listing recordings:', error)
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('remux-audio', async (_event, inputPath) => {
        return new Promise((resolve) => {
            const dir = path.dirname(inputPath)
            const ext = path.extname(inputPath)
            const basename = path.basename(inputPath, ext)
            const outputPath = path.join(dir, `${basename}-fixed${ext}`)

            const ffmpegCmd = `ffmpeg -i "${inputPath}" -c copy "${outputPath}" -y`

            console.log('Running ffmpeg remux:', ffmpegCmd)

            exec(ffmpegCmd, (error, _stdout, stderr) => {
                if (error) {
                    console.error('FFmpeg error:', error)
                    console.error('FFmpeg stderr:', stderr)
                    resolve({
                        success: false,
                        error: error.message,
                        stderr: stderr
                    })
                } else {
                    console.log('FFmpeg remux complete:', outputPath)

                    try {
                        fs.unlinkSync(inputPath)
                        fs.renameSync(outputPath, inputPath)
                        resolve({
                            success: true,
                            path: inputPath
                        })
                    } catch (fsError) {
                        resolve({
                            success: false,
                            error: fsError.message
                        })
                    }
                }
            })
        })
    })

    ipcMain.handle('transcribe-day', async (_event, dateString) => {
        try {
            const recordingsDir = path.join(app.getPath('userData'), 'recordings')
            const datePath = path.join(recordingsDir, dateString)

            if (!fs.existsSync(datePath)) {
                return {
                    success: false,
                    error: `No recordings found for ${dateString}`
                }
            }

            const sessionDirs = fs.readdirSync(datePath)
                .filter(item => {
                    const fullPath = path.join(datePath, item)
                    return fs.statSync(fullPath).isDirectory()
                })
                .sort()

            const audioFiles = []

            for (const sessionDir of sessionDirs) {
                const sessionPath = path.join(datePath, sessionDir)
                const files = fs.readdirSync(sessionPath)
                    .filter(file => file.endsWith('.webm'))
                    .map(file => ({
                        filename: file,
                        path: path.join(sessionPath, file),
                        session: sessionDir
                    }))

                audioFiles.push(...files)
            }

            if (audioFiles.length === 0) {
                return {
                    success: false,
                    error: `No audio files found for ${dateString}`
                }
            }

            console.log(`[transcribe-day] Found ${audioFiles.length} audio files for ${dateString}`)

            return {
                success: true,
                dateString,
                files: audioFiles,
                count: audioFiles.length
            }
        } catch (error) {
            console.error('[transcribe-day] Error:', error)
            return {
                success: false,
                error: error.message
            }
        }
    })

    ipcMain.handle('run-whisper-transcription', async (_event, audioFilePath) => {
        try {
            const audioDir = path.dirname(audioFilePath)
            const audioFileName = path.basename(audioFilePath)

            console.log(`[run-whisper-transcription] Starting transcription for: ${audioFileName}`)

            const whisperCmd = `whisper "${audioFilePath}" --model small --output_format json --output_dir "${audioDir}"`

            console.log(`[run-whisper-transcription] Command: ${whisperCmd}`)

            const { stderr } = await execAsync(whisperCmd, {
                maxBuffer: 10 * 1024 * 1024
            })

            console.log(`[run-whisper-transcription] Completed: ${audioFileName}`)

            const audioBaseName = path.basename(audioFilePath, path.extname(audioFilePath))
            const jsonOutputPath = path.join(audioDir, `${audioBaseName}.json`)

            if (!fs.existsSync(jsonOutputPath)) {
                return {
                    success: false,
                    error: 'Whisper completed but JSON output file not found',
                    stderr: stderr
                }
            }

            return {
                success: true,
                audioFile: audioFilePath,
                jsonFile: jsonOutputPath,
                stderr: stderr
            }
        } catch (error) {
            console.error('[run-whisper-transcription] Error:', error)
            return {
                success: false,
                error: error.message,
                stderr: error.stderr || ''
            }
        }
    })

    ipcMain.handle('merge-transcripts', async (_event, dateString) => {
        try {
            const recordingsDir = path.join(app.getPath('userData'), 'recordings')
            const datePath = path.join(recordingsDir, dateString)

            console.log(`[merge-transcripts] Merging transcripts for ${dateString}`)

            const sessionDirs = fs.readdirSync(datePath)
                .filter(item => {
                    const fullPath = path.join(datePath, item)
                    return fs.statSync(fullPath).isDirectory()
                })
                .sort()

            const allSegments = []

            for (const sessionDir of sessionDirs) {
                const sessionPath = path.join(datePath, sessionDir)
                const jsonFiles = fs.readdirSync(sessionPath)
                    .filter(file => file.endsWith('.json'))
                    .sort()

                for (const jsonFile of jsonFiles) {
                    const jsonPath = path.join(sessionPath, jsonFile)
                    const transcriptData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

                    if (transcriptData.segments) {
                        const segments = transcriptData.segments.map(seg => ({
                            ...seg,
                            sourceFile: jsonFile,
                            sourceSession: sessionDir
                        }))
                        allSegments.push(...segments)
                    }
                }
            }

            if (allSegments.length === 0) {
                return {
                    success: false,
                    error: 'No transcript segments found'
                }
            }

            let mergedText = `# Developer Diary Transcript - ${dateString}\n\n`

            let currentSession = null
            for (const segment of allSegments) {
                if (segment.sourceSession !== currentSession) {
                    currentSession = segment.sourceSession
                    mergedText += `\n## ${currentSession}\n\n`
                }

                const startTime = formatTimestamp(segment.start)
                mergedText += `[${startTime}] ${segment.text.trim()}\n`
            }

            const transcriptFileName = `transcript-${dateString}.txt`
            const transcriptPath = path.join(datePath, transcriptFileName)

            fs.writeFileSync(transcriptPath, mergedText, 'utf8')

            console.log(`[merge-transcripts] Saved merged transcript: ${transcriptPath}`)

            return {
                success: true,
                transcriptPath: transcriptPath,
                transcriptText: mergedText,
                segmentCount: allSegments.length
            }
        } catch (error) {
            console.error('[merge-transcripts] Error:', error)
            return {
                success: false,
                error: error.message
            }
        }
    })

    ipcMain.handle('generate-diary', async (_event, dayPath) => {
        try {
            console.log('[generate-diary] Starting for path:', dayPath)

            const filesInDayPath = fs.readdirSync(dayPath)
            const transcriptFile = filesInDayPath.find(file =>
                file.startsWith('transcript') && file.endsWith('.txt')
            )

            if (!transcriptFile) {
                return {
                    success: false,
                    error: 'Transcript file not found. Please transcribe the audio first.'
                }
            }

            const transcriptPath = path.join(dayPath, transcriptFile)
            if (!fs.existsSync(transcriptPath)) {
                return {
                    success: false,
                    error: 'Transcript file not found. Please transcribe the audio first.'
                }
            }

            const transcript = fs.readFileSync(transcriptPath, 'utf8')
            if (!transcript || transcript.trim().length === 0) {
                return {
                    success: false,
                    error: 'Transcript file is empty.'
                }
            }

            console.log('[generate-diary] Transcript loaded, length:', transcript.length)

            const adapter = new OpenAIAdapter()

            const validation = await adapter.validate()
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error
                }
            }

            console.log('[generate-diary] Calling OpenAI API...')

            const result = await adapter.generateDiary(transcript, {
                systemPrompt: getSystemPrompt(),
                userPrompt: getUserPrompt(transcript)
            })

            if (!result.success) {
                return result
            }

            console.log('[generate-diary] API call successful, saving to disk...')

            const diaryPath = path.join(dayPath, 'diary.txt')
            fs.writeFileSync(diaryPath, result.content, 'utf8')

            console.log('[generate-diary] Diary saved:', diaryPath)

            return {
                success: true,
                path: diaryPath,
                content: result.content
            }
        } catch (error) {
            console.error('[generate-diary] Error:', error)
            return {
                success: false,
                error: error.message || 'An unexpected error occurred while generating the diary.'
            }
        }
    })

    ipcMain.handle('read-diary', async (_event, dayPath) => {
        try {
            const diaryPath = path.join(dayPath, 'diary.txt')

            if (!fs.existsSync(diaryPath)) {
                return {
                    success: false,
                    error: 'Diary file not found.'
                }
            }

            const content = fs.readFileSync(diaryPath, 'utf8')

            return {
                success: true,
                path: diaryPath,
                content: content
            }
        } catch (error) {
            console.error('[read-diary] Error:', error)
            return {
                success: false,
                error: error.message
            }
        }
    })

    ipcMain.handle('check-diary-exists', async (_event, dayPath) => {
        try {
            const diaryPath = path.join(dayPath, 'diary.txt')
            const exists = fs.existsSync(diaryPath)

            return {
                success: true,
                exists: exists,
                path: diaryPath
            }
        } catch (error) {
            console.error('[check-diary-exists] Error:', error)
            return {
                success: false,
                exists: false,
                error: error.message
            }
        }
    })

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
