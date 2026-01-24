const { app, BrowserWindow, ipcMain } = require('electron/main')
const path = require('node:path')
const fs = require('node:fs')
const { exec } = require('node:child_process')
const { promisify } = require('node:util')

const execAsync = promisify(exec)

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
    ipcMain.handle('ping', () => 'pong')
    
    // Audio recording IPC handlers
    ipcMain.handle('get-recording-path', () => {
        const recordingsDir = path.join(app.getPath('userData'), 'recordings')
        return recordingsDir
    })
    
    ipcMain.handle('append-audio-chunk', async (event, arrayBuffer, sessionPath, filename) => {
        try {
            // Ensure session directory exists
            fs.mkdirSync(sessionPath, { recursive: true })
            
            const filePath = path.join(sessionPath, filename)
            const buffer = Buffer.from(arrayBuffer)
            
            // Append to file (creates file if doesn't exist)
            fs.appendFileSync(filePath, buffer)
            
            // Get current file size
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
    
    ipcMain.handle('list-recordings', async () => {
        try {
            const recordingsDir = path.join(app.getPath('userData'), 'recordings')
            
            // Check if recordings directory exists
            if (!fs.existsSync(recordingsDir)) {
                return { success: true, recordings: {} }
            }
            
            // Read all date directories
            const dateDirs = fs.readdirSync(recordingsDir)
                .filter(item => {
                    const fullPath = path.join(recordingsDir, item)
                    return fs.statSync(fullPath).isDirectory()
                })
                .sort()
                .reverse() // Most recent first
            
            const recordings = {}
            
            for (const dateDir of dateDirs) {
                const datePath = path.join(recordingsDir, dateDir)
                const sessionDirs = fs.readdirSync(datePath)
                    .filter(item => {
                        const fullPath = path.join(datePath, item)
                        return fs.statSync(fullPath).isDirectory()
                    })
                    .sort()
                    .reverse() // Most recent first
                
                recordings[dateDir] = []
                
                for (const sessionDir of sessionDirs) {
                    const sessionPath = path.join(datePath, sessionDir)
                    const files = fs.readdirSync(sessionPath)
                        .filter(file => file.endsWith('.webm'))
                    
                    if (files.length > 0) {
                        const filePath = path.join(sessionPath, files[0])
                        const stats = fs.statSync(filePath)
                        
                        recordings[dateDir].push({
                            sessionName: sessionDir,
                            filename: files[0],
                            path: filePath,
                            size: stats.size,
                            modified: stats.mtime
                        })
                    }
                }
            }
            
            return { success: true, recordings }
        } catch (error) {
            console.error('Error listing recordings:', error)
            return { success: false, error: error.message }
        }
    })
    
    ipcMain.handle('remux-audio', async (event, inputPath) => {
        return new Promise((resolve) => {
            // Create output path (same directory, add -fixed suffix)
            const dir = path.dirname(inputPath)
            const ext = path.extname(inputPath)
            const basename = path.basename(inputPath, ext)
            const outputPath = path.join(dir, `${basename}-fixed${ext}`)
            
            // Run ffmpeg to remux (fixes metadata without re-encoding)
            const ffmpegCmd = `ffmpeg -i "${inputPath}" -c copy "${outputPath}" -y`
            
            console.log('Running ffmpeg remux:', ffmpegCmd)
            
            exec(ffmpegCmd, (error, stdout, stderr) => {
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
                    
                    // Delete original file and rename fixed file
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