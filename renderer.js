// UI Elements
const recordBtn = document.getElementById('recordBtn')
const stopBtn = document.getElementById('stopBtn')
const statusElement = document.getElementById('recordingStatus')
const information = document.getElementById('info')
const recordingsList = document.getElementById('recordingsList')

// Display version info
information.innerText = `This app is using Chrome (v${versions.chrome()}), Node.js (v${versions.node()}), and Electron (v${versions.electron()})`

// Recording state
let isRecording = false
let mediaRecorder = null
let audioStream = null
let currentSessionPath = null
let currentFilename = null

// Get or create audio stream from microphone
async function getAudioStream() {
  if (audioStream) {
    return audioStream
  }
  
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,           // Mono (sufficient for speech)
        sampleRate: 44100,         // CD quality
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false     // Disabled to prevent automatic volume adjustment
      }
    })
    
    // Monitor stream track ending (microphone disconnect)
    audioStream.getTracks()[0].addEventListener('ended', () => {
      statusElement.innerText = 'Error: Microphone disconnected'
      stopRecording()
    })
    
    return audioStream
  } catch (error) {
    throw error
  }
}

// Setup MediaRecorder with event handlers
function setupMediaRecorder(stream) {
  // Determine best MIME type
  let mimeType = 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    mimeType = 'audio/webm;codecs=opus'
  }
  
  mediaRecorder = new MediaRecorder(stream, { mimeType })
  
  // Save each chunk immediately to disk as it arrives
  mediaRecorder.ondataavailable = async (event) => {
    if (event.data.size > 0) {
      try {
        const arrayBuffer = await event.data.arrayBuffer()
        
        // Append chunk to the same file
        const result = await window.audioAPI.appendAudioChunk(
          arrayBuffer,
          currentSessionPath,
          currentFilename
        )
        
        if (result.success) {
          console.log(`Chunk appended: ${event.data.size} bytes. Total: ${result.totalSize} bytes (${(result.totalSize / 1024 / 1024).toFixed(2)} MB)`)
        } else {
          console.error('Failed to append chunk:', result.error)
          statusElement.innerText = `Error: Failed to save chunk`
        }
      } catch (error) {
        console.error('Error processing chunk:', error)
      }
    }
  }
  
  // Handle recording stop
  mediaRecorder.onstop = async () => {
    console.log('Recording stopped.')
    
    const fullPath = `${currentSessionPath}/${currentFilename}`
    
    // Only remux if ffmpeg is available
    if (ffmpegAvailable) {
      statusElement.innerText = 'Processing audio with ffmpeg...'
      const result = await window.audioAPI.remuxAudio(fullPath)
      
      if (result.success) {
        statusElement.innerText = `Saved: ${result.path}`
        console.log('Audio processed successfully:', result.path)
      } else {
        statusElement.innerText = `Warning: Saved but ffmpeg failed (${result.error})`
        console.error('FFmpeg remux failed:', result.error)
      }
    } else {
      statusElement.innerText = `Saved (without ffmpeg): ${fullPath}`
      console.warn('⚠️ Audio saved but not processed (ffmpeg not available)')
      console.warn('File may not be seekable. Install ffmpeg to fix.')
    }
    
    // Reload recordings list
    loadRecordingsList()
  }
  
  // Handle errors
  mediaRecorder.onerror = (event) => {
    console.error('MediaRecorder error:', event.error)
    statusElement.innerText = `Error: ${event.error.name}`
    stopRecording()
  }
}

// Stop recording and cleanup
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  
  isRecording = false
  recordBtn.disabled = false
  stopBtn.disabled = true
}

// Cleanup audio stream
function cleanupAudioStream() {
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop())
    audioStream = null
  }
}

// Check ffmpeg availability on startup
let ffmpegAvailable = false

async function checkFfmpegAvailability() {
  const result = await window.audioAPI.checkFfmpeg()
  ffmpegAvailable = result.installed
  
  if (!result.installed) {
    console.warn('⚠️ ffmpeg not found. Audio files may not be seekable in media players.')
    console.warn('Install ffmpeg: sudo apt install ffmpeg')
    statusElement.innerText = 'Warning: ffmpeg not installed (audio may not be seekable)'
  } else {
    console.log('✓ ffmpeg detected:', result.version)
    statusElement.innerText = 'Ready'
  }
}

// Load and display recordings list
async function loadRecordingsList() {
  const result = await window.audioAPI.listRecordings()
  
  if (!result.success) {
    recordingsList.innerHTML = '<p>Error loading recordings</p>'
    return
  }
  
  const recordings = result.recordings
  const dates = Object.keys(recordings)
  
  if (dates.length === 0) {
    recordingsList.innerHTML = '<p>No recordings yet</p>'
    return
  }
  
  let html = ''
  
  for (const date of dates) {
    const sessions = recordings[date]
    
    if (sessions.length > 0) {
      html += `<br><hr><h2>${date}</h2>`
      
      for (const session of sessions) {
        const sizeInMB = (session.size / 1024 / 1024).toFixed(2)
        const time = session.sessionName.replace('session-', '')
        html += `<p>${time} - ${session.filename} (${sizeInMB} MB)</p>`
      }
    }
  }
  
  recordingsList.innerHTML = html
}

// Run checks and load data on startup
checkFfmpegAvailability()
loadRecordingsList()

// Record button handler
recordBtn.addEventListener('click', async () => {
  try {
    // Prevent double-start
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.warn('Already recording')
      return
    }
    
    // Create session directory path (timestamp-based)
    const baseDir = await window.audioAPI.getRecordingPath()
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
    currentSessionPath = `${baseDir}/${dateStr}/session-${timeStr}`
    currentFilename = 'recording.webm'
    
    // Get audio stream (requests permission if needed)
    statusElement.innerText = 'Requesting microphone access...'
    const stream = await getAudioStream()
    
    // Setup MediaRecorder
    setupMediaRecorder(stream)
    
    // Start recording with 60-second chunks (flushes to disk every minute)
    mediaRecorder.start(60000)
    
    // Update UI
    isRecording = true
    recordBtn.disabled = true
    stopBtn.disabled = false
    statusElement.innerText = 'Recording... (saving every 60s)'
    
    console.log('Recording started:', currentSessionPath)
  } catch (error) {
    // Handle permission and device errors
    let userMessage = 'Failed to start recording'
    
    if (error.name === 'NotAllowedError') {
      userMessage = 'Error: Microphone access denied'
    } else if (error.name === 'NotFoundError') {
      userMessage = 'Error: No microphone found'
    } else if (error.name === 'NotReadableError') {
      userMessage = 'Error: Microphone in use by another app'
    } else if (error.name === 'OverconstrainedError') {
      userMessage = 'Error: Audio constraints not supported'
    }
    
    statusElement.innerText = userMessage
    console.error('Recording error:', error)
    
    // Reset UI state
    recordBtn.disabled = false
    stopBtn.disabled = true
  }
})

// Stop button handler
stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    statusElement.innerText = 'Stopping...'
    stopRecording()
  }
})